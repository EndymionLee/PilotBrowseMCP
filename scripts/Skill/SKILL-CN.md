---
name: website-explorer
description: >
  深度探索任意网站，像蜘蛛一样爬遍各个页面。
  先分析首页→点进一级页面探索→返回→再点进另一个页面探索，
  记录每个页面的交互元素和页面间的导航路径，生成完整的网站操作手册。
---
# Browser MCP Runtime — 网站探索器

## 核心理念

不是记录「DOM 元素」，而是记录 **「浏览器交互能力」**。

```diff
- 记录：{ selector: ".brt-editor", type: "type" }
+ 记录：{
+   locator: { type: "shadow", host: "bili-comments", selector: ".brt-editor" },
+   capabilities: ["focus", "insertText", "clear"],
+   interaction: { action: "insert_text", method: "cdp" }
+ }
```

探索顺序：

1. **首页** → 记录导航栏、搜索栏、卡片列表
2. **点进一个视频** → 记录点赞、评论、分享、订阅
3. **退回来** → 点进搜索页 → 记录筛选、排序
4. **再退回来** → 点进账号菜单 → 记录设置项
5. ...周而复始，直到覆盖所有主要页面类型

## 输出目录

```
website-manuals/<site>/
├── README.md              # ← 手册概览（先读此文件！）
├── meta.json              # 站点信息 + 页面地图 + API 映射
├── pages/                 # 每个页面一个 JSON（升级版交互模型）
├── navigation/            # 导航路径
├── workflows/             # 操作流程（含降级策略）
├── apis/                  # API 定义（匹配到 skill/workflow）
└── capabilities.json      # 浏览器能力模型（自动生成）
```

---

## 手册概览文件 README.md

每个手册目录**必须**包含一个 `README.md` 顶层概览文件。

### 为什么要有 README.md

Agent **必须**先读 README.md 获取手册的完整目录和简要说明，避免因漏读文件导致信息不完整。

### README.md 内容模板

```markdown
# <站点名> 操作手册

## 站点信息
- **URL**: https://example.com/
- **探索日期**: 2026-07-17

## 页面清单 (pages/)
| 页面文件 | 页面类型 | 主要交互元素 |
|----------|----------|-------------|
| homepage.json | 首页 | 搜索框、导航栏、推荐卡片列表 |
| video-page.json | 视频播放页 | 点赞/评论/分享按钮、评论输入框(Shadow DOM) |
| search-results.json | 搜索结果页 | 筛选按钮、视频卡片列表 |

## 导航路径 (navigation/)
| 导航文件 | 路径 |
|----------|------|
| homepage-to-video.json | 首页 → 视频播放页 |
| homepage-to-search.json | 首页 → 搜索结果页 |

## 操作流程 (workflows/)
| 流程文件 | 功能 | 起点页面 |
|----------|------|---------|
| search-book.json | 搜索书籍 | 首页 |
| post-comment.json | 发表评论(含Shadow DOM穿透+降级策略) | 视频播放页 |

## API 接口 (apis/)
| 接口文件 | 方法 | URL 模式 | 关联工作流 |
|----------|------|----------|----------|
| search.json | GET | /api/search?keyword= | searchVideo, searchBook |
| product.json | GET | /api/product/* | getProductInfo |
| submit-order.json | POST | /api/order/create | checkout |

## 注意事项
- 评论区在 `<bili-comments>` Shadow DOM 内，需 CDP insertText
- 搜索框支持普通 DOM type
```

### 何时生成/更新 README.md

| 操作                             | 是否需要更新 README.md          |
| -------------------------------- | ------------------------------- |
| +  完整探索新站点(第〇步~第三步) | **必须生成**              |
| +  新增 pages/                   |                                 |
| 页面文件                         | **必须更新** 页面清单     |
| +  新增 navigation/ 导航路径     | **必须更新** 导航路径部分 |
| +  新增 workflows/ 操作流程      | **必须更新** 操作流程部分 |
| +  新增 apis/ API 定义           | **必须更新** API 接口清单 |
| -  修复选择器、更新元素记录      | 不需要(不影响目录结构)          |
| -  添加降级策略/fallback         | 不需要                          |

---

## 工具选择优先级（省 token 核心原则）

探索页面时，**必须按此优先级使用工具**，轻量级优先，重量级兜底。

get_html / get_text 全量源码获取是**最后一招**，不是首选！

