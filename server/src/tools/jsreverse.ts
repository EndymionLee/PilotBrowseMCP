/**
 * Website Capability Intelligence -- JS 逆向工具集
 */
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';
import { analyzeJs, mergeAnalyses } from '../jsreverse/analyzer.js';
import { traceAllSignatures } from '../jsreverse/dataflow.js';
import { associateRequest } from '../jsreverse/associate.js';
import { saveJsReport } from '../jsreverse/report.js';

const manualBase = () => process.env.MANUALS_DIR || 'website-manuals';

export function registerJsReverseTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'js_extract', {
    description: 'Collect JS files from the page (all frames, DOM + performance, including dynamically loaded JS), optionally supplementing from the network monitor cache. For lazily-loaded modules that never hit the DOM, run browser_start_network_monitor first, trigger the page action, then this will pull the JS source from the captured network requests. Parameters: tabId (required, from browser.list_tabs), useNetworkCache (optional, default true). Returns: files [{ url, size, source }] and inlineCount.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to collect JS from'),
      useNetworkCache: z.boolean().optional().default(true).describe('Also pull JS source from the network monitor cache (requires start_network_monitor + triggered requests)'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<any>('js_collect', { tabId: args.tabId });
    const files: { url: string; size: number; source: string }[] = r?.files ?? [];
    // 从网络监控缓存补充 JS（覆盖懒加载、DOM 移除、performance 未记录的）
    if (args.useNetworkCache !== false) {
      try {
        const search = await conn.sendRequest<any>('network_search', { tabId: args.tabId, mimeType: 'script', limit: 50 });
        const seen = new Set(files.map((f: any) => f.url));
        for (const req of search?.requests ?? []) {
          if (seen.has(req.url) || !/\.js(\?|#|$)/i.test(req.url)) continue;
          if (typeof req.response?.body === 'string' && req.response.body) {
            files.push({ url: req.url, size: req.response.body.length, source: req.response.body.slice(0, 500000) });
            seen.add(req.url);
          }
        }
      } catch {}
    }
    return JSON.stringify({ files, inlineCount: r?.inlineCount ?? 0 }, null, 2);
  });

  defineTool(server, conn, 'js_analyze', {
    description: 'Statically analyze JS source: extract API endpoints, functions (call graph), crypto usage, signature params, webpack detection. Parameters: source (required, JS code), url (optional, source label). Returns: endpoints/functions/crypto/signatures/webpack.',
    inputSchema: z.object({
      source: z.string().describe('JS source code to analyze'),
      url: z.string().optional().describe('Source label (file URL), default "inline"'),
    }),
  }, async (args) => {
    const a = analyzeJs((args as any).source, (args as any).url ?? 'inline');
    return JSON.stringify(a, null, 2);
  });

  defineTool(server, conn, 'js_find_function', {
    description: 'Locate a function in JS source by keyword. Returns the function (name/calls/confidence), its related crypto usage, and callers. Parameters: source (required), keyword (required, e.g. "sign" finds generateSign).',
    inputSchema: z.object({
      source: z.string().describe('JS source code'),
      keyword: z.string().describe('Keyword to search function names, e.g. "sign", "login", "encrypt"'),
    }),
  }, async (args) => {
    const a = analyzeJs(args.source, 'inline');
    const kw = args.keyword.toLowerCase();
    const fn = a.functions.find((f) => f.name.toLowerCase().includes(kw));
    const crypto = a.crypto.filter((c) => c.location === fn?.name);
    const callers = a.functions.filter((f) => f.calls.includes(fn?.name ?? ''));
    return JSON.stringify({ function: fn ?? null, crypto, callers }, null, 2);
  });

  defineTool(server, conn, 'js_trace_request', {
    description: 'Associate a captured network request\'s parameters with their JS generator functions. Parameters: requestId (required, from browser.network.search), source (required, the page JS source to analyze), site (optional). Returns: per-parameter source (function/user_input/builtin) with generator and evidence.',
    inputSchema: z.object({
      requestId: z.string().describe('Request ID from browser.network.search'),
      source: z.string().describe('Page JS source to analyze (from js_extract / js_analyze)'),
      site: z.string().optional().describe('Site directory name for report context'),
    }),
  }, async (args) => {
    const req = await conn.sendRequest<any>('network_get', { requestId: args.requestId });
    const a = analyzeJs(args.source, req?.url ?? 'inline');
    let body: Record<string, unknown> = {};
    try { body = req?.postData ? JSON.parse(req.postData) : {}; } catch {}
    const query: Record<string, unknown> = {};
    try { new URL(req?.url).searchParams.forEach((v, k) => { query[k] = v; }); } catch {}
    const sources = associateRequest(a, { ...query, ...body });
    return JSON.stringify({ url: req?.url, method: req?.method, sources }, null, 2);
  });

  defineTool(server, conn, 'js_capability_query', {
    description: 'Query learned capabilities from website-manuals/<site>/capabilities/. Returns capability models (endpoints, signature chains, parameter sources) without re-analyzing. Parameters: site (required), keyword (optional, filter by name/url).',
    inputSchema: z.object({
      site: z.string().describe('Site directory name'),
      keyword: z.string().optional().describe('Filter capabilities by keyword, e.g. "login"'),
    }),
  }, async (args) => {
    const base = path.resolve(manualBase(), args.site, 'capabilities');
    try {
      const index = JSON.parse(await fs.readFile(path.join(base, 'index.json'), 'utf-8'));
      const caps: { name: string; url: string; summary: string }[] = [];
      for (const c of index.capabilities ?? []) {
        if (args.keyword && !`${c.name} ${c.url}`.toLowerCase().includes(args.keyword.toLowerCase())) continue;
        try {
          const md = await fs.readFile(path.join(base, `${c.name}.md`), 'utf-8');
          caps.push({ name: c.name, url: c.url, summary: md.slice(0, 2000) });
        } catch {}
      }
      return JSON.stringify({ capabilities: caps }, null, 2);
    } catch {
      return JSON.stringify({ capabilities: [], message: 'No capabilities learned yet. Run js_reverse first.' }, null, 2);
    }
  });

  defineTool(server, conn, 'js_reverse', {
    description: 'Full JS reverse on the current page: collect JS → analyze (endpoints/crypto/signatures) → trace signature chains → save report to website-manuals/<site>/js/ + capabilities/. Parameters: site (required), tabId (required). Returns: report path and summary.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "example_com"'),
      tabId: z.number().describe('Tab ID to collect JS from'),
      manualBase: z.string().optional().describe('Manual base directory (testing)'),
    }),
  }, async (args) => {
    const collected = await conn.sendRequest<any>('js_collect', { tabId: args.tabId });
    const files: { url: string; source: string }[] = collected?.files ?? [];
    if (files.length === 0) return JSON.stringify({ message: 'No JS files found on this page', files: 0 }, null, 2);
    const analyses = files.map((f) => analyzeJs(f.source ?? '', f.url ?? ''));
    const merged = mergeAnalyses(analyses);
    const chains = traceAllSignatures(merged);
    const sources = associateRequest(merged, {});
    const base = await saveJsReport(args.site, files[0]?.url ?? '', merged, { chains, sources, manualBase: args.manualBase });
    return JSON.stringify({
      site: args.site,
      reportPath: `${base}/js/ + capabilities/`,
      files: files.length,
      endpoints: merged.endpoints.length,
      crypto: merged.crypto,
      signatures: merged.signatures,
    }, null, 2);
  });

  defineTool(server, conn, 'js_hook', {
    description: 'Inject a runtime hook into the page (MAIN world) that records fetch/XHR/CryptoJS calls with input/output. Use when static analysis fails on obfuscated/closure/dynamic code. After injecting, trigger the target action (e.g. browser_evaluate clicking a button), then call js_hook_collect. Parameters: tabId (required). Returns: confirmation.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to inject the hook into'),
    }),
  }, async (args) => {
    await conn.sendRequest('js_hook_inject', args);
    return JSON.stringify({ injected: true, message: 'Hook installed. Trigger the target action (click/login/play), then call js_hook_collect to read recorded crypto/fetch calls.' }, null, 2);
  });

  defineTool(server, conn, 'js_hook_collect', {
    description: 'Collect the hook log (fetch/xhr/crypto calls with input/output) recorded since js_hook was injected. This reveals which crypto function produced which output at runtime — the ground truth for obfuscated code. Parameters: tabId (required). Returns: log entries.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to collect hook log from'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<any>('js_hook_collect', args);
    return JSON.stringify(r ?? { count: 0, log: [] }, null, 2);
  });
}
