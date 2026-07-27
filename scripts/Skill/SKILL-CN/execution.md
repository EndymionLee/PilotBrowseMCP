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

## 脚本执行（无 LLM 模式）

脚本是预先录制的 MCP 工具调用序列，存放在 `workflows/scripts/` 中。直接在 Extension 中执行，不经过 LLM。

### 脚本格式

```json
{
  "name": "每日签到",
  "steps": [
    { "method": "browser_open", "params": { "url": "https://example.com" } },
    { "method": "browser_wait", "params": { "ms": 2000 } },
    { "method": "browser_click", "params": { "selector": ".checkin-btn" } },
    { "method": "browser_network_wait", "params": { "urlPattern": "/api/checkin", "timeout": 15000 } }
  ]
}
```

### 使用时机

- 固定的重复操作（每日签到、数据采集）
- LLM 判断没有价值的场景
- Agent 已发现正确的步骤和选择器后

### 脚本生成

用户说"做成脚本"时：

1. 查看 `website-manuals/<site>/` 下的手册数据
2. 读 `apis/README.md` 和 `apis/endpoints/<name>.json` 获取 API 调用方式
3. 读 `pages/<page>.json` 获取元素选择器
4. 组合成 MCP 脚本
5. 调 `workflow_generate_script` 保存

**原则：**

- API 调用用 `browser_network_replay`（来自 `apis/endpoints/`）
- DOM 操作用 `browser_click/type`（选择器来自 `pages/`）
- 需要等待时用 `browser_wait`
- 脚本无 LLM 运行，每步参数必须硬编码

**示例 -- 从手册数据生成脚本：**

手册数据：
```
apis/endpoints/search.json:  GET /api/search?keyword=
pages/homepage.json:          searchInput (#search), searchButton (.search-btn)
```

生成的脚本：
```json
steps: [
  { "method": "browser_click", "params": { "selector": "#search" } },
  { "method": "browser_type", "params": { "selector": "#search", "text": "___keyword___" } },
  { "method": "browser_click", "params": { "selector": ".search-btn" } },
  { "method": "browser_network_replay", "params": { "requestId": null, "overrides": { "query": { "q": "___keyword___" } } } }
]
```

用 `workflow_generate_script` 保存：

```json
workflow_generate_script({
  site: "youtube_com",
  scriptName: "每日签到",
  description: "每日签到",
  steps: [
    { "method": "browser_open", "params": { "url": "https://pixiv.net" } },
    { "method": "browser_wait", "params": { "ms": 3000 } },
    { "method": "browser_click", "params": { "selector": ".checkin-btn" } }
  ]
})
```

用户说"做成脚本"时，用 `workflow_generate_script` 生成保存。

### 脚本执行

**弹窗执行：** 点 **Scripts > Load** 选 `.json` 文件，点 **Run**。

**Agent 执行：** 用 `workflow_execute_script` 直接运行已保存的脚本：

```json
workflow_execute_script({ site: "youtube_com", scriptName: "checkin" })
```

执行结果显示每一步成功或失败。

### 脚本优化

脚本失败了（选择器不对、页面变了），告诉 Agent："签到脚本第 3 步不生效"。Agent 检查页面、修正参数、更新脚本。

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