| 优先级 | 工具             | 返回数据量                      | 适用场景                                                                                                                    |
| ------ | ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1      | `current_page` | 极小（URL+标题）                | 确认当前到了哪个页面                                                                                                        |
| 2      | `inspect_page` | 小（结构摘要）                  | 快速了解页面结构：h1/h2/h3/表单/图片                                                                                        |
| 3      | `query`        | 小（元素列表 + 坐标）           | 查找特定交互元素、获取选择器                                                                                                |
| 4      | `get_markdown` | 中（可读文本）                  | **获取页面内容的首选方式**，结构化好、token 省                                                                        |
| 5      | `get_text`     | 中-大（纯文本，含隐藏 JS/data） | 需要看全量可见文本时，比 get_html 轻仍可接受                                                                                |
| -6     | `get_html`     | **极大（完整 DOM）**      | **仅当以上工具都无法获取足够信息时才使用**。例如：需要确认具体标签结构、属性值、或页面是 SPA 且 markdown 缺失关键信息 |

### 决策流程

```
想了解页面内容
  ├─ 想看页面结构 → inspect_page ✓
  ├─ 想找交互元素 → query(selector) ✓
  ├─ 想读正文内容 → get_markdown ✓
  ├─ markdown 缺信息 → get_text（稍重但可接受）
  └─ 以上都搞不定 → 最后才用 get_html
```

> 注意 **get_html 一次调用可能返回数百 KB~数 MB，消耗大量 token。**
> 如果一个 query 调用就能解决的问题，绝对不要用 get_html。

---

## 大量文本采集守则

**爬取文章、小说、文档等大量文本内容时，禁止将内容发给 LLM 再让 LLM 写磁盘。**

正确流程：

```
1. browser_get_markdown / get_text / get_html 直接获取页面内容
2. 用 workflow.save_file 或 tools/files 系列工具直接写入磁盘文件
3. LLM 只负责判断"爬什么、存哪里"，不接触原文内容
```

> 一篇小说几十万字，发给 LLM 再让它写出来，token 消耗翻倍。
> 工具直接读、直接写，内容不经过 LLM 上下文。

---

## 批量任务：用 Python 脚本替代逐条操作

涉及批量、并发、多页爬取的场景，不要用 MCP 工具逐条操作。根据手册和探索经验生成 Python 脚本，直接跑。

### 适用范围

- 批量爬取文章/小说章节（几十上百篇）
- 并发请求 API 拉取数据（分页、批量查询）
- 利用手册中发现的 API 进行数据采集

### 做法

```
1. 参考手册中的 API 定义（apis/）和页面元素（pages/）
2. 生成 Python 脚本，用 requests / aiohttp 直接调接口
3. 需要浏览器环境时用 Playwright 配合手册里的 selectors
4. 脚本直接写磁盘，不经过 LLM
```

### 示例

手册里发现小说阅读 API 是 `GET /api/chapter?id={id}`，返回 JSON：

```python
import requests, json, time

# 从手册 apis/ 拿到的信息
API = "https://examplesite.com/api/chapter"
HEADERS = {"Cookie": "session=xxx"}  # 浏览器登录态

ids = list(range(1, 101))  # 100 章
for i, cid in enumerate(ids):
    resp = requests.get(API, params={"id": cid}, headers=HEADERS)
    with open(f"chapters/{cid}.json", "w", encoding="utf-8") as f:
        json.dump(resp.json(), f, ensure_ascii=False)
    print(f"[{i+1}/100] 第{cid}章 完成")
    time.sleep(0.5)
```

### 规则

- 批量任务一律用脚本，不在 LLM 循环里逐条调 MCP 工具
- 脚本所需的 API 地址、参数、Cookie 等从手册中获取
- 脚本执行完后只给 LLM 返回摘要（成功 N 条、失败 M 条）

---

## 网络请求监听（API 优先策略）

SPA 页面（React/Vue）的数据通过 XHR/Fetch 加载，HTML 里只有空壳。从 DOM 里抠数据不如直接拿 API 响应。配合以下工具使用：

