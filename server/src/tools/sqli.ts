import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';
import { logger } from '../lib/logger.js';
import { Scanner } from '../security/scanner.js';
import { FindingStore, type FindingStatus } from '../security/finding-store.js';
import { manualSecurityDir } from '../security/site.js';
import { generateSecurityCheckPab } from '../security/pab-gen.js';

let activeScanner: Scanner | null = null;
const manualBase = () => process.env.MANUALS_DIR || 'website-manuals';

const summarize = (f: any) => ({ id: f.id, status: f.status, url: f.url, method: f.method, parameter: f.parameter, confidence: f.confidence, firstSeen: f.firstSeen, lastSeen: f.lastSeen, validations: f.validations.length });

async function listAllFindings(site?: string): Promise<{ site: string; findings: any[] }[]> {
  const out: { site: string; findings: any[] }[] = [];
  if (site) {
    const store = new FindingStore(manualSecurityDir(site));
    out.push({ site, findings: (await store.list()).map(summarize) });
    return out;
  }
  try {
    const base = path.resolve(manualBase());
    const sites = await fs.readdir(base);
    for (const s of sites) {
      try {
        const store = new FindingStore(path.join(base, s, 'security'));
        const findings = (await store.list()).map(summarize);
        if (findings.length) out.push({ site: s, findings });
      } catch {}
    }
  } catch {}
  return out;
}

