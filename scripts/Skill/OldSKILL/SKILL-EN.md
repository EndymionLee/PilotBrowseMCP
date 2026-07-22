---
name: website-explorer
description: Discover website capabilities from user behaviors. Learn APIs and automate workflows.
---

# Website Capability Learner

## Core Concept

Not "explore websites and generate manuals". Instead:

> **Discover website capabilities through user behaviors. APIs and automation workflows are both implementations of the same capability.**

```
User Behavior
      |
      +-- Network Monitor --> API Discovery
      +-- Action Trace   --> Automation Workflow
      |                          |
      +------- Capability <------+
                  |
      +-----------+
      |
  Implementation
      |
  +---+---+
  |       |
 API     Workflow
 (fast)  (fallback/learning source)
```

---

## 1. Exploration Phase

Goal: Trigger user behaviors and collect raw data.

- Discover page structure and interactive elements
- Trigger actions (search, click, type, scroll)
- Start network monitoring before interacting
- Record all user operations as action traces

Output:

```
exploration/
  pages/         # Page structure and interactive elements
  traces/        # Recorded user action sequences
  network-events # Raw network request/response pairs
```

Tools: `inspect_page`, `query`, `click`, `type`, `start_network_monitor`

---

## 2. API Discovery Phase

Goal: From network events, extract clean, reusable API definitions.

Every user interaction produces network requests. Not all of them are useful APIs.

### Process

```
start_network_monitor
  -> interact (trigger API calls)
  -> network_search (find JSON APIs)
  -> network_detail (inspect request/response)
  -> save to apis/<name>.json
```

### What Makes a Good API

| Signal | Meaning |
|--------|---------|
| `mimeType: application/json` | Structured data, not a file |
| `method: GET` | Read operation, safe to replay |
| `method: POST/PUT/DELETE` | Write operation, needs care |
| Response has data fields | Contains actual business data |
| Request has query/body params | Can be parameterized |

### Save API Definition

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
    "response": {
      "type": "json",
      "fields": ["id", "name", "price", "sales"]
    },
    "boundTo": ["searchProductsWorkflow"],
    "discoveredAt": "2026-07-22"
  }
}
```

Tool chain: `network_search` -> `network_detail` -> save to `apis/`

---

## 3. Capability Learning Phase

Goal: Bind API and automation into a single capability model.

### The Capability Model

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
      "response": { "fields": ["id", "name", "price", "sales"] },
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

### Key Design

- **API is the primary implementation** -- fast, token-efficient, stable
- **Automation workflow is the secondary implementation** -- fallback, learning source, context provider
- **Both implement the same capability** -- interchangeable at execution time

### Why Keep Both

| Situation | What Happens |
|-----------|-------------|
| API works | Direct call, minimal tokens |
| API returns 401 | Run login workflow, retry API |
| API signature expires | Run browser workflow to refresh context |
| API changes | Fall back to browser workflow, re-discover |
| Browser workflow fails | Re-explore, update capability |

Output: Save to `apis/<name>.json` with `boundTo` linking to workflows.

---

## 4. Capability Execution Phase

Goal: Execute a capability using the best available implementation.

### Decision Flow

```
Call capability
  |
  API exists and valid?
    -> Yes: network_replay (fast path)
    -> No / fails:
         browser workflow exists?
           -> Yes: execute workflow, fallback to DOM
           -> No: explore from scratch
```

### Execution Modes

| Mode | Tool | When |
|------|------|------|
| API (no auth) | `network_replay` | Public APIs, data refresh |
| API (browser auth) | `network_replay({ options: { context: "browser" } })` | Authenticated APIs |
| Browser workflow | `click` / `type` / `evaluate` | Signed APIs, login flows |
| Browser + wait | `click` + `network_wait` | Trigger action, wait for API |

---

## 5. Capability Evolution Phase

Goal: Each execution improves the capability.

### Evolution Loop

```
First visit:
  browser workflow only (learn how to do it)

After API discovery:
  API added as primary implementation
  browser workflow kept as fallback

After API improvement:
  Parameters refined, response fields documented
  Error handling added (401 -> refresh login)

After site changes:
  API breaks -> fallback to browser workflow
  Re-discover API -> update implementation
```

### When to Trigger Evolution

| Signal | Action |
|--------|--------|
| New API found during execution | Add to capability as primary |
| API returns 401/403 | Log auth as precondition |
| Browser workflow fails | Mark workflow as stale, re-explore |
| Multiple similar APIs | Merge into parameterized capability |
| GraphQL endpoint found | Replace multiple REST calls with one query |

---

## 6. Batch Tasks: Use Python Scripts

For batch, concurrent, or multi-page scraping, don't call MCP tools one by one. Generate Python scripts based on discovered APIs.

```python
import requests, json, time

# From apis/ definitions
API = "https://examplesite.com/api/chapter"
HEADERS = {"Cookie": "session=xxx"}

ids = list(range(1, 101))
for i, cid in enumerate(ids):
    resp = requests.get(API, params={"id": cid}, headers=HEADERS)
    with open(f"chapters/{cid}.json", "w") as f:
        json.dump(resp.json(), f, ensure_ascii=False)
    print(f"[{i+1}/100] chapter {cid} done")
    time.sleep(0.5)
```

Script executes directly, LLM only sees the summary.

---

## Output Directory

```
website-manuals/<site>/
  README.md          # Root index
  pages/             # Page interaction models
  navigation/        # Navigation paths
  workflows/
    README.md        # Workflow index (name + description)
    flows/           # Workflow JSON files
  apis/
    README.md        # API index (name + description)
    endpoints/       # API JSON files