| 工具                         | 作用                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `start_network_monitor`    | 开启监听，开始缓存请求                                                       |
| `stop_network_monitor`     | 停止监听（缓存保留，可继续查看和重放）                                       |
| `browser_network_clear_cache` | 清除缓存的请求（不停监听）                                                 |
| `browser_network_search`           | 搜索缓存的请求。按 keyword / urlPattern / method / statusCode / mimeType / sort 过滤 |
| `browser_network_detail`              | 获取请求完整详情（URL、Method、Headers、Request Body、Response Body、Status、Timing、Size）|
| `browser_network_wait`             | 等待匹配的请求出现并完成，替代固定延时                                       |
| `browser_network_replay`           | 重放请求，支持 overrides（改 query/headers/body）+ extract（JSON 路径提取）  |
| `browser_network_export`           | 导出为 curl / fetch / Python / HAR 代码                                     |
| `browser_network_analyze`          | 分析站点 API 结构，输出 API 目录、用途、数据流、replay 模板                  |
| `browser_network_override`         | 设置响应覆盖规则（篡改 body/status/header）                                  |

### 使用时机

| 场景                     | 做法                                                        | 省 token / 提成功率效果 |
| ------------------------ | ----------------------------------------------------------- | ----------------------- |
| 搜索列表 / 商品 / 内容   | 监听 -> 搜 API -> 从 JSON 取数据                            | DOM 解析的 1/5 甚至更少 |
| 翻页 / 加载更多          | 找到 API -> replay + overrides 改 page/offset               | 不用点"下一页"等渲染    |
| 商品详情 / 价格 / 库存   | 搜对应 API -> replay 拿最新值                               | 一次请求 vs 整页加载    |
| 等待某个请求完成         | click/type 后调 browser_network_wait 等具体 API 回来                | 替代固定延时，提升成功率 |
| 了解站点 API 结构        | 探索完调 browser_network_analyze，生成 API 目录                     | 输出可存到 apis/        |
| 调试/测试/绕过鉴权       | browser_network_override 设置响应覆盖规则                           | --                      |

### 完整管线

```
start_network_monitor → 操作页面 → browser_network_search
                                   │
                                   ├→ browser_network_detail → 查看详情
                                   │     ├→ browser_network_replay → 重放（支持 overrides + extract）
                                   │     ├→ browser_network_export → 导出代码
                                   │     └→ browser_network_analyze → 分析 API 结构
                                   │
                                   └→ browser_network_wait → 等某个请求完成再继续
```

> 优先找 API，其次 DOM。网络监听在 SPA 页面上效果最好（大部分数据走 API），
> 纯服务端渲染的页面（大部分数据在 HTML 里）仍然用 get_markdown / query 即可。

---

## 探索流程

### 第〇步：准备

```javascript
const tabs = await mcp({tool:"browser_mcp_browser_list_tabs"})
const tab = tabs.find(t => t.active)
const TAB_ID = tab.id
const BASE_URL = tab.url

// 开启网络监听，后续操作会缓存所有 XHR/Fetch 请求
await mcp({tool:"browser_mcp_browser_start_network_monitor", args:{tabId: TAB_ID}})
```

### 第一步：轻量扫描（`lightScan`，首选方案）

**先用最轻的工具掌握页面全貌，避免一上来就全量抓取。**

```javascript
// ① 最轻量：获取当前页 URL 和标题
const info = await mcp({tool:"browser_mcp_browser_current_page", args:{tabId: TAB_ID}})

// ② 轻量：获取页面结构摘要（h1/h2/h3/table/form/img）
const structure = await mcp({tool:"browser_mcp_browser_inspect_page", args:{tabId: TAB_ID}})

// ③ 轻量：扫描所有可交互元素（推荐：使用 query 精准查找，而非全量抓取）
const interactives = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId: TAB_ID,
  selector: `
    input, textarea, [contenteditable], [role=textbox],
    button, [role=button], a[href], select,
    [tabindex], [draggable],
    [contenteditable=true] div,
    iframe
  `
}})

// ④ 轻量：获取页面可读内容（推荐替代 get_html / get_text）
const markdown = await mcp({tool:"browser_mcp_browser_get_markdown", args:{tabId: TAB_ID}})
// get_markdown 结构化好、token 省，优先使用
// 需要更多纯文本数据时用 get_text（比 get_html 更轻）
```

> + **80% 的场景，以上四个工具就够了。** 只有当前四个工具拿不到关键信息时，才考虑 get_html。

### 第一步备选：深度扫描（`deepScan`，仅在 lightScan 不够时使用）

