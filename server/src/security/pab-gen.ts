import type { Finding } from './finding-store.js';

const PROBE_PAYLOAD = "1' OR '1'='1";
const FEATURES = ['SQL syntax', 'ORA-', 'Unclosed quotation'];

/** PAB 双引号字符串字面量：转义反斜杠和双引号 */
function pabString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** URL 编码并额外转义单引号，确保可安全嵌入 JS 单引号字符串字面量 */
function encodeComponent(s: string): string {
  return encodeURIComponent(s).replace(/'/g, '%27');
}

export function generateSecurityCheckPab(site: string, findings: Finding[], targetUrl: string): string {
  const confirmed = findings.filter((f) => f.status === 'CONFIRMED' || f.status === 'VALIDATED');
  const date = new Date().toISOString().slice(0, 10);

  let pab = `# security-check.pab for ${site} (generated ${date})\n`;
  pab += `input site default="${targetUrl}"\n\n`;
  pab += `tab = browser_open(site)\n`;
  pab += `browser_wait(2000)\n`;

  // 每条 finding 生成一个内联代码块：URL 与 payload 在生成期内联，
  // 避免 PAB 运行时的字符串拼接与 or 运算符。
  for (const f of confirmed) {
    let origin = '';
    let path = '/';
    try {
      const u = new URL(f.url);
      origin = u.origin;
      path = u.pathname;
    } catch {}
    const sep = path.includes('?') ? '&' : '?';
    const fullUrl = `${origin}${path}${sep}${encodeComponent(f.parameter)}=${encodeComponent(PROBE_PAYLOAD)}`;
    const js = `(function(){var x=new XMLHttpRequest();x.open('GET','${fullUrl}',false);x.send();return x.responseText;})()`;
    pab += `\nbody = browser_evaluate(${pabString(js)})\n`;
    pab += `vuln = false\n`;
    for (const feat of FEATURES) {
      pab += `if ${pabString(feat)} in body:\n    vuln = true\n`;
    }
    pab += `if vuln:\n    print("[VULN]", ${pabString(path)}, ${pabString(f.parameter)})\n`;
    pab += `else:\n    print("[OK]", ${pabString(path)}, ${pabString(f.parameter)})\n`;
  }
  return pab;
}
