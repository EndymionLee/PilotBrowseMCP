/**
 * JS 逆向报告沉淀
 *
 * website-manuals/<site>/js/
 *   functions.json     # 函数索引
 *   crypto.json        # 加密算法/签名
 * website-manuals/<site>/capabilities/
 *   <cap>.md           # 能力模型（API + 参数来源 + 算法 + 生成函数）
 *   index.json         # 能力索引
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { JsAnalysis } from './analyzer.js';
import type { SourceChain } from './dataflow.js';
import type { ParamSource } from './associate.js';

function capabilityName(url: string): string {
  try {
    const u = new URL(url);
    const name = u.pathname.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '');
    return name || 'page';
  } catch {
    return 'page';
  }
}

function buildCapabilityMd(url: string, analysis: JsAnalysis, chains: SourceChain[], sources: ParamSource[]): string {
  const cap = capabilityName(url);
  let md = `# Capability: ${cap}\n\n> 来源 JS: \`${analysis.url}\`\n\n`;
  md += '## Endpoints\n\n';
  for (const ep of analysis.endpoints) {
    md += `- \`${ep.method ?? 'GET'}\` ${ep.url} (source: ${ep.source})\n`;
  }
  md += '\n## Signature Chains\n\n';
  if (chains.length === 0) {
    md += '_未检测到签名参数_\n';
  } else {
    for (const c of chains) {
      md += `- **${c.param}** ← ${c.chain.map((s) => s.step).join(' ← ')}\n`;
    }
  }
  if (sources.length > 0) {
    md += '\n## Parameter Sources\n\n| param | source | generator | evidence |\n|---|---|---|---|\n';
    for (const s of sources) {
      md += `| ${s.param} | ${s.source} | ${s.generator} | ${s.evidence} |\n`;
    }
  }
  md += '\n## Crypto\n\n';
  if (analysis.crypto.length === 0) {
    md += '_未检测到加密逻辑_\n';
  } else {
    for (const c of analysis.crypto) md += `- ${c.algorithm} @ ${c.location}\n`;
  }

  md += '\n## Algorithm Pipeline\n\n';
  if (analysis.pipelines.length === 0) {
    md += '_未检测到加密管线_\n';
  } else {
    for (const p of analysis.pipelines) {
      md += `- **${p.function}**\n`;
      for (const s of p.steps) md += `  - ${s.operation} (keySource: ${s.keySource})\n`;
    }
  }

  if (analysis.constants.length > 0) {
    md += '\n## Constants\n\n';
    for (const k of analysis.constants) md += `- ${k.name} = \`${k.value}\`\n`;
  }

  if (analysis.transformers.length > 0) {
    md += '\n## Request Transformers\n\n';
    for (const t of analysis.transformers) md += `- ${t.name} (function: ${t.function})\n`;
  }

  md += `\n## Webpack\n\n- detected: ${analysis.webpack.detected}, modules: ${analysis.webpack.modules}\n`;
  return md;
}

export interface JsReportOptions {
  chains: SourceChain[];
  sources: ParamSource[];
  manualBase?: string;
}

export async function saveJsReport(
  site: string,
  url: string,
  analysis: JsAnalysis,
  opts: JsReportOptions,
): Promise<string> {
  const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
  const base = path.resolve(opts.manualBase ?? process.env.MANUALS_DIR ?? 'website-manuals');
  const jsDir = path.join(base, safeSite, 'js');
  const capDir = path.join(base, safeSite, 'capabilities');
  await fs.mkdir(jsDir, { recursive: true });
  await fs.mkdir(capDir, { recursive: true });

  await fs.writeFile(path.join(jsDir, 'functions.json'), JSON.stringify({ url, functions: analysis.functions }, null, 2), 'utf-8');
  await fs.writeFile(path.join(jsDir, 'crypto.json'), JSON.stringify({ url, crypto: analysis.crypto, signatures: analysis.signatures }, null, 2), 'utf-8');

  const cap = capabilityName(url);
  const md = buildCapabilityMd(url, analysis, opts.chains, opts.sources);
  await fs.writeFile(path.join(capDir, `${cap}.md`), md, 'utf-8');

  // 能力索引（追加，去重）
  const indexFile = path.join(capDir, 'index.json');
  let index: { capabilities: { name: string; url: string }[] } = { capabilities: [] };
  try {
    index = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
  } catch {}
  if (!index.capabilities.some((c) => c.url === url)) {
    index.capabilities.push({ name: cap, url });
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf-8');
  }

  return path.join(base, safeSite);
}