当轻量扫描无法获取足够信息时（如需要确认具体标签属性、Shadow DOM 结构、数据属性等），才使用以下手段：

```javascript
// 仅当轻量扫描不够时，才升级到 get_text
const fullText = await mcp({tool:"browser_mcp_browser_get_text", args:{tabId: TAB_ID}})

// 注意 仅当 get_text 也不够（如需要查看确切 DOM 属性、data-* 属性值）时，
// 才使用 get_html 作为最后的兜底方案
const html = await mcp({tool:"browser_mcp_browser_get_html", args:{tabId: TAB_ID}})

// 扫描 Shadow DOM 容器
const shadowHosts = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId: TAB_ID,
  selector: 'bili-comments, ytd-comments, *[id*="shadow"], *[class*="shadow"]'
}})

// 扫描入口链接
const entryLinks = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId: TAB_ID, selector: "a[href]"
}})
```

#### 对每个元素，记录增强信息：

```javascript
const elementInfo = {
  tag: element.tag,
  attributes: {
    contenteditable: element.attributes.contenteditable || null,
    role: element.attributes.role || null,
    tabindex: element.attributes.tabindex || null
  },
  computedRole: computedRole,
  hasShadowRoot: hasShadowRoot,
  isInShadow: isInShadow,
  shadowPath: shadowPath,
  events: ["input", "keydown", "click"],
  boundingBox: boundingBox
}
```

### 第二步：深入探索子页面（`drill`）

```
当前页: 首页
  ↓ 点击视频卡片
子页: 视频播放页
  ↓ 扫描所有交互元素（含 Shadow DOM 穿透）
  ↓ 测试每个输入元素的交互模式（普通 input / contenteditable / React controlled）
  ↓ 记录到 pages/video-page.json
  ↓ 记录导航路径到 navigation/homepage-to-video.json
  ↓ 搜索网络请求，发现页面加载数据的 API
  ↓ 记录到 apis/<name>.json
  ↓ 返回上一页
...
```

**关键：每探索完一个子页必须返回上一页！**

```javascript
async function exploreSubPage(tabId, parentPageKey, entrySelector, subPageKey, description) {
  // 1. 记录导航
  saveNavigation(`${parentPageKey}→${subPageKey}`, {
    from: parentPageKey, to: subPageKey,
    steps: [{action: "click", page: parentPageKey, selector: entrySelector}]
  })

  // 2. 点击进入
  await mcp({tool:"browser_mcp_browser_click", args:{tabId, selector: entrySelector}})
  await mcp({tool:"browser_mcp_browser_wait", args:{tabId, ms: 1500}})

  // 3. 穿透式扫描子页面
  await pierceScan(tabId, subPageKey)

  // 4. 对输入类元素，测试交互模式
  await testInputCapabilities(tabId, subPageKey)

  // 5. API 发现：搜索页面加载过程中产生的网络请求
  const apis = await mcp({tool:"browser_mcp_browser_network_search", args:{
    tabId,
    mimeType: "application/json",
    limit: 30
  }})
  if (apis.results?.length) {
    saveApis(tabId, subPageKey, apis.results)
  }

  // 6. 返回上一页（如 via browser_activate 切换回首页标签页）
}
```

### 第三步：保存到模块化目录

#### 1. `meta.json` — 站点信息 + API 映射

```json
{
  "manual": {
    "site": "ExampleSite",
    "baseUrl": "https://www.examplesite.com/",
    "date": "2026-07-17"
  },
  "siteMap": {
    "首页": { "url": "/", "childrenPages": ["视频播放页", "搜索结果页"] },
    "视频播放页": { "urlPattern": "/video/BV", "from": "首页" },
    "搜索结果页": { "urlPattern": "search.examplesite.com/all?keyword=", "from": "首页" }
  },
  "apiMap": {
    "search": { "method": "GET", "urlPattern": "/api/search?keyword=", "mimeType": "application/json", "usedBy": ["searchVideo", "searchBook"] },
    "productDetail": { "method": "GET", "urlPattern": "/api/product/*", "mimeType": "application/json", "usedBy": ["getProductInfo"] },
    "submitOrder": { "method": "POST", "urlPattern": "/api/order/create", "mimeType": "application/json", "usedBy": ["checkout"] }
  }
}
```

- `apiMap` 字段记录该站点发现的所有 API
- `usedBy` 关联到 `workflows/` 中的工作流名称，表示该工作流可以用此 API 替代 DOM 操作

