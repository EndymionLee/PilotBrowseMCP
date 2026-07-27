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

## Script Execution (No LLM Mode)

Scripts are pre-recorded MCP tool call sequences stored in `workflows/scripts/`. They execute directly in the Extension, bypassing the LLM entirely.

### Script Format

```json
{
  "name": "daily-checkin",
  "steps": [
    { "method": "browser_open", "params": { "url": "https://example.com" } },
    { "method": "browser_wait", "params": { "ms": 2000 } },
    { "method": "browser_click", "params": { "selector": ".checkin-btn" } },
    { "method": "browser_network_wait", "params": { "urlPattern": "/api/checkin", "timeout": 15000 } }
  ]
}
```

### When to Use

- Fixed, repetitive operations (daily check-in, data collection)
- Operations where LLM judgment adds no value
- After the Agent has discovered the correct steps and selectors

### Script Generation

When the user says "做成脚本" or "make this a script":

1. Check `website-manuals/<site>/` for existing manual data
2. Read `apis/README.md` and `apis/endpoints/<name>.json` for API calls
3. Read `pages/<page>.json` for element selectors
4. Combine them into an MCP script
5. Call `workflow_generate_script` to save

**Principles:**

- Use `browser_network_replay` for API calls (from `apis/endpoints/`)
- Use `browser_click/type` for DOM operations (selectors from `pages/`)
- Use `browser_wait` between operations when timing matters
- The script runs without LLM, so every step must have concrete parameters

**Example - converting manual data to script:**

From the manual:
```
apis/endpoints/search.json:  GET /api/search?keyword=
pages/homepage.json:          searchInput (#search), searchButton (.search-btn)
workflows/flows/search.json:  click searchInput, type keyword, click searchButton
```

Generated script:
```json
steps: [
  { "method": "browser_click", "params": { "selector": "#search" } },
  { "method": "browser_type", "params": { "selector": "#search", "text": "___keyword___" } },
  { "method": "browser_click", "params": { "selector": ".search-btn" } },
  { "method": "browser_network_replay", "params": { "requestId": null, "overrides": { "query": { "q": "___keyword___" } } } }
]
```

Save with `workflow_generate_script`:

```json
workflow_generate_script({
  site: "youtube_com",
  scriptName: "daily-checkin",
  description: "Daily check-in on pixiv",
  steps: [
    { "method": "browser_open", "params": { "url": "https://pixiv.net" } },
    { "method": "browser_wait", "params": { "ms": 3000 } },
    { "method": "browser_click", "params": { "selector": ".checkin-btn" } }
  ]
})
```

When the user says "make this a script", generate the script and save it with `workflow_generate_script`.

### Script Execution

**From popup:** Click **Scripts > Load**, select the `.json` file, click **Run**.

**From Agent:** Use `workflow_execute_script` to run a saved script directly:

```json
workflow_execute_script({ site: "youtube_com", scriptName: "checkin" })
```

The Agent uses this to run scripts without user interaction. Results show per-step status.

### Script Optimization

If a script fails (wrong selector, changed page), tell the Agent: "the checkin script step 3 doesn't work". The Agent inspects the page, fixes the parameters, and updates the script.

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
