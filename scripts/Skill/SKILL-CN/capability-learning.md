# 3. 能力学习阶段

目标：将 API 和自动化绑定为统一的能力模型。

## 模型

```json
{
  "name": "searchProducts",
  "goal": "在示例网站上搜索商品",
  "trigger": {
    "action": "search",
    "page": "homepage",
    "description": "在搜索框输入关键词并回车"
  },
  "implementations": [
    {
      "type": "api",
      "method": "GET",
      "url": "https://api.examplesite.com/search",
      "params": { "keyword": "...", "page": 1 },
      "preconditions": ["authenticated"],
      "priority": 1
    },
    {
      "type": "browser",
      "workflow": [
        { "action": "navigate", "page": "homepage" },
        { "action": "click", "target": "searchInput" },
        { "action": "type", "target": "searchInput", "text": "___keyword___" },
        { "action": "click", "target": "searchButton" }
      ],
      "priority": 2
    }
  ]
}
```

## 为什么两者都要保留

| 情况 | 应对 |
|------|------|
| API 正常工作 | 直接调用，token 最少 |
| API 返回 401 | 执行登录 workflow，重试 API |
| 签名过期 | 执行浏览器 workflow 刷新环境 |
| API 变更 | 兜底到浏览器，重新发现 |
| 浏览器 workflow 失败 | 重新探索，更新能力 |

## 保存

`apis/<name>.json`，用 `boundTo` 关联 workflow。