```

Every directory uses the same pattern: an index README at the directory level, with detail files in a subdirectory. The index is lightweight so the Agent can browse without loading every file.

### README.md (site root)

**What**: Entry point. Agent reads this first to see what's available.

**Template**:

```markdown
# <Site> Manual
- Pages: see [pages/](pages/)
- Navigation: see [navigation/](navigation/)
- Workflows: see [workflows/](workflows/)
- APIs: see [apis/](apis/)
```

### pages/<page>.json

**What**: Interactive elements on a page. One file per page type.

**How**: Created by `workflow_add_element` tool when user marks elements, or manually by Agent after scanning.

**Schema**:

```json
{
  "likeButton": {
    "locator": { "type": "css", "selector": ".video-like", "altSelectors": ["button[title*='like']"] },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  },
  "searchInput": {
    "locator": { "type": "css", "selector": "#search" },
    "capabilities": ["click", "type", "clear"],
    "interaction": { "action": "input", "method": "dom" }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `locator.type` | yes | css, shadow, xpath, iframe |
| `locator.selector` | yes | CSS selector or XPath |
| `locator.altSelectors` | no | Fallback selectors |
| `capabilities` | yes | What actions this element supports |
| `interaction` | yes | How to interact with it |

### navigation/<from>-to-<to>.json

**What**: How to navigate from page A to page B.

**How**: Created manually by Agent after discovering the path.

**Schema**:

```json
{
  "Home->Video Page": {
    "from": "Home",
    "to": "Video Page",
    "steps": [{ "action": "click", "page": "Home", "target": "videoCard" }],
    "backMethods": [{ "action": "browser_back" }]
  }
}
```

### workflows/README.md

**What**: Workflow directory index. Lists all workflows with name and description.

```markdown
# Workflows
| File | Description | Start Page | Steps |
|------|-------------|------------|-------|
| flows/search.json | Search products | Home | 3 |
```

### workflows/flows/<name>.json

**What**: Automation workflow steps. Created by `workflow_generate` from user recordings, or manually.

```json
{
  "searchProducts": {
    "description": "Search products by keyword",
    "startsOn": "Home",
    "steps": [
      { "action": "click", "target": "searchInput" },
      { "action": "type", "target": "searchInput", "params": { "text": "___keyword___" } },
      { "action": "click", "target": "searchButton" }
    ]
  }
}
```

**Action types**: click, type, input, scroll, wait, hover, pressKey, select, evaluate

### apis/README.md

**What**: API directory index. Agent reads this first to find which API to use.

```markdown
# APIs
| File | Description | Method | URL | Workflow |
|------|-------------|--------|-----|----------|
| endpoints/search.json | Search products | GET | /api/search | searchProducts |
```

### apis/endpoints/<name>.json

**What**: API definition. Must include `boundTo` linking to the fallback workflow. Created by Agent after discovering via network monitor.

**Schema**:

```json
{
  "searchProducts": {
    "description": "Search product listing by keyword",
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

| Field | Required | Description |
|-------|----------|-------------|
| `method` | yes | GET, POST, PUT, DELETE |
| `url` | yes | Full or relative URL |
| `params` | no | Parameters with type, required, source |
| `response.fields` | no | Key fields in response |
| `boundTo` | yes | Links to workflow name for fallback |
| `preconditions` | no | e.g. authenticated |

## Tool Reference

### Network Pipeline

| Tool | Phase | Purpose |
|------|-------|---------|
| `start_network_monitor` | 1 | Begin capturing requests |
| `stop_network_monitor` | -- | Stop (cache preserved) |
| `browser_network_search` | 2 | Find APIs by pattern |
| `browser_network_detail` | 2 | Inspect request/response |
| `browser_network_wait` | 4 | Wait for API after action |
| `browser_network_replay` | 4 | Execute API (server or browser context) |
| `browser_network_export` | -- | Export as curl/fetch/Python |
| `browser_network_analyze` | 2 | Analyze API structure |
| `browser_network_clear_cache` | -- | Clear without stopping |

### Page Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `current_page` | 1 | Know current location |
| `inspect_page` | 1 | Understand page structure |
| `query` | 1 | Find interactive elements |
| `click`, `type`, `scroll` | 1 | Trigger behaviors |
| `evaluate` | 4 | Execute JS in page context |
| `wait_for_element` | 4 | Wait for dynamic content |
| `find` | 1 | Locate by text/role/label |

### Content Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `get_markdown` | 1 | Read page content (preferred) |
| `get_text` | 1 | Plain text fallback |
| `get_html` | 1 | Last resort (heavy) |
| `save_content` | -- | Save to disk (zero LLM tokens) |
| `save_xpath` | -- | Save by XPath |
| `extract_article` | 1 | Article metadata |
| `extract_table` | 1 | Table as JSON |
| `extract_links` | 1 | All links on page |
| `extract_images` | 1 | Image info |

### Workflow Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `workflow_list_recordings` | 1 | View user recordings |
| `workflow_get_recording` | 1 | Get recording details |
| `workflow_generate` | 3 | Save workflow |
| `workflow_add_element` | 1 | Save marked elements |
| `workflow_list` | -- | List saved workflows |

### Data Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `cookies` | 4 | Read auth cookies |
| `local_storage` | 4 | Read stored data |
| `screenshot` | -- | Visual capture |
| `permissions_list / grant / revoke` | -- | Permission management |
