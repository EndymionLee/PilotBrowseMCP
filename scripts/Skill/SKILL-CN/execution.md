# 4. 执行阶段

目标：用最优实现执行能力。

## 决策流程

```
调用能力
  |
  API 存在且有效？
    -> 是: browser_network_replay（快速路径）
    -> 否/失败:
         浏览器 workflow 存在？
           -> 是: 执行 workflow，DOM 操作兜底
           -> 否: 从头探索
```

## 执行模式

| 模式 | 工具 | 时机 |
|------|------|------|
| API（无需登录） | `browser_network_replay` | 公开 API，刷新数据 |
| API（浏览器认证） | `browser_network_replay({ options: { context: "browser" } })` | 需登录态的 API |
| 浏览器自动化 | `click` / `type` / `evaluate` | 有签名的 API，登录流程 |
| 浏览器 + 等待 | `click` + `browser_network_wait` | 触发操作，等 API 回来 |

## Evaluate + Wait 模式

用于有反爬签名的 API（w_rid、wts 等）：

```javascript
// 1. 在页面上下文中触发操作
await mcp({tool:"browser_mcp_browser_evaluate", args:{
  tabId,
  code: `document.querySelector('.submit-btn').click()`
}})

// 2. 等待对应的 API 请求完成
const result = await mcp({tool:"browser_mcp_browser_network_wait", args:{
  tabId,
  urlPattern: "/api/submit",
  method: "POST",
  timeout: 10000
}})
```

让页面自己计算签名，无需逆向签名算法。
