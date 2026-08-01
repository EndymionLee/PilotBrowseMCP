import fs from 'node:fs/promises';
import path from 'node:path';

export interface ReportResult {
  url: string; method: string; parameter: string;
  technique: string; confidence: 'high' | 'medium' | 'low';
  evidence: { payload: string; request: unknown; response_snippet: string; elapsed_ms: number };
  credentials: { redacted: boolean };
  suggestion: string;
  status: 'found' | 'failed';
  /** 攻击模式数据提取结果（databases/tables/columns/dump） */
  extract?: Record<string, unknown>;
}

export interface ScanReport {
  site: string;
  scannedAt: string;
  target: { url: string; fields: string[]; allowedOrigins: string[] };
  summary: { total: number; high: number; medium: number; failed: number };
  results: ReportResult[];
}

export function buildReport(
  site: string,
  targetUrl: string,
  fields: string[],
  allowedOrigins: string[],
  results: ReportResult[],
): ScanReport {
  let high = 0, medium = 0, failed = 0;
  for (const r of results) {
    if (r.status === 'failed') failed++;
    else if (r.confidence === 'high') high++;
    else if (r.confidence === 'medium') medium++;
  }
  return {
    site,
    scannedAt: new Date().toISOString(),
    target: { url: targetUrl, fields, allowedOrigins },
    summary: { total: results.length, high, medium, failed },
    results,
  };
}

function sanitizeSite(site: string): string {
  return site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
}

function mdCell(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

export async function saveReport(site: string, report: ScanReport, manualBase = process.env.MANUALS_DIR || 'website-manuals'): Promise<string> {
  const safeSite = sanitizeSite(site);
  const dir = path.join(manualBase, safeSite, 'security');
  await fs.mkdir(dir, { recursive: true });
  const date = report.scannedAt.slice(0, 10).replace(/-/g, '');
  const file = path.join(dir, `sqli-report-${date}.json`);
  await fs.writeFile(file, JSON.stringify(report, null, 2), 'utf-8');
  await updateReadme(dir, report);
  return file;
}

async function updateReadme(dir: string, report: ScanReport): Promise<void> {
  let content = '# Security Report\n\n网站安全检测索引。\n\n| URL | 方法 | 注入点 | 判定 | 置信度 | 日期 |\n|---|---|---|---|---|---|\n';
  for (const r of report.results) {
    content += `| ${mdCell(r.url)} | ${r.method} | ${mdCell(r.parameter)} | ${r.technique} | ${r.confidence} | ${report.scannedAt.slice(0, 10)} |\n`;
  }
  await fs.writeFile(path.join(dir, 'README.md'), content, 'utf-8');
}