#### 2. `pages/<page>.json` — 升级版交互元素记录

```json
{
  "视频播放页": {
    "urlPattern": "/video/BV",
    "selectors": {
      "likeButton": {
        "description": "点赞按钮",

        "locator": {
          "type": "css",
          "selector": ".video-like",
          "altSelectors": ["button[title*='点赞']", "[class*='like']"]
        },

        "capabilities": ["click"],

        "interaction": {
          "action": "click",
          "method": "dom"
        }
      },

      "commentEditor": {
        "description": "评论输入框（新版 brt 编辑器）",

        "locator": {
          "type": "shadow",
          "path": [
            { "host": "bili-comments", "shadow": true },
            { "selector": "#input .brt-editor" }
          ],
          "fallbackSelector": "#input .brt-editor"
        },

        "capabilities": [
          "focus",
          "insertText",
          "clear",
          "readText"
        ],

        "interaction": {
          "action": "insert_text",
          "method": "cdp",
          "notes": "普通 type() 因 contenteditable + React state 管控失败，需 CDP Input.insertText"
        }
      }
    }
  }
}
```

**locator 类型一览：**

| locator.type   | 适用场景           | 示例                                                                                             |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `css`        | 普通 DOM 元素      | `{ type: "css", selector: ".video-like" }`                                                     |
| `shadow`     | Web Component 内部 | `{ type: "shadow", path: [{host: "bili-comments", shadow: true}, {selector: ".brt-editor"}] }` |
| `iframe`     | iframe 内部        | `{ type: "iframe", frameSelector: "iframe#sandbox", innerSelector: ".btn" }`                   |
| `xpath`      | 复杂结构           | `{ type: "xpath", selector: "//div[@class='menu']//button[3]" }`                               |
| `coordinate` | Canvas/非标准      | `{ type: "coordinate", x: 320, y: 480, container: "#canvas-area" }`                            |

#### 3. `navigation/<from>-to-<to>.json`

```json
{
  "首页→视频播放页": {
    "from": "首页",
    "to": "视频播放页",
    "steps": [
      {"action": "click", "page": "首页", "target": "videoCardImageLink"}
    ],
    "backMethods": [
      {"action": "browser_back"},
      {"action": "click", "page": "视频播放页", "target": "examplesiteLogo"}
    ]
  }
}
```

#### 4. `workflows/<name>.json` — 升级版（含降级策略）

```json
{
  "postComment": {
    "description": "发表评论",
    "startsOn": "视频播放页",

    "steps": [
      {
        "action": "scroll",
        "target": "commentApp"
      },
      {
        "action": "wait",
        "params": { "ms": 1500 }
      },
      {
        "action": "click",
        "target": "commentEditor",
        "notes": "先点击激活 contenteditable"
      },
      {
        "action": "input",
        "target": "commentEditor",

        "strategy": "auto",

        "fallback": [
          "cdp_insert_text",
          "execCommand_insertText",
          "input_event_dispatch",
          "clipboard_paste"
        ],

        "params": {
          "text": "___评论内容___",
          "clear": true
        }
      },
      {
        "action": "wait",
        "params": { "ms": 500 }
      },
      {
        "action": "click",
        "target": "commentSubmitBtn"
      }
    ]
  }
}
```

**workflow action 类型：**

| action       | 说明                         |
| ------------ | ---------------------------- |
| `click`    | 点击元素                     |
| `input`    | 输入文本（自动选择最佳策略） |
| `hover`    | 悬停                         |
| `scroll`   | 滚动到目标                   |
| `wait`     | 等待                         |
| `pressKey` | 按键（Enter/Tab/Esc...）     |
| `select`   | 下拉选择                     |
| `evaluate` | 执行 JS（Shadow DOM 穿透等） |

#### 5. `apis/<name>.json` — API 定义（匹配到 workflow）

记录通过网络监听发现的 API，关联到对应工作流。执行时优先用 API 替代 DOM 操作。

```json
{
  "searchProducts": {
    "description": "搜索商品列表",
    "method": "GET",
    "url": "https://api.examplesite.com/search",
    "params": {
      "keyword": { "type": "string", "required": true, "source": "user_input" },
      "page": { "type": "number", "default": 1 },
      "pageSize": { "type": "number", "default": 20 }
    },
    "headers": {
      "x-platform": "web"
    },
    "response": {
      "type": "json",
      "fields": ["id", "name", "price", "sales", "image"]
    },
    "usedBy": ["searchProductsWorkflow"],
    "discoveredAt": "2026-07-17"
  }
}
```

