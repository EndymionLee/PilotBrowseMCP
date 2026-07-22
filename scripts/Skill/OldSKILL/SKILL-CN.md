---
name: website-explorer
description: 通过用户行为发现网站能力，学习 API 并沉淀自动化流程
---

# 网站能力学习器

## 核心理念

不是"探索网站，生成手册"。而是：

> **通过用户行为发现网站能力。API 和自动化流程都是同一个能力的实现形式。**

```
用户行为
      |
      +-- 网络监听 --> API 发现
      +-- 操作记录 --> 自动化流程
      |                    |
      +------ 能力 <-------+
                  |
        +----------+
        |
    实现方式
        |
    +---+---+
    |       |
   API    浏览器流程
  (首选)  (兜底/学习源)
```

---

## 1. 探索阶段

目标：触发用户行为，收集原始数据。

- 发现页面结构和交互元素
- 触发操作（搜索、点击、输入、滚动）
- 操作前开启网络监听
- 记录用户操作轨迹

工具：`inspect_page`、`query`、`click`、`type`、`start_network_monitor`

---

## 2. API 发现阶段

目标：从网络事件中提取可复用的 API 定义。

```
start_network_monitor
  -> 交互操作（触发 API）
  -> browser_network_search（搜索 JSON API）
  -> browser_network_detail（查看请求/响应）
  -> 保存到 apis/endpoints/<name>.json
```

### 什么样的 API 值得保存

| 信号 | 含义 |
|------|------|
| `mimeType: application/json` | 结构化数据 |
| `method: GET` | 读操作，可安全重放 |
| `method: POST/PUT/DELETE` | 写操作，需谨慎 |
| 响应包含数据字段 | 有实际业务数据 |
| 请求有 query/body 参数 | 可参数化复用 |

### 保存格式

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

工具链：`browser_network_search` -> `browser_network_detail` -> 保存到 `apis/endpoints/`

---

## 3. 能力学习阶段

目标：将 API 和自动化绑定为统一的能力。

API 是首选实现（快速、省 token），浏览器自动化是兜底（环境恢复、签名刷新）。

| 情况 | 应对 |
|------|------|
| API 正常 | 直接调用 |
| API 401 | 执行登录 workflow，重试 API |
| 签名过期 | 执行浏览器 workflow 刷新 |
| API 变更 | 兜底到浏览器，重新发现 |

输出：`apis/endpoints/<name>.json` 中的 `boundTo` 关联 workflow。

---

## 4. 执行阶段

| 模式 | 工具 | 场景 |
|------|------|------|
| API（无需登录） | `browser_network_replay` | 公开 API |
| API（浏览器认证） | `browser_network_replay({ options: { context: "browser" } })` | 需登录态 |
| 浏览器自动化 | `click` / `type` / `evaluate` | 有签名的 API |
| 触发 + 等待 | `click` + `browser_network_wait` | 让页面自算签名 |

---

## 5. 进化阶段

每次执行优化能力。发现新 API 则升级为首选，API 失效则兜底到浏览器重新发现。

---

## 6. 批量任务

批量场景用 Python 脚本直接调 API，不在 LLM 循环里逐条调工具。

---

## 输出目录

```
website-manuals/<site>/
  README.md              # 根索引
  pages/                 # 页面交互模型（扁平）
  navigation/            # 导航路径（扁平）
  workflows/
    README.md            # 流程索引
    flows/               # workflow JSON
  apis/
    README.md            # API 索引
    endpoints/           # API JSON
```

详细 schema 见 `manual-schema.md`。

## 工具参考

### 网络管线

| 工具 | 阶段 | 作用 |
|------|------|------|
| `start_network_monitor` | 1 | 开始抓包 |
| `stop_network_monitor` | -- | 停止（缓存保留） |
| `browser_network_clear_cache` | -- | 清缓存不停监听 |
| `browser_network_search` | 2 | 按条件搜索 API |
| `browser_network_detail` | 2 | 查看请求/响应详情 |
| `browser_network_wait` | 4 | 等待 API 完成 |
| `browser_network_replay` | 4 | 执行 API |
| `browser_network_export` | -- | 导出代码 |
| `browser_network_analyze` | 2 | 分析 API 结构 |

### 页面工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `current_page` | 1 | 当前位置 |
| `inspect_page` | 1 | 页面结构 |
| `query` | 1 | 查找元素 |
| `click` / `type` / `scroll` | 1 | 触发操作 |
| `evaluate` | 4 | 执行 JS |
| `wait_for_element` | 4 | 等待元素 |
| `find` | 1 | 按文字定位 |

### 内容工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `get_markdown` | 1 | 阅读内容（首选） |
| `get_text` | 1 | 纯文本兜底 |
| `get_html` | 1 | 最后兜底 |
| `save_content` | -- | 保存到磁盘 |
| `save_xpath` | -- | 按 XPath 保存 |

### 工作流工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `workflow_list_recordings` | 1 | 查看用户录制 |
| `workflow_get_recording` | 1 | 获取录制详情 |
| `workflow_generate` | 3 | 保存 workflow |
| `workflow_add_element` | 1 | 保存标记元素 |

### 数据工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `cookies` | 4 | 读取登录态 |
| `local_storage` | 4 | 读取存储数据 |
| `screenshot` | -- | 截图 |
| `permissions_list / grant / revoke` | -- | 权限管理 |