export function registerSqliTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'sql_injection_list_findings', {
    description: 'List SQL injection findings from the site security checklist. Findings carry lifecycle status (SUSPECT/VALIDATED/CONFIRMED/FIXED/false_positive). Parameters: site (optional, string, site directory name, e.g. "example_com"). Returns: array of {site, findings[]} with id, status, url, method, parameter, confidence.',
    inputSchema: z.object({
      site: z.string().optional().describe('Site directory name. Omit to search all sites'),
    }),
  }, async (args) => listAllFindings((args as any).site));

  defineTool(server, conn, 'sql_injection_get_finding', {
    description: 'Get full details of a single finding, including validation history. Parameters: site (required), id (required, from list_findings). Returns: full finding object.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name'),
      id: z.string().describe('Finding id from sql_injection.list_findings'),
    }),
  }, async (args) => {
    const { site, id } = args as any;
    const store = new FindingStore(manualSecurityDir(site));
    const f = await store.get(id);
    if (!f) throw new Error(`Finding not found: ${id}`);
    return f;
  });

  defineTool(server, conn, 'sql_injection_scan', {
    description: 'Actively scan a cached network request for SQL injection. Runs in browser context with full cookies via network_replay. Tests error/boolean/time based payloads on discovered parameters, respects Scope Lock, saves a report to website-manuals/<site>/security/ and upgrades findings to VALIDATED. Requires a cached requestId: run browser_start_network_monitor first and trigger the target request. Parameters: site (required), requestId (required, from browser.network.search), fields (optional, specific parameters), allowedOrigins (optional, scope boundary; defaults to target origin), findingId (optional, upgrade this finding to VALIDATED on hit). Returns: scan summary with report path. 若目标 finding 已处于 CONFIRMED/FIXED，状态升级可能不生效（非法转移被拒）。',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "example_com"'),
      requestId: z.string().optional().describe('Cached request ID from browser.network.search (verification mode, replay cached request)'),
      url: z.string().optional().describe('Target URL for direct attack scanning (aggressive mode; mutually exclusive with requestId)'),
      method: z.string().optional().describe('HTTP method for URL direct scan, default GET'),
      fields: z.array(z.string()).optional().describe('Parameters to test. Auto-discovered (query/form/JSON/Cookie) if omitted'),
      allowedOrigins: z.array(z.string()).optional().describe('Scope Lock: if provided, only these origins are scanned (full boundary). Defaults to target origin'),
      findingId: z.string().optional().describe('Upgrade this finding to VALIDATED on hit'),
      technique: z.array(z.enum(['error_based', 'boolean', 'time', 'union', 'stacked'])).optional().describe('Injection techniques to test. Default all'),
      tamper: z.boolean().optional().describe('Enable WAF bypass (payload tampering), default true'),
      extract: z.enum(['meta', 'structure', 'dump']).optional().describe('Data extraction depth. Default "structure" (databases/tables/columns); "dump" also extracts data rows'),
      dumpLimit: z.number().optional().describe('Max data rows to dump, default 20'),
    }),
  }, async (args) => {
    // 攻击性扫描需显式授权（扩展弹窗开启 sql_injection 权限）
    const perms = await conn.sendRequest<{ granted: string[] }>('permissions_list');
    if (!perms?.granted?.includes('sql_injection')) {
      throw new Error('需要授权：请在扩展弹窗开启"SQL 注入扫描"权限后再发起攻击性扫描');
    }
    if (activeScanner) throw new Error('A scan is already in progress. Stop it first or wait.');
    const scanner = new Scanner(conn);
    activeScanner = scanner;
    try {
      const { report } = await scanner.run(args as any);
      const summary = report.summary;
      const successful = summary.total - summary.failed;
      const warnings: string[] = [];
      if (summary.failed > 0) {
        warnings.push(`有 ${summary.failed} 个参数重放失败（replay failed，基线请求未成功），扫描未完整执行，结果不能作为"未发现注入"的依据`);
      }
      if (successful === 0) {
        warnings.push('无有效测试结果：参数未进入测试循环或全部被跳过（total=0），扫描未执行，结果不能作为"未发现注入"的依据');
      }
      return JSON.stringify({
        summary,
        findingsCount: successful,
        reportPath: `website-manuals/${report.site}/security/`,
        ...(warnings.length ? { warnings } : {}),
      }, null, 2);
    } finally {
      if (activeScanner === scanner) activeScanner = null;
    }
  });

  defineTool(server, conn, 'sql_injection_request', {
    description: 'Send a custom SQL injection payload to a target parameter and get an automatic verdict (error/union/time/boolean) with optional data extraction. For writing your own injection statements directly instead of using the built-in scan payload set. Parameters: site (required), requestId or url (one required), param (required, the parameter to inject), payload (required, your SQL injection statement), extract (optional: meta|structure|dump, extracts via blind injection), dumpLimit. Returns: hit/technique/confidence, evidence, extract data, finding. Requires the "SQL Injection Scan" permission in the extension popup.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "example_com"'),
      requestId: z.string().optional().describe('Cached request ID from browser.network.search (verification mode)'),
      url: z.string().optional().describe('Target URL for direct scan (mutually exclusive with requestId)'),
      method: z.string().optional().describe('HTTP method for URL direct scan, default GET'),
      param: z.string().describe('Parameter to inject, e.g. "id"'),
      payload: z.string().describe('Your SQL injection payload, e.g. "1\' AND 1=1-- "'),
      allowedOrigins: z.array(z.string()).optional().describe('Scope Lock: if provided, only these origins are scanned (full boundary)'),
      findingId: z.string().optional().describe('Upgrade this finding to VALIDATED on hit'),
      extract: z.enum(['meta', 'structure', 'dump']).optional().describe('Data extraction depth via blind injection (meta/structure/dump)'),
      dumpLimit: z.number().optional().describe('Max data rows to dump, default 20'),
    }),
  }, async (args) => {
    const perms = await conn.sendRequest<{ granted: string[] }>('permissions_list');
    if (!perms?.granted?.includes('sql_injection')) {
      throw new Error('需要授权：请在扩展弹窗开启"SQL 注入扫描"权限');
    }
    const scanner = new Scanner(conn);
    const result = await scanner.requestProbe(args as any);
    return JSON.stringify(result, null, 2);
  });

  defineTool(server, conn, 'sql_injection_stop', {
    description: 'Abort the in-progress SQL injection scan. Parameters: none. Returns: confirmation.',
    inputSchema: z.object({}),
  }, async () => {
    activeScanner?.abort();
    return 'Scan stop requested';
  });

  defineTool(server, conn, 'sql_injection_update_finding', {
    description: 'Advance a finding through its lifecycle: VALIDATED -> CONFIRMED, CONFIRMED -> FIXED, FIXED -> SUSPECT (reopen), or mark false_positive to discard. Parameters: site (required), id (required), status (required, VALIDATED|CONFIRMED|FIXED|SUSPECT|false_positive). Illegal transitions are rejected. Returns: updated finding.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name'),
      id: z.string().describe('Finding id'),
      status: z.enum(['VALIDATED', 'CONFIRMED', 'FIXED', 'SUSPECT', 'false_positive']).describe('Target status'),
    }),
  }, async (args) => {
    const { site, id, status } = args as any;
    const store = new FindingStore(manualSecurityDir(site));
    const f = await store.updateStatus(id, status as FindingStatus);
    return f;
  });

  defineTool(server, conn, 'sql_injection_generate_script', {
    description: 'Generate a security-check.pab script from the site\'s CONFIRMED/VALIDATED findings. The script runs in the extension popup without LLM and re-checks injection points via synchronous XHR in browser context. Parameters: site (required), targetUrl (optional, base URL, default https://<site>.com). Returns: script path.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name'),
      targetUrl: z.string().optional().describe('Base URL embedded in the script'),
    }),
  }, async (args) => {
    const { site, targetUrl } = args as any;
    const store = new FindingStore(manualSecurityDir(site));
    const findings = await store.list();
    if (!findings.some((f) => f.status === 'CONFIRMED' || f.status === 'VALIDATED')) {
      throw new Error('No CONFIRMED/VALIDATED findings to generate script from');
    }
    const firstUrl = findings.find((f) => f.status === 'CONFIRMED' || f.status === 'VALIDATED')?.url;
    const base = targetUrl || (firstUrl ? new URL(firstUrl).origin : `https://${site}.com`);
    const pab = generateSecurityCheckPab(site, findings, base);
    const scriptsDir = path.resolve(manualBase(), site, 'security');
    await fs.mkdir(scriptsDir, { recursive: true });
    const file = path.join(scriptsDir, 'security-check.pab');
    await fs.writeFile(file, pab, 'utf-8');
    logger.info('Workflow', 'PAB security script generated', { site, path: file });
    return `Generated: website-manuals/${site}/security/security-check.pab`;
  });
}