| 字段                 | 说明                                     |
| -------------------- | ---------------------------------------- |
| `method` / `url` | 请求方式和地址                           |
| `params`           | 参数列表，标记哪些来自用户输入、哪些固定 |
| `response.fields`  | 响应中的关键字段                         |
| `usedBy`           | 关联到 `workflows/` 中的工作流         |

**执行规则：** 如果当前 workflow 有匹配的 API 定义，优先通过 `browser_network_replay` 调 API 拿数据，不同步操作页面等待渲染。

#### 6. `capabilities.json` — 浏览器能力模型（自动生成）

探索完成后自动生成，记录每个页面上元素的交互特征和已知约束：

```json
{
  "videoPage": {
    "commentEditor": {
      "supports": [
        "shadow-dom",
        "contenteditable",
        "react-controlled",
        "cdp-input-required"
      ],
      "unsupported": [
        "dom-type",
        "sendKeys"
      ],
      "recommendedAction": "insertText",
      "recommendedMethod": "cdp",
      "knownIssues": [
        "普通 browser_type() 触发 React onChange 失败",
        "需先 click 激活再 CDP Input.insertText"
      ]
    },

    "searchInput": {
      "supports": [
        "dom-type",
        "clear",
        "pressEnter"
      ],
      "recommendedAction": "type",
      "recommendedMethod": "dom"
    }
  }
}
```

#### 6. `README.md` — 手册概览文件（必须生成/更新）

探索完成后**必须生成** `README.md`，作为手册的入口概览，结构如下：

```markdown
# <站点名> 操作手册

## 站点信息
- **URL**: ...
- **探索日期**: ...

## 页面清单 (pages/)
| 文件 | 页面 | 主要交互元素 |
|------|------|-------------|
| homepage.json | 首页 | 搜索框、导航栏、推荐卡片 |
| ... | ... | ... |

## 导航路径 (navigation/)
| 文件 | 路径 |
|------|------|
| homepage-to-video.json | 首页 → 视频播放页 |

## 操作流程 (workflows/)
| 文件 | 功能 | 起点页面 |
|------|------|---------|
| search-book.json | 搜索书籍 | 首页 |

## 注意事项
- 需要特殊处理的交互（如Shadow DOM、CDP输入等）
```

**更新时机（同 README.md 章节中定义的规则）：**

- 完整探索新站点 → **必须生成**
- 新增/删除 pages/ 文件 → **必须更新** 页面清单
- 新增/删除 navigation/ 文件 → **必须更新** 导航路径部分
- 新增/删除 workflows/ 文件 → **必须更新** 操作流程部分
- 修复选择器、更新元素记录、添加降级策略 → 不需要更新

---

## 交互模型升级对比

| 旧模型                      | 新模型                                                 |
| --------------------------- | ------------------------------------------------------ |
| `selector: ".brt-editor"` | `locator: { type: "shadow", path: [...] }`           |
| `type: "type"`            | `capabilities: ["focus","insertText","clear"]`       |
| `type: "click"`           | `interaction: { action: "click", method: "dom" }`    |
| `action: "type"`          | `action: "input", strategy: "auto", fallback: [...]` |
| 只查 `input/textarea`     | 查 `input,textarea,[contenteditable],[role=textbox]` |
| 平面 DOM 扫描               | `pierceQuery()` 穿透 Shadow DOM                      |

---

## 选择器优先级（升级版）

| 优先级 | Locator 类型         | 示例                             | 说明          |
| ------ | -------------------- | -------------------------------- | ------------- |
| 1      | `css#id`           | `#submit-button`               | 最稳定        |
| 2      | `css[aria]`        | `[aria-label*="顶此视频"]`     | 语义稳定      |
| 3      | `css[data-testid]` | `[data-testid="like"]`         | 测试专用      |
| 4      | `css[name]`        | `[name="search_query"]`        | 表单常用      |
| 5      | `css层级`          | `.video-info button`           | 带父级限定    |
| 6      | `shadow穿透`       | `bili-comments >> .brt-editor` | Web Component |
| 7      | `iframe路径`       | `iframe#sandbox >> .btn`       | 内嵌 frame    |
| 8      | `xpath`            | `//div[@class='menu']//button` | 复杂定位      |
| 9      | `coordinate`       | `{x:320, y:480}`               | Canvas/非标准 |

