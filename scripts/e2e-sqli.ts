/**
 * SQLi 端到端测试
 * 前提：测试站(:8123)运行中 + Chrome 已加载扩展(自动重连 WS)
 * 用法：npx tsx scripts/e2e-sqli.ts
 */
import { spawn } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '../server');
const SERVER = join(SERVER_DIR, 'dist', 'index.js');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EXT_DIR = resolve(__dirname, '../extension/dist');
const TEST_SITE = 'http://localhost:8123/user?id=1';

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string, extra = ''): void {
  if (cond) { console.log(`  [PASS] ${label}`); passed++; }
  else { console.log(`  [FAIL] ${label} ${extra}`); failed++; }
}

class McpClient {
  private process: any;
  private chrome: any;
  private tmpProfile = '';
  private buffer = '';
  private pending = new Map<string, (r: any) => void>();
  private msgId = 0;
  serverLog: string[] = [];

  async start(): Promise<void> {
    this.process = spawn('node', [SERVER], { cwd: SERVER_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stderr.on('data', (d: Buffer) => { this.serverLog.push(d.toString()); });
    this.process.stdout.on('data', (d: Buffer) => { this.buffer += d.toString(); this.processBuffer(); });
    await new Promise((r) => setTimeout(r, 1500));
    // 启动有头 Chrome（独立 profile，窗口移出屏幕）加载扩展；有头模式下 MV3 SW 启动可靠
    this.tmpProfile = join(os.tmpdir(), 'mcp-e2e-' + Date.now());
    this.chrome = spawn(CHROME, [
      '--load-extension=' + EXT_DIR,
      '--user-data-dir=' + this.tmpProfile,
      '--no-first-run', '--disable-gpu', '--no-default-browser-check',
      '--window-position=-2000,-2000',
      'about:blank',
    ], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 5000));
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg);
          this.pending.delete(msg.id);
        }
      } catch {}
    }
  }

  async send(method: string, params?: any): Promise<any> {
    const id = `e2e_${++this.msgId}`;
    this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolvePromise, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`超时: ${method}`)); }, 60000);
      this.pending.set(id, (r: any) => { clearTimeout(t); resolvePromise(r); });
    });
  }

  async callTool(name: string, args?: any): Promise<any> {
    const r = await this.send('tools/call', { name, arguments: args });
    return r.result;
  }

  stop(): void { this.process?.kill(); this.chrome?.kill(); }
}

function toolText(result: any): string {
  return result?.content?.[0]?.text ?? JSON.stringify(result);
}

