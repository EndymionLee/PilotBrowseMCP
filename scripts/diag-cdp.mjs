// CDP 诊断：attach popup，检查扩展加载 + 触发 SW 启动
const PORT = process.env.CDP_PORT ?? '9223';
const list = async () => (await (await fetch(`http://localhost:${PORT}/json/list`)).json());
const targets = await list();
for (const t of targets) console.log(`  ${t.type} | ${t.url.slice(0, 80)}`);
const popup = targets.find((t) => t.type === 'page' && t.url.includes('popup'));
if (!popup) { console.log('NO popup target'); process.exit(0); }

const ws = new WebSocket(popup.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    console.log('[popup console]', m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable');
const manifest = await send('Runtime.evaluate', { expression: `JSON.stringify(chrome.runtime.getManifest())`, returnByValue: true });
console.log('\nManifest:', JSON.stringify(manifest.result?.result?.value).slice(0, 300));
// 触发 SW：发消息（onMessage 会唤醒 SW）
await send('Runtime.evaluate', { expression: `chrome.runtime.sendMessage({ source: 'diag', type: 'ping' }, () => {})` });
console.log('sendMessage 已发送，等待 SW 启动...');
await new Promise((r) => setTimeout(r, 4000));
ws.close();
console.log('\n=== 再次列出 targets ===');
for (const t of await list()) console.log(`  ${t.type} | ${t.url.slice(0, 80)}`);