---

## pierceQuery — Shadow DOM 穿透扫描

标准 `querySelector` 无法穿透 Shadow DOM。探索器需要类似 Chrome DevTools 的穿透能力：

```
document
  │
  ├── <bili-comments>         ← Shadow Host
  │     └── #shadow-root
  │           ├── <div class="brt-root">
  │           │     └── <div class="brt-editor" contenteditable>
  │           └── <div class="brt-placeholder">
  │
  ├── <ytd-comments>          ← Shadow Host
  │     └── #shadow-root
  │           └── <textarea>
  │
  └── <iframe#sandbox>        ← iframe
        └── #document
              └── <button>
```

扫描时调用：

```javascript
// 遍历所有 Shadow Host
const shadowHosts = document.querySelectorAll('bili-comments, ytd-comments, *[id*="-comments"]')
for (const host of shadowHosts) {
  const root = host.shadowRoot
  if (!root) continue

  // 在 Shadow Root 内部查询
  const editors = root.querySelectorAll('[contenteditable], textarea, input')
  const buttons = root.querySelectorAll('button, [role=button]')

  // 记录穿透路径
  records.push({
    element: editor,
    path: [host.tagName.toLowerCase(), '#shadow-root', getSelector(editor)]
  })
}
```

---

## 使用手册

### 查元素 — 轻量优先

从 `pages/<page>.json` 读取 `locator`，按 `type` 选择定位方式。

**获取页面内容时同样遵循轻量优先原则：**

```
需要看页面内容 → get_markdown ✓（首选，token 最省）
          ↓ 不够
需要更多文本 → get_text ✓（可接受）
          ↓ 还不够
需要完整 DOM → get_html（最后兜底）
```

```javascript
const el = pageData.selectors.commentEditor

// 根据 locator.type 选择策略
switch (el.locator.type) {
  case "css":
    await click({ selector: el.locator.selector })
    break
  case "shadow":
    // 穿透 Shadow DOM
    await evaluate({
      code: `
        const host = document.querySelector('${el.locator.path[0].host}')
        const editor = host.shadowRoot.querySelector('${el.locator.path[1].selector}')
        editor.focus()
      `
    })
    break
  case "iframe":
    // 进 iframe
    break
}
```

### 执行工作流

按 `workflows/<name>.json` 的 `steps` 顺序执行，每步看 `interaction.method`：

```javascript
for (const step of workflow.steps) {
  if (step.strategy === "auto") {
    // 尝试 method → 失败则走 fallback[]
    await executeWithFallback(step)
  } else {
    await executeStep(step)
  }
}
```

### 输入降级策略

对 contenteditable / React controlled 输入框，按以下优先级尝试：

| 优先级 | 方法                                   | 适用                    |
| ------ | -------------------------------------- | ----------------------- |
| 1      | `CDP Input.insertText`               | contenteditable + React |
| 2      | `document.execCommand('insertText')` | 旧版富文本              |
| 3      | `dispatchEvent(new InputEvent())`    | React state 管控        |
| 4      | `clipboard` + paste                  | 兼容模式                |
| 5      | 逐字符 `insertText`                  | 最终兜底                |

---

## 示例：VideoSite 深度探索计划

```
首页
├── 侧边栏导航 (首页/Shorts/订阅/我/历史记录...)
├── 搜索功能 (输入框+搜索按钮+语音搜索)
├── 顶栏按钮 (创建/通知/账号)
│
├──→ 点击视频卡片 ──→ 视频播放页
│   ├── 点赞/点踩按钮
│   ├── 分享按钮 (点开看弹窗)
│   ├── 保存按钮 (点开看播放列表弹窗)
│   ├── 订阅按钮
│   ├── 评论区域 (点开输入框) ← 注意 Shadow DOM
│   ├── 视频描述区
│   └── 推荐视频列表
│   ←── 返回首页
│
├──→ 点击 Shorts ──→ Shorts 页
│   ├── 上下滑交互
│   ├── 点赞/评论/分享按钮
│   ←── 返回首页
│
├──→ 搜索关键词 ──→ 搜索结果页
│   ├── 筛选按钮 (上传日期/类型/时长/排序)
│   ├── 视频卡片列表
│   ←── 返回首页
│
└──→ 点击账号 ──→ 账号菜单
    ├── 切换账号
    ├── VideoSite Studio
    ├── 设置
    └── 退出登录
```

