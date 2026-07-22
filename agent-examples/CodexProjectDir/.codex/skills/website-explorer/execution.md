# 4. Capability Execution Phase

Goal: Execute a capability using the best available implementation.

## Decision Flow

```
Call capability
  |
  API exists and valid?
    -> Yes: browser_network_replay (fast path)
    -> No / fails:
         browser workflow exists?
           -> Yes: execute workflow, fallback to DOM
           -> No: explore from scratch
```

## Execution Modes

| Mode | Tool | When |
|------|------|------|
| API (no auth) | `browser_network_replay` | Public APIs, data refresh |
| API (browser auth) | `browser_network_replay({ options: { context: "browser" } })` | Authenticated APIs |
| Browser workflow | `click` / `type` / `evaluate` | Signed APIs, login flows |
| Browser + wait | `click` + `browser_network_wait` | Trigger action, wait for API result |

## Evaluate + Wait Pattern

For APIs with anti-scraping signatures (w_rid, wts, etc.):

```javascript
// 1. Trigger the action in page context
await mcp({tool:"browser_mcp_browser_evaluate", args:{
  tabId,
  code: `document.querySelector('.submit-btn').click()`
}})

// 2. Wait for the resulting API call
const result = await mcp({tool:"browser_mcp_browser_network_wait", args:{
  tabId,
  urlPattern: "/api/submit",
  method: "POST",
  timeout: 10000
}})
```

This lets the page generate fresh signatures. No reverse engineering needed.
