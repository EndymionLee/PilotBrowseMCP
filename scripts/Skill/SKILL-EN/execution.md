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

### Script Generation (PAB)

When the user says "做成脚本" or "make this a script":

1. Check `website-manuals/<site>/` for manual data
2. Read `apis/` for API calls, `pages/` for selectors, `workflows/` for steps
3. Generate a `.pab` file with control flow where needed
4. Save it to `workflows/scripts/<name>.pab`

**PAB syntax quick reference:**

Tool names and parameters are the same as the MCP tools you already use. Just write them directly.

```python
# Comment
name: str = "script"       # Variable with type (optional)
count: int = 5
items: list = ["a", "b"]   # List literal
data: dict = {"key": val}  # Dict literal (for overrides, headers)
ok: bool = true

browser_open(url)          # Tool call, same as MCP
browser_click(selector)    # Same params as browser_click MCP tool
result = browser_evaluate(code="document.title")  # Return value

if result:                 # Condition
    browser_screenshot()

if not ok:                 # Not operator
    browser_quit()

if "video" in text:        # In operator (string contains)
    browser_click(".btn")

for i in range(5):         # Loop
    browser_wait(1000)

while page < 10:            # While loop
    page = page + 1

fn my_func():               # Function
    browser_click(".btn")

my_func()                   # Function call
```

**PAB vs MCP:** No mapping needed. All MCP tools (55) work in PAB with the same names. Examples:

```python
# Page tools
result = browser_evaluate("document.title")
links = browser_extract_links()
h1 = browser_query("h1")
text = browser_get_text()

# Actions
browser_click(".btn")
browser_type("#input", "text")
browser_scroll(direction="down", amount=300)
browser_find(text="Submit", tag="button")

# Network
browser_start_network_monitor()
data = browser_network_search(keyword="api", mimeType="application/json")
browser_network_wait("/api/submit", method="POST", timeout=10000)

# Tabs
tabs = browser_list_tabs()
browser_close()
browser_activate()

# Data
cookies = browser_cookies()
browser_screenshot()
```

**Mapping workflow to PAB:**

| Workflow step | PAB |
|--------------|-----|
| `click` | `browser_click(selector)` |
| `type` | `browser_type(selector, text)` |
| `navigate` | `browser_open(url)` |
| Wait for API | `browser_start_network_monitor()` before, then `browser_network_wait(urlPattern)` |

**Example - manual data to PAB:**

From the manual:
```
apis/endpoints/search.json:  GET /api/search?keyword=
pages/homepage.json:          searchInput (#search), searchButton (.search-btn)
```

Generated PAB:
```python
input keyword
browser_open("https://examplesite.com")
browser_wait(2000)
browser_type("#search", keyword)
browser_click(".search-btn")
result = browser_network_wait("/api/search", method="GET")
```

Save the file as `workflows/scripts/<name>.pab`. The user loads it from the Extension popup and runs it.

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