---

---

# 网站手册增量更新器 (Manual Updater)

## 核心理念

**已有完整手册 → 只探索变化的部分 → 改对应的小文件**

绝不重复扫描没有变化的页面，每次只做最小改动。

## 前置条件

`website-manuals/` 下已有该站点的模块化结构。

---

## 增量更新流程

### 场景 A：修复失效的选择器 + 升级到新模型

**问题**：ExampleSite 点赞按钮 class 变了，且需升级到新 locator 格式

**步骤**：

1. **只打开该页面**

   ```
   打开 https://www.examplesite.com/video/BVxxx
   ```
2. **用 query 精准查该元素（不要拉全页 HTML！）**

   ```javascript
   // +  正确：用 query 精准查找目标元素，轻量高效
   query({ selector: "button[title*='点赞'], .video-like, [class*='like']" })

   // -  错误：不要用 get_html 全量拉取整个页面就为了找一个按钮
   ```
3. **升级页面文件中的元素记录**

   ```json
   "likeButton": {
     "description": "点赞按钮",
     "locator": {
       "type": "css",
       "selector": ".video-like-new-class",
       "altSelectors": [".video-like", "button[title*='点赞']"]
     },
     "capabilities": ["click"],
     "interaction": { "action": "click", "method": "dom" }
   }
   ```

**影响范围**：1 个文件，1 个元素

---

### 场景 B：Shadow DOM 内部元素需要新增记录

**问题**：发现视频页评论区在 `bili-comments` Web Component 内部

**步骤**：

1. **定位 Shadow Host**

   ```javascript
   const host = document.querySelector('bili-comments')
   const root = host.shadowRoot
   const editor = root.querySelector('.brt-editor')
   ```
2. **记录穿透路径**

   ```json
   "commentEditor": {
     "description": "评论输入框（Shadow DOM 内）",
     "locator": {
       "type": "shadow",
       "path": [
         { "host": "bili-comments", "shadow": true },
         { "selector": "#input .brt-editor" }
       ]
     },
     "capabilities": ["focus", "insertText", "clear"],
     "interaction": {
       "action": "insert_text",
       "method": "cdp",
       "notes": "contenteditable + React 管控，需 CDP 输入"
     }
   }
   ```
3. **同步更新 capabilities.json**

   ```json
   "commentEditor": {
     "supports": ["shadow-dom", "contenteditable", "cdp-input-required"],
     "recommendedMethod": "cdp"
   }
   ```

---

### 场景 C：新增工作流（带降级策略）

**问题**：需要"发表评论"操作流程

**步骤**：

1. **打开视频页，穿透 Shadow DOM 定位评论区**
2. **测试输入方式**（普通 type 失败 → CDP insertText 成功）
3. **创建工作流文件，含 fallback**

```json
{
  "postComment": {
    "steps": [
      { "action": "scroll", "target": "commentApp" },
      { "action": "wait", "params": { "ms": 1500 } },
      { "action": "click", "target": "commentEditor" },
      {
        "action": "input",
        "target": "commentEditor",
        "strategy": "auto",
        "fallback": ["cdp_insert_text", "execCommand"],
        "params": { "text": "___内容___", "clear": true }
      },
      { "action": "click", "target": "commentSubmitBtn" }
    ]
  }
}
```

---

### 场景 D-F

| 场景           | 操作                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| 新增页面按钮   | 在 `pages/<page>.json` 追加元素记录（含 locator / capabilities / interaction） |
| 新增导航路径   | 新建 `navigation/<from>-to-<to>.json`                                          |
| 修复工作流逻辑 | 调整 `workflows/<name>.json` 的 steps 或 fallback 顺序                         |

---

## 对比：增量更新 vs 全量探索

| 维度       | -  全量探索       | +  增量更新               |
| ---------- | ----------------- | ------------------------- |
| 打开的页面 | 首页 + 所有子页面 | **只开变化的那1页** |
| 查询的元素 | 全页所有元素      | **只查目标区域**    |
| 修改的文件 | 多个大文件        | **1~2个小文件**     |
| Token 消耗 | 高                | **极低**            |
