# 3. Capability Learning Phase

Goal: Bind API and automation into a single capability model.

## The Model

```json
{
  "name": "searchProducts",
  "goal": "Search products by keyword on examplesite",
  "trigger": {
    "action": "search",
    "page": "homepage",
    "description": "Type keyword into search box and press enter"
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

## Why Both

| Situation | What Happens |
|-----------|-------------|
| API works | Direct call, minimal tokens |
| API 401 | Run login workflow, retry API |
| Signature expires | Run browser workflow to refresh |
| API changes | Fallback to browser, re-discover |
| Browser fails | Re-explore, update capability |

## Save

`apis/<name>.json` with `boundTo` linking to workflows.
