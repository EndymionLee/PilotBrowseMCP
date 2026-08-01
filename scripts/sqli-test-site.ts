// scripts/sqli-test-site.ts
// 模拟 SQL 注入漏洞站（零依赖，Node 原生 http）。启动：npx tsx scripts/sqli-test-site.ts
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8123);

// 简单 HTML 差异：正常返回空列表，注入命中返回多行
const itemsHtml = (count: number) => `<html><body><h1>Results</h1>${Array.from({ length: count }, (_, i) => `<p>item-${i}</p>`).join('')}</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost');

  // 1) 报错注入 + 布尔注入 + union 攻击: GET /user?id=1
  if (url.pathname === '/user') {
    const id = url.searchParams.get('id') ?? '';
    // union 列数探测：ORDER BY N≤3 正常，N≥4 报错（模拟 3 列）
    const orderMatch = id.match(/ORDER BY (\d+)/);
    if (orderMatch) {
      const n = Number(orderMatch[1]);
      if (n > 3) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end("You have an error in your SQL syntax near 'ORDER BY 4'");
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(itemsHtml(0));
      }
      return;
    }
    // union 回显：含 UNION SELECT 时第 2 列回显 VAULN 标记
    if (/UNION SELECT/i.test(id)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Results</h1><p>VAULN</p></body></html>');
      return;
    }
    if (id.includes("'")) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end("You have an error in your SQL syntax near '" + id.slice(0, 30) + "'");
      return;
    }
    // 模拟布尔：恒真（1=1）返回 5 行，其他返回 0 行
    const count = /1\s*=\s*1/.test(id) ? 5 : 0;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(itemsHtml(count));
    return;
  }

  // 2) 时间盲注: GET /delay?id=1 含 SLEEP 则延迟 3s
  if (url.pathname === '/delay') {
    const id = url.searchParams.get('id') ?? '';
    if (/SLEEP\(3\)/i.test(id)) {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('delayed'); }, 3000);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('fast');
    return;
  }

  // JS 逆向场景: 前端用 md5 生成 sign 调用 /api/login
  if (url.pathname === '/signed') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><title>Signed Demo</title></head><body>
<script>
function md5(s) { return "md5:" + s; }
function generateSign(token, timestamp) {
  var sign = md5(token + "|" + timestamp);
  return sign;
}
function login() {
  var timestamp = Date.now();
  var token = "secret_token";
  var sign = generateSign(token, timestamp);
  return fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "123456", timestamp: timestamp, sign: sign })
  });
}
</script>
<button onclick="login().then(r=>r.text()).then(t=>document.getElementById('out').textContent=t)">Login</button>
<div id="out"></div>
</body></html>`);
    return;
  }

  // JS 逆向场景后端: 校验前端生成的 sign
  if (url.pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let data: any = {};
      try { data = JSON.parse(body); } catch {}
      const { timestamp, sign } = data;
      // 与前端 generateSign 相同算法校验
      const expected = timestamp ? `md5:secret_token|${timestamp}` : '';
      const valid = sign === expected;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, sign_valid: valid, username: data.username ?? '' }));
    });
    return;
  }

  // 3) JSON body 布尔: POST /search {q}
  if (url.pathname === '/search' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let q = '';
      try { q = JSON.parse(body).q ?? ''; } catch {}
      const count = q.includes("'1'='1") ? 4 : 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: Array.from({ length: count }, (_, i) => ({ id: i })) }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
});

server.listen(PORT, () => console.log(`[test-site] http://localhost:${PORT}  (user/delay/search)`));
