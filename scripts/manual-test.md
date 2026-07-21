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
4. 选择项目目录下的 `extension/dist`

确认扩展出现在列表中，图标显示在工具栏。
> 如果使用 `chrome.debugger` 相关功能，需在扩展管理页开启"允许访问文件网址"。

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

弹窗显示:
- 状态: "已连接到 MCP Server"（绿色圆点）
- 权限: 待授权项（Cookie / LocalStorage / 截图 / HTML）
- 标签页列表

如果显示"未连接"，等几秒重试。

## Step 5: 测试功能

### 5a: 基础测试

```bash
cd scripts
npx tsx smoke-test.ts
```

### 5b: 手动测试工具调用

确认 Server 运行中后，在 Claude Code 或支持 MCP 的客户端中配置连接，然后输入:

> "列出当前浏览器中打开的标签页"

> "打开 https://example.com，把页面内容转成 Markdown"

> "在百度搜索'天气预报'，监听网络请求，把 API 数据给我"

### 5c: 测试权限系统

1. 打开扩展弹窗
2. 看到待授权项: Cookie, LocalStorage, 截图, HTML
3. 点击各项目旁的 "+" 授权
4. 验证: Agent 调用敏感 API 时不再返回权限错误

### 5d: 测试网络功能

打开任意网页后:

```
1. 获取该标签页 ID:
   browser.list_tabs

2. 启动监听:
   browser.start_network_monitor({ tabId })

3. 刷新页面或操作页面触发 API

4. 搜索请求:
   browser.network.search({ tabId, keyword: "api" })

5. 查看请求详情:
   browser.network.get({ requestId })

6. 重放请求:
   browser.network.replay({ requestId })

7. 等待某个 API:
   browser.network.wait({ tabId, urlPattern: "/api/search" })

8. 导出代码:
   browser.network.export({ requestId, format: "curl" })

9. 分析站点 API:
   browser.network.analyze({ tabId })
```

## Step 6: 配置 AI Agent

### Claude Code

将如下配置添加到项目的 `claude.json` 或全局配置中:

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "node",
      "args": ["<项目目录>/server/dist/index.js"]
    }
  }
}
```

或者开发模式:

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "npx",
      "args": ["tsx", "<项目目录>/server/src/index.ts"]
    }
  }
}
```

## 测试清单

- [ ] Server 启动无报错
- [ ] Extension 加载成功
- [ ] Popup 显示 "已连接"
- [ ] `browser.list_tabs` 返回标签页列表
- [ ] `browser.open / navigate` 打开页面
- [ ] `browser.get_markdown` 返回 Markdown
- [ ] `browser.click / type / scroll` 操作页面
- [ ] `browser.query` 查询元素
- [ ] `browser.evaluate` 执行 JS
- [ ] `browser.find` 按文字查找元素
- [ ] `browser.extract_article / table / links / images` 提取内容
- [ ] `browser.cookies / local_storage` 权限控制正常
- [ ] `browser.screenshot` 权限控制正常
- [ ] `browser.inspect_page` 查看页面结构
- [ ] `browser.save_content / save_xpath` 保存文件
- [ ] `browser.start_network_monitor` 开启监听
- [ ] `browser.network.search` 搜索请求
- [ ] `browser.network.get` 查请求详情
- [ ] `browser.network.wait` 等待 API 返回
- [ ] `browser.network.replay` 重放请求
- [ ] `browser.network.export` 导出代码
- [ ] `browser.network.analyze` 分析 API 结构
- [ ] 工作流录制 + workflow.generate

## 常见问题

**问题**: Popup 显示 "未连接"
**解决**:
1. 确认 Server 正在运行（有控制台日志输出）
2. 确认 WebSocket 端口是 9456（未被占用）
3. 在扩展管理页确认扩展已启用
4. 重启扩展（禁用再启用）

**问题**: 工具调用返回 "Extension 未连接"
**解决**: 等待几秒让 WebSocket 自动重连，查看 Server 日志确认连接状态

**问题**: 调用敏感 API 返回权限错误
**解决**: 打开扩展弹窗，点击对应的 "+" 按钮授权

**问题**: network.search 返回空
**解决**: 先确认调用了 start_network_monitor，然后操作页面触发 API 调用（刷新、搜索、翻页等）
