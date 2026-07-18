# 手动测试指南

## 前提

- Chrome 浏览器已安装
- Node.js >= 18

## Step 1: 构建

```bash
cd server && npm run build
cd ../extension && npm run build
```

## Step 2: 加载 Extension

1. 打开 Chrome, 进入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `D:\MyC\AILearn\BrowserPlugin\extension\dist`

确认扩展出现在列表中，图标显示在工具栏。

## Step 3: 启动 MCP Server

```bash
cd server
node dist/index.js
```

看到日志:
```
[INFO] [MCP] MCP Server 已创建
[INFO] [MCP] MCP Server 已就绪，等待 Agent 连接
[INFO] [Transport] WebSocket 已启动 {"port":9456}
```

## Step 4: 确认 WebSocket 连接

点击工具栏中的 Pilot Browse MCP 图标打开弹窗。

![popup]

弹窗显示:
- 状态: "已连接到 MCP Server"（绿色圆点）
- 权限: 四个待授权项（+）
- 标签页列表

如果显示"未连接"，等几秒重试。

## Step 5: 测试基本功能

### 5a: 基础测试

```bash
cd scripts
npx tsx smoke-test.ts
```

预期: 2 通过, 0 失败

### 5b: 手动测试工具调用

创建一个测试脚本 `scripts/test-tools.js`：

```javascript
import { spawn } from 'child_process';
const server = spawn('node', ['server/dist/index.js']);

// 手动发送 MCP 请求
function request(method, params = {}) {
  const id = Date.now();
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
}

server.stdout.on('data', (d) => {
  const lines = d.toString().trim().split('\n');
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      console.log('响应:', JSON.stringify(msg, null, 2));
    } catch {}
  }
});

// 延迟等待 Server 就绪
setTimeout(() => {
  // 列出标签页
  request('tools/call', { name: 'browser.list_tabs', arguments: {} });
}, 2000);

setTimeout(() => process.exit(), 5000);
```

```bash
npx tsx scripts/test-tools.js
```

### 5c: 测试权限系统

1. 打开扩展弹窗
2. 看到四个待授权项: Cookie, LocalStorage, 截图, HTML
3. 点击 "Cookie" 旁的 "+" 授权
4. 验证: Agent 调用 `browser.cookies` 时不再返回权限错误

### 5d: 测试网络监听 (P0 功能)

在弹窗中先授权所有权限，然后:

1. 打开任意网页（如 `https://example.com`）
2. 获取该标签页 ID:
   ```
   browser.list_tabs
   ```
3. 启动监听:
   ```
   browser.start_network_monitor(tabId=xxx)
   ```
4. 刷新页面
5. 搜索请求:
   ```
   browser.network.search(tabId=xxx, keyword="api")
   ```
6. 重放请求:
   ```
   browser.network.replay(requestId="xxx")
   ```

## Step 6: 配置 AI Agent

### Claude Code

将如下配置添加到项目的 `claude.json` 或全局配置中:

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "node",
      "args": ["D:\\MyC\\AILearn\\BrowserPlugin\\server\\dist\\index.js"]
    }
  }
}
```

或者开发模式 (tsx watch):

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "npx",
      "args": ["tsx", "D:\\MyC\\AILearn\\BrowserPlugin\\server\\src\\index.ts"]
    }
  }
}
```

然后向 Claude Code 提问:

> "帮我列出当前浏览器中打开的标签页"

或者:

> "打开 https://example.com，然后把页面内容转成 Markdown 给我"

## 测试清单

- [ ] Server 启动无报错
- [ ] Extension 加载成功，无错误
- [ ] Popup 显示 "已连接"
- [ ] `browser.wait` 测试通过
- [ ] `browser.list_tabs` 返回标签页列表
- [ ] `browser.get_markdown` 返回 Markdown 内容
- [ ] `browser.click` / `browser.type` 操作页面元素
- [ ] `browser.cookies` 权限控制正常
- [ ] `browser.screenshot` 权限控制正常
- [ ] `browser.network.search` 找到网络请求
- [ ] `browser.network.replay` 成功重放

## 常见问题

**问题**: Popup 显示 "未连接"
**解决**: 
1. 确认 Server 正在运行
2. 确认 WebSocket 端口是 9456
3. 在扩展管理页确认扩展已启用
4. 重启扩展 (禁用再启用)

**问题**: 工具调用返回 "Extension 未连接"
**解决**: 等待几秒让 WebSocket 自动重连，查看 Server 日志确认连接状态

**问题**: 调用敏感 API 返回权限错误
**解决**: 打开扩展弹窗，点击对应的 "+" 按钮授权