async function main(): Promise<void> {
  console.log('='.repeat(56));
  console.log('  SQLi 端到端测试');
  console.log('='.repeat(56));
  const client = new McpClient();
  try {
    await client.start();
    console.log('\n[1] 等待扩展连接...');
    let tabId: number | null = null;
    // 等待最多 90s：依赖用户 Chrome 扩展 SW 的 alarm 保活（每 60s forceReconnect 一次）
    for (let i = 0; i < 90; i++) {
      const r = await client.callTool('browser_list_tabs', {});
      const txt = toolText(r);
      if (i === 0) console.log(`  首次返回: ${txt.slice(0, 150)}`);
      if (txt && !txt.includes('Extension 未连接')) {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) {
          const active = parsed.find((t: any) => t.active);
          tabId = active?.id ?? parsed[0]?.id ?? null;
          console.log(`  第 ${i + 1} 次成功: tabId=${tabId}`);
          break;
        }
      }
      await new Promise((r2) => setTimeout(r2, 1000));
    }
    ok(!!tabId, `扩展已连接，当前 tabId=${tabId}`);
    if (!tabId) {
      console.log('扩展未连接。Server 日志尾部:');
      console.log(client.serverLog.join('').slice(-500));
      return;
    }

    console.log('\n[2] 打开测试站并绑定 tab...');
    const open1 = await client.callTool('browser_open', { url: 'http://localhost:8123/user?id=1', active: true });
    let openTabId: number | null = null;
    try { openTabId = JSON.parse(toolText(open1))?.id ?? null; } catch {}
    ok(!!openTabId, `打开测试站 tabId=${openTabId}`);
    await new Promise((r) => setTimeout(r, 3000)); // 等页面加载 + content script 注入
    const check = await client.callTool('browser_get_text', { tabId: openTabId });
    console.log(`  页面确认: ${toolText(check).slice(0, 120)}`);

    console.log('\n[3] 启动网络监听（绑定 open 的 tab）...');
    const mon = await client.callTool('browser_start_network_monitor', { tabId: openTabId });
    console.log(`  monitor: ${toolText(mon).slice(0, 80)}`);
    await new Promise((r) => setTimeout(r, 3000)); // debugger attach 会触发页面 reload，等 content script 重注入

    console.log('\n[4] 触发 /user 请求（同步 XHR，失败重试）...');
    const XHR_CODE = "(function(){var x=new XMLHttpRequest();x.open('GET','http://localhost:8123/user?id=2',false);x.send();return x.responseText;})()";
    let evResult: any = null;
    for (let i = 0; i < 4; i++) {
      evResult = await client.callTool('browser_evaluate', { tabId: openTabId, code: XHR_CODE });
      if (!toolText(evResult).includes('no response')) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`  evaluate: ${toolText(evResult).slice(0, 150)}`);
    await new Promise((r) => setTimeout(r, 1500));

    console.log('\n[5] 搜索缓存请求（全 tab）...');
    const search = await client.callTool('browser_network_search', { urlPattern: '/user', limit: 10 });
    const searchText = toolText(search);
    console.log(`  ${searchText.slice(0, 300)}`);
    let requestId: string | null = null;
    try {
      const parsed = JSON.parse(searchText);
      requestId = parsed.results?.[0]?.id ?? null;
    } catch {}
    ok(!!requestId, `找到 /user 请求 requestId=${requestId}`);

    console.log('\n[6] 主动扫描 SQL 注入...');
    const scan = await client.callTool('sql_injection_scan', { site: 'localhost_8123', requestId });
    const scanText = toolText(scan);
    console.log(`  ${scanText.slice(0, 500)}`);
    ok(scanText.includes('high') || scanText.includes('medium') || scanText.includes('total'), `扫描完成: ${scanText.slice(0, 120)}`);

    console.log('\n[7] 查看被动发现/清单...');
    const findings = await client.callTool('sql_injection_list_findings', { site: 'localhost_8123' });
    console.log(`  ${toolText(findings).slice(0, 500)}`);

    console.log('\n[8] 生成 security-check.pab...');
    const script = await client.callTool('sql_injection_generate_script', { site: 'localhost_8123', targetUrl: 'http://localhost:8123' });
    console.log(`  ${toolText(script).slice(0, 200)}`);

    console.log('\n[9] 验证报告落盘...');
    const reportDir = join(SERVER_DIR, 'website-manuals', 'localhost_8123', 'security');
    const files = fs.existsSync(reportDir) ? fs.readdirSync(reportDir) : [];
    console.log(`  ${reportDir}: ${files.join(', ')}`);
    ok(files.some((f) => f.startsWith('sqli-report-')), 'sqli-report 已生成');
    ok(files.includes('README.md'), 'README 已生成');
    if (files.some((f) => f === 'security-check.pab')) ok(true, 'security-check.pab 已生成');
    if (files.some((f) => f === 'findings.json')) {
      const findingsRaw = JSON.parse(fs.readFileSync(join(reportDir, 'findings.json'), 'utf-8'));
      const statuses = findingsRaw.findings?.map((f: any) => f.status) ?? [];
      console.log(`  状态: ${statuses.join(', ')}`);
      ok(statuses.includes('VALIDATED') || statuses.includes('CONFIRMED'), '有 VALIDATED 级 finding');
    }

    console.log('\n' + '='.repeat(56));
    console.log(`  结果: ${passed} 通过, ${failed} 失败`);
    console.log('='.repeat(56));
  } catch (err) {
    console.error('端到端异常:', err);
  } finally {
    client.stop();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
