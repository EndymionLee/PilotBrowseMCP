# 1. 探索阶段

目标：触发用户行为，收集原始数据。

## 流程

```
start_network_monitor
  -> 发现当前页面 (current_page)
  -> 查看页面结构 (inspect_page)
  -> 查找交互元素 (query, find)
  -> 触发操作 (click, type, scroll)
  -> 阅读内容 (get_markdown)
  -> 深入子页面 (drill 模式)
```

## 页面发现

### 轻量扫描（首选）

```javascript
// 1. 当前页面信息
const info = await mcp({tool:"browser_mcp_browser_current_page", args:{tabId}})

// 2. 页面结构摘要
const structure = await mcp({tool:"browser_mcp_browser_inspect_page", args:{tabId}})

// 3. 交互元素
const interactives = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId,
  selector: `input, textarea, [contenteditable], [role=textbox],
    button, [role=button], a[href], select, [tabindex], [draggable]`
}})

// 4. 可读内容
const markdown = await mcp({tool:"browser_mcp_browser_get_markdown", args:{tabId}})
```

### 深度扫描（轻量不够时）

```javascript
const fullText = await mcp({tool:"browser_mcp_browser_get_text", args:{tabId}})
const html = await mcp({tool:"browser_mcp_browser_get_html", args:{tabId}}) // 最后兜底
```

> 80% 场景轻量扫描就够了。get_html 可能返回数百 KB~数 MB。

## 深入子页面

```
当前页: 首页
  -> 点击入口（视频卡片、搜索链接、菜单项）
子页: 视频播放页
  -> 扫描交互元素（含 Shadow DOM）
  -> 测试输入交互模式
  -> 保存到 pages/<subpage>.json
  -> 保存导航路径
  -> 搜索网络请求，发现 API
  -> 返回
```

```javascript
async function exploreSubPage(tabId, parentPageKey, entrySelector, subPageKey) {
  saveNavigation(`${parentPageKey}->${subPageKey}`, {
    from: parentPageKey, to: subPageKey,
    steps: [{action: "click", page: parentPageKey, selector: entrySelector}]
  })

  await mcp({tool:"browser_mcp_browser_click", args:{tabId, selector: entrySelector}})
  await mcp({tool:"browser_mcp_browser_wait", args:{tabId, ms: 1500}})

  await pierceScan(tabId, subPageKey)
  await testInputCapabilities(tabId, subPageKey)

  // 从此次交互中发现 API
  const apis = await mcp({tool:"browser_mcp_browser_network_search", args:{
    tabId, mimeType: "application/json", limit: 30
  }})
  if (apis.results?.length) saveApis(tabId, subPageKey, apis.results)
}
```

## 工具选择优先级

| 优先级 | 工具             | 数据量 | 时机                       |
| ------ | ---------------- | ------ | -------------------------- |
| 1      | `current_page` | 极小   | 确认当前位置               |
| 2      | `inspect_page` | 小     | 了解页面结构               |
| 3      | `query`        | 小     | 查找元素                   |
| 4      | `get_markdown` | 中     | 阅读内容（首选）           |
| 5      | `get_text`     | 中-大  | 纯文本兜底                 |
| 6      | `get_html`     | 极大   | 最后兜底（非必要不能使用） |

## 保存页面元素

记录交互模型，而非仅选择器：

```json
{
  "likeButton": {
    "locator": { "type": "css", "selector": ".video-like" },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  }
}
```
