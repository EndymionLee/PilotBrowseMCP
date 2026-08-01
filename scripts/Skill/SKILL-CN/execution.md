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

### 脚本生成（PAB）

用户说"做成脚本"时：

1. 查看 `website-manuals/<site>/` 下的手册数据
2. 读 `apis/`、`pages/`、`workflows/` 获取 API、选择器、步骤
3. 生成 `.pab` 文件，需要时加控制流
4. 保存到 `workflows/scripts/<name>.pab`

**PAB 语法速查：**

工具名和参数跟你调用的 MCP 工具完全一致，直接写就行。

```python
# 注释
name: str = "脚本"         # 变量（类型可选）
count: int = 5
items: list = ["a", "b"]   # 列表
参数: dict = {"key": val}  # 字典（用于 overrides、headers）

browser_open(url)          # 工具调用，和 MCP 同名
browser_click(selector)    # 参数和 browser_click MCP 工具一样
结果 = browser_evaluate(code="document.title")  # 返回值

if 结果:                   # 条件
    browser_screenshot()

if not 结果:               # not 运算符
    print("no result")

if "关键字" in 文本:        # in 运算符（包含判断）
    browser_click(".btn")

for i in range(5):         # 循环
    browser_wait(1000)

while page < 10:            # while 循环
    page = page + 1

fn 函数名():               # 函数定义
    browser_click(".btn")

函数名()                   # 函数调用
```

**PAB 和 MCP 的关系：** 不需要映射。所有 MCP 工具（55 个）在 PAB 中同名使用。示例：

```python
# 页面工具
结果 = browser_evaluate("document.title")
链接 = browser_extract_links()
元素 = browser_query("h1")
文字 = browser_get_text()

# 操作
browser_click(".btn")
browser_type("#input", "text")
browser_scroll(direction="down", amount=300)
browser_find(text="提交", tag="button")

# 网络
browser_start_network_monitor()
数据 = browser_network_search(keyword="api")
browser_network_wait("/api/submit", timeout=10000)

# 标签页
标签页列表 = browser_list_tabs()
browser_close()
browser_activate()

# 数据
cookies = browser_cookies()
browser_screenshot()
```

**workflow 到 PAB 映射：**

| Workflow 步骤 | PAB |
|--------------|-----|
| `click` | `browser_click(选择器)` |
| `type` | `browser_type(选择器, 文本)` |
| `navigate` | `browser_open(url)` |
| 等待 API | 先 `browser_start_network_monitor()`，再 `browser_network_wait(url模式)` |

**示例：**

手册数据：
```
apis/endpoints/search.json:  GET /api/search?keyword=
pages/homepage.json:          searchInput (#search), searchButton (.search-btn)
```

生成的 PAB：
```python
browser_open("https://examplesite.com")
browser_wait(2000)
browser_type("#search", keyword)
browser_click(".search-btn")
结果 = browser_network_wait("/api/search")
```

保存为 `workflows/scripts/<name>.pab`，用户在扩展弹窗中加载运行。

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
