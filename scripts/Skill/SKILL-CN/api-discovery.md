# 2. API 发现阶段

目标：从网络事件中提取干净、可复用的 API 定义。

## 流程

```
start_network_monitor
  -> 交互操作（触发 API 调用）
  -> network_search（搜索 JSON API）
  -> network_detail（查看请求/响应详情）
  -> 保存到 apis/<name>.json
```

## 什么样的 API 值得保存

| 信号 | 含义 |
|------|------|
| `mimeType: application/json` | 结构化数据，不是文件 |
| `method: GET` | 读操作，可安全重放 |
| `method: POST/PUT/DELETE` | 写操作，需要谨慎 |
| 响应包含数据字段 | 包含实际业务数据 |
| 请求有 query/body 参数 | 可参数化复用 |

## 保存 API 定义

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
    "response": { "type": "json", "fields": ["id", "name", "price", "sales"] },
    "boundTo": ["searchProductsWorkflow"],
    "discoveredAt": "2026-07-22"
  }
}
```

## 工具链

| 工具 | 作用 |
|------|------|
| `start_network_monitor` | 开始抓包 |
| `browser_network_search` | 按 keyword/mimeType/urlPattern 搜索 |
| `browser_network_detail` | 查看完整请求/响应详情 |
| `browser_network_analyze` | 获取 API 结构概览 |
| `browser_network_export` | 导出为 curl/fetch/Python 用于测试 |
