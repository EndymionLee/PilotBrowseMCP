# 手册结构定义

## 站点命名规范

目录名格式：`域名主体_顶级域_次级域`

取 hostname，去掉 `www.`，把所有 `.` 替换为 `_`。

```
https://www.site.com   -> site_com
https://sub.site.co.jp -> sub_site_co_jp
https://site.org       -> site_org
```

规则：
- 全小写
- 去掉 `www.` 前缀
- 所有 `.` 替换为 `_`
- 不能有其他特殊字符

## 中间数据 (.learn/)

探索过程中产生的临时数据存放在 `.learn/`：

```
.learn/
  recordings/        # 用户录制的原始操作
  picked-elements/   # 用户标记的页面元素
```

生命周期：
1. 用户录制/标记 -> 存入 `.learn/`
2. Agent 审阅处理 -> 保存到 `website-manuals/`
3. 处理完后可删除 `.learn/` 中的原始文件

## 校验

保存前用 `workflow_validate_manual` 工具校验。下面的 schema 是校验依据。

---

## README.md（站点根目录）

**填空模板**（不要改结构）：

```markdown
# {站点名} Manual
- 页面: 见 [pages/](pages/)
- 导航: 见 [navigation/](navigation/)
- 流程: 见 [workflows/](workflows/)
- API: 见 [apis/](apis/)
```

**校验规则：**
- 必须包含上面 4 个子目录链接
- 不能写站点功能文档
- 不能写 API 详情或流程步骤

---

## apis/README.md（API 索引）

**填空模板：**

```markdown
# API 接口
| 文件 | 描述 | 方法 | URL | 关联流程 |
|------|------|------|-----|---------|
| endpoints/{name}.json | {描述} | {GET/POST} | {url} | {workflow名} |
```

**校验规则：**
- 每行对应一个 `apis/endpoints/` 下已有的文件
- Method 必须是：GET, POST, PUT, DELETE, PATCH

---

## workflows/README.md（流程索引）

**填空模板：**

```markdown
# 操作流程
| 文件 | 描述 | 起点 | 步骤数 |
|------|------|------|--------|
| flows/{name}.json | {描述} | {页面} | {N} |
```

---

## pages/{page}.json

**填空模板**（只能填字段值，不能加包装层）：

```json
{
  "{元素名}": {
    "locator": {
      "type": "css",
      "selector": "{CSS选择器}",
      "altSelectors": ["{备用选择器}"]
    },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  }
}
```

**Schema 校验：**
| 字段 | 必填 | 允许的值 |
|------|------|----------|
| `locator.type` | 是 | css, shadow, xpath, iframe |
| `locator.selector` | 是 | 字符串 |
| `locator.altSelectors` | 否 | 字符串数组 |
| `capabilities` | 是 | click, type, input, focus, hover, scroll, read |
| `interaction.action` | 是 | click, type, input, scroll, wait, hover, pressKey, select, evaluate |
| `interaction.method` | 是 | dom, cdp, execCommand |

**禁止字段：** `page`、`url`、`title`、`parameters` 在根级别。

---

## navigation/{from}-to-{to}.json

**填空模板：**

```json
{
  "{来源}->{目标}": {
    "from": "{来源页面}",
    "to": "{目标页面}",
    "steps": [{ "action": "click", "page": "{来源}", "target": "{元素名}" }],
    "backMethods": [{ "action": "browser_back" }]
  }
}
```

**校验规则：**
- `from` 和 `to` 必须匹配 `pages/` 中的页面名
- `steps[].action` 必须是：click, type, input, scroll, wait
- `steps[].target` 必须引用 `pages/{from}.json` 中的元素名

---

## workflows/flows/{name}.json

**填空模板：**

```json
{
  "{流程名}": {
    "description": "{这个流程做什么}",
    "startsOn": "{起始页面}",
    "steps": [
      { "action": "click", "target": "{元素名}" },
      { "action": "type", "target": "{元素名}", "params": { "text": "___输入内容___" } }
    ]
  }
}
```

**校验规则：**
| 字段 | 必填 | 说明 |
|------|------|------|
| `description` | 是 | 一句话描述 |
| `startsOn` | 是 | 必须匹配 `pages/` 中的页面名 |
| `steps[].action` | 是 | click, type, input, scroll, wait, hover, pressKey, select, evaluate |
| `steps[].target` | 是 | 必须引用起始页面中的元素名 |
| `params.text` | type 动作时必填 | 变量部分用 `___占位符___` |

**禁止字段：** `locator`（用 `target`）、`duration`（用 `params.ms`）。

---

## workflows/scripts/{name}.json

**填空模板：**

```json
{
  "name": "{脚本名}",
  "steps": [
    { "method": "browser_open", "params": { "url": "{URL}" } },
    { "method": "browser_wait", "params": { "ms": 2000 } },
    { "method": "browser_click", "params": { "selector": "{CSS选择器}" } }
  ]
}
```

**校验规则：**
- 每步的 `method` 必须是有效的 MCP 工具名（browser_xxx 或 browser_network_xxx）
- MCP 脚本是给 Extension 直接执行的，不是给 LLM 解释的

---

## apis/endpoints/{name}.json

**填空模板：**

```json
{
  "{能力名}": {
    "description": "{这个 API 做什么}",
    "method": "GET",
    "url": "https://{完整API地址}",
    "params": {
      "{参数名}": { "type": "string", "required": true, "source": "user_input" }
    },
    "response": { "type": "json", "fields": ["{字段1}", "{字段2}"] },
    "boundTo": ["{workflow名}"],
    "discoveredAt": "{YYYY-MM-DD}"
  }
}
```

**校验规则：**
| 字段 | 必填 | 说明 |
|------|------|------|
| `description` | 是 | 一句话描述 |
| `method` | 是 | GET, POST, PUT, DELETE, PATCH |
| `url` | 是 | 完整 URL，以 https:// 开头 |
| `params` | 否 | 参数定义对象 |
| `response.fields` | 否 | 字段名数组 |
| `boundTo` | **是** | 此 API 替代的 workflow 名称数组 |
| `discoveredAt` | **是** | 日期，YYYY-MM-DD 格式 |

**禁止字段：** `endpoint`、`auth`、`request`、`response.context`、`name` 在根级别。
