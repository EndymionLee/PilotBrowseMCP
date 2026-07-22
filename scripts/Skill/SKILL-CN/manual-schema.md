# 手册结构定义

## README.md（站点根目录）

入口 - 轻量索引，只列出子目录链接。

```markdown
# <站点名> 手册
- 页面: 见 [pages/](pages/)
- 导航: 见 [navigation/](navigation/)
- 流程: 见 [workflows/](workflows/)
- API: 见 [apis/](apis/)
```

## apis/README.md（API 索引）

列出所有 API 的名称和描述。Agent 先读此文件找到需要的 API，再加载对应的 JSON 文件。

```markdown
# API 接口
| 文件 | 描述 | 方法 | URL | 关联流程 |
|------|------|------|-----|---------|
| endpoints/search.json | 按关键词搜索商品 | GET | /api/search | searchProducts |
| endpoints/login.json | 用户登录 | POST | /api/login | userLogin |
```

---

## pages/<page>.json

页面上的交互元素。由 `workflow_add_element` 创建或手动编写。

```json
{
  "likeButton": {
    "locator": {
      "type": "css",
      "selector": ".video-like",
      "altSelectors": ["button[title*='点赞']"]
    },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `locator.type` | 是 | css, shadow, xpath, iframe |
| `locator.selector` | 是 | CSS 选择器或 XPath |
| `locator.altSelectors` | 否 | 备选选择器 |
| `capabilities` | 是 | click, type, focus... |
| `interaction.action` | 是 | click, input, scroll... |
| `interaction.method` | 是 | dom, cdp, execCommand |

---

## navigation/<from>-to-<to>.json

页面间导航路径。

```json
{
  "首页->视频页": {
    "from": "首页",
    "to": "视频页",
    "steps": [{ "action": "click", "page": "首页", "target": "videoCard" }],
    "backMethods": [{ "action": "browser_back" }]
  }
}
```

---

## workflows/README.md（流程索引）

列出所有流程的名称和描述。

```markdown
# 操作流程
| 文件 | 描述 | 起点 | 步骤数 |
|------|------|------|--------|
| flows/search.json | 搜索商品 | 首页 | 3 |
```

流程文件：`workflows/flows/<name>.json`

## workflows/flows/<name>.json

操作流程。由 `workflow_generate` 创建。

```json
{
  "searchProducts": {
    "description": "按关键词搜索商品",
    "startsOn": "首页",
    "steps": [
      { "action": "click", "target": "searchInput" },
      { "action": "type", "target": "searchInput", "params": { "text": "___keyword___" } },
      { "action": "click", "target": "searchButton" }
    ]
  }
}
```

**操作类型**: click, type, input, scroll, wait, hover, pressKey, select, evaluate

---

## apis/endpoints/<name>.json

API 定义。必须通过 `boundTo` 关联到 workflow。

```json
{
  "searchProducts": {
    "description": "搜索商品列表",
    "method": "GET",
    "url": "https://api.examplesite.com/search",
    "params": {
      "keyword": { "type": "string", "required": true, "source": "user_input" },
      "page": { "type": "number", "default": 1 }
    },
    "response": { "type": "json", "fields": ["id", "name", "price"] },
    "boundTo": ["searchProducts"],
    "discoveredAt": "2026-07-22"
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `method` | 是 | GET, POST, PUT, DELETE |
| `url` | 是 | API 地址 |
| `params` | 否 | 参数（类型、是否必填、来源） |
| `response.fields` | 否 | 响应中的关键字段 |
| `boundTo` | 是 | 关联的 workflow 名称 |
| `preconditions` | 否 | 前置条件，如 authenticated |
