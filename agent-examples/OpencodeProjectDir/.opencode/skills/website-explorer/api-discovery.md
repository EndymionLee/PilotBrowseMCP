# 2. API Discovery Phase

Goal: From network events, extract clean, reusable API definitions.

## Process

```
start_network_monitor
  -> interact (trigger API calls)
  -> network_search (find JSON APIs)
  -> network_detail (inspect request/response)
  -> save to apis/<name>.json
```

## What Makes a Good API

| Signal | Meaning |
|--------|---------|
| `mimeType: application/json` | Structured data, not a file |
| `method: GET` | Read operation, safe to replay |
| `method: POST/PUT/DELETE` | Write operation, needs care |
| Response has data fields | Contains actual business data |
| Request has query/body params | Can be parameterized |

## Save API Definition

```json
{
  "searchProducts": {
    "description": "Search product listing",
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

## Tool Chain

| Tool | Purpose |
|------|---------|
| `start_network_monitor` | Begin capturing |
| `browser_network_search` | Find APIs by keyword, mimeType, urlPattern |
| `browser_network_detail` | Inspect full request/response details |
| `browser_network_analyze` | Get API structure overview |
| `browser_network_export` | Export as curl/fetch/Python for testing |
