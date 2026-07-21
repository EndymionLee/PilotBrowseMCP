---
name: website-explorer
description: >
  Deeply explore any website like a spider. Start from the homepage, click into subpages, explore, go back,
  and explore the next entry. Record interactive elements and navigation paths to generate a complete site manual.
---

# Website Explorer

## Core Philosophy

Not recording "DOM elements" -- record **"browser interaction capabilities"**.

```diff
- Record: { selector: ".brt-editor", type: "type" }
+ Record: {
+   locator: { type: "shadow", host: "x-comments", selector: ".brt-editor" },
+   capabilities: ["focus", "insertText", "clear"],
+   interaction: { action: "insert_text", method: "cdp" }
+ }
```

Exploration order:
1. **Homepage** -- record nav bar, search bar, card list
2. **Click into a video** -- record like, comment, share, subscribe
3. **Go back** -- click into search page, record filters, sorting
4. **Go back** -- click into account menu, record settings
5. Repeat until all major page types are covered

## Output Directory

```
website-manuals/<site>/
├── README.md              # Manual overview (read this first!)
├── meta.json              # Site info + page map + API map
├── pages/                 # Page interaction models (JSON)
├── navigation/            # Navigation paths
├── workflows/             # Operation workflows (with fallback)
├── apis/                  # API definitions (mapped to skills/workflows)
└── capabilities.json      # Browser capability model (auto-generated)
```

---

## Manual Overview README.md

Every manual directory **must** contain a `README.md` overview file.

### Why README.md

The agent **must** read README.md first to get the full directory and summary, avoiding incomplete information from missing files.

### README.md Template

```markdown
# <Site Name> Manual

## Site Info
- **URL**: https://example.com/
- **Exploration Date**: 2026-07-17

## Pages (pages/)
| File | Page | Key Elements |
|------|------|-------------|
| homepage.json | Home | Search bar, nav, cards |
| video-page.json | Video | Like/comment/share, comment editor (Shadow DOM) |
| search-results.json | Search | Filters, video cards |

## Navigation Paths (navigation/)
| File | Path |
|------|------|
| homepage-to-video.json | Homepage -> Video Page |
| homepage-to-search.json | Homepage -> Search Results |

## Workflows (workflows/)
| File | Function | Start Page |
|------|----------|-----------|
| search-book.json | Search books | Home |
| post-comment.json | Post comment (Shadow DOM + fallback) | Video Page |

## Notes
- Comments are inside `<x-comments>` Shadow DOM, requires CDP insertText
- Search box supports standard DOM type
```

### When to Update README.md

| Action | Need Update? |
|--------|-------------|
| Full new site exploration | **Required** |
| New pages/ file | **Required** - update page list |
| New navigation/ path | **Required** - update nav section |
| New workflows/ file | **Required** - update workflow section |
| Fix selectors, update element records | Not needed |
| Add fallback strategies | Not needed |

---

## Tool Selection Priority (Token-Saving Principle)

When exploring pages, **always use lighter tools first**. Heavy full-source tools are the last resort.

| Priority | Tool | Data Size | Use Case |
|----------|------|-----------|----------|
| 1 | `current_page` | Tiny (URL+title) | Confirm current page |
| 2 | `inspect_page` | Small (structure summary) | Quick page structure |
| 3 | `query` | Small (element list + coords) | Find specific elements, get selectors |
| 4 | `get_markdown` | Medium (readable text) | **Preferred** - structured, token-efficient |
| 5 | `get_text` | Medium-Large (plain text) | Full visible text when needed |
| 6 | `get_html` | **Huge (full DOM)** | **Only when above are insufficient** |

### Decision Flow

```
Want page content
  -> Want structure -> inspect_page
  -> Want interactive elements -> query(selector)
  -> Want readable content -> get_markdown
  -> markdown missing info -> get_text
  -> Still not enough -> Last resort: get_html
```

> **get_html can return hundreds of KB to MB, consuming massive tokens.**
> **80% of scenarios, the first 4 tools are enough.**

---

## Large Text Content Scraping Rules

**When scraping articles, novels, documents or other large text: never send the content to the LLM and then have the LLM write it to disk.**

Correct flow:

```
1. browser_get_markdown / get_text / get_html to fetch content directly
2. Use workflow.save_file or files tools to write directly to disk
3. LLM only decides "what to scrape, where to save" -- does not touch the raw content
```

> A novel can be hundreds of thousands of characters. Sending it through the LLM and back doubles token consumption.
> Tools read and write directly, content never enters the LLM context.

---

## Batch Tasks: Use Python Scripts

For batch, concurrent, or multi-page scraping tasks, don't use MCP tools one by one. Generate Python scripts based on the manual and exploration experience.

### When to Use

- Batch scraping articles/novel chapters (hundreds of pages)
- Concurrent API requests (pagination, batch queries)
- Data collection using APIs discovered in the manual

### Approach

```
1. Reference API definitions (apis/) and page elements (pages/) from the manual
2. Generate a Python script using requests / aiohttp to call APIs directly
3. If browser is needed, use Playwright with selectors from the manual
4. Script writes directly to disk, bypassing the LLM
```

### Example

Manual shows the novel API is `GET /api/chapter?id={id}`, returns JSON:

```python
import requests, json, time

# From manual apis/
API = "https://examplesite.com/api/chapter"
HEADERS = {"Cookie": "session=xxx"}

ids = list(range(1, 101))
for i, cid in enumerate(ids):
    resp = requests.get(API, params={"id": cid}, headers=HEADERS)
    with open(f"chapters/{cid}.json", "w", encoding="utf-8") as f:
        json.dump(resp.json(), f, ensure_ascii=False)
    print(f"[{i+1}/100] chapter {cid} done")
    time.sleep(0.5)
```

### Rules

- Batch tasks always use scripts, never call MCP tools one by one in an LLM loop
- API endpoints, params, cookies come from the manual
- Script only returns a summary to the LLM (N succeeded, M failed)

---

## Network Monitoring (API-First Strategy)

SPA pages (React/Vue) load data via XHR/Fetch, the HTML is just a shell. Extracting data from API responses beats parsing DOM. Use these network tools:

| Tool | Purpose |
|------|---------|
| `start_network_monitor` | Start intercepting and caching requests |
| `stop_network_monitor` | Stop monitoring (cache preserved for replay) |
| `browser_network_clear_cache` | Clear cached requests without stopping monitoring |
| `browser_network_search` | Search cached requests. Filter by keyword / urlPattern / method / statusCode / mimeType / sort |
| `browser_network_detail` | Get full request details (URL, method, headers, body, status, timing, size) |
| `browser_network_wait` | Wait for a matching request to arrive and complete, replaces fixed delay |
| `browser_network_replay` | Replay with overrides (query/headers/body) + extract (JSON path) |
| `browser_network_export` | Export as curl / fetch / Python / HAR code |
| `browser_network_analyze` | Analyze site API structure: catalog, purpose, data flow, replay templates |
| `browser_network_override` | Set response override rules (body/status/header interception) |

### When to Use

| Scenario | Approach | Effect |
|----------|----------|--------|
| Search listings / products / content | Monitor -> search API -> extract from JSON | 1/5 tokens vs DOM |
| Pagination / load more | replay + overrides to modify page/offset | Skip page rendering |
| Product details / price / stock | replay for latest values | Single request vs full page |
| Wait for an API after clicking | click/type then browser_network_wait on URL pattern | Replaces fixed delay, more reliable |
| Understand site API structure | browser_network_analyze after exploring | Output can be saved to apis/ |
| Testing / debugging / bypass | browser_network_override with response rules | -- |

### Pipeline

```
start_network_monitor -> interact with page -> browser_network_search
                                   |
                                   +-> browser_network_detail -> inspect details
                                   |     +-> browser_network_replay (overrides + extract)
                                   |     +-> browser_network_export (code generation)
                                   |     +-> browser_network_analyze (API structure)
                                   |
                                   +-> browser_network_wait (wait for specific request)
```

> API first, DOM second. Network monitoring works best on SPAs where most data loads via API.
> Server-rendered pages still rely on get_markdown / query.

---

## Exploration Process

### Step 0: Prepare

```javascript
const tabs = await mcp({tool:"browser_mcp_browser_list_tabs"})
const tab = tabs.find(t => t.active)
const TAB_ID = tab.id
const BASE_URL = tab.url

// Start network monitor to cache all XHR/Fetch requests
await mcp({tool:"browser_mcp_browser_start_network_monitor", args:{tabId: TAB_ID}})
```

### Step 1: Light Scan (`lightScan`, Preferred)

```javascript
// Get current page URL and title
const info = await mcp({tool:"browser_mcp_browser_current_page", args:{tabId: TAB_ID}})

// Get page structure summary
const structure = await mcp({tool:"browser_mcp_browser_inspect_page", args:{tabId: TAB_ID}})

// Scan interactive elements
const interactives = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId: TAB_ID,
  selector: `input, textarea, [contenteditable], [role=textbox],
    button, [role=button], a[href], select,
    [tabindex], [draggable],
    [contenteditable=true] div, iframe`
}})

// Get readable content (preferred)
const markdown = await mcp({tool:"browser_mcp_browser_get_markdown", args:{tabId: TAB_ID}})
```

### Step 1 Alt: Deep Scan (`deepScan`, fallback)

```javascript
// Upgrade when light scan is not enough
const fullText = await mcp({tool:"browser_mcp_browser_get_text", args:{tabId: TAB_ID}})

// Last resort
const html = await mcp({tool:"browser_mcp_browser_get_html", args:{tabId: TAB_ID}})

// Scan Shadow DOM containers
const shadowHosts = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId: TAB_ID,
  selector: 'x-comments, *[id*="shadow"], *[class*="shadow"]'
}})

// Scan entry links
const entryLinks = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId: TAB_ID, selector: "a[href]"
}})
```

#### Record enhanced info for each element:

```javascript
const elementInfo = {
  tag: element.tag,
  attributes: {
    contenteditable: element.attributes.contenteditable || null,
    role: element.attributes.role || null,
    tabindex: element.attributes.tabindex || null
  },
  computedRole: computedRole,
  hasShadowRoot: hasShadowRoot,
  isInShadow: isInShadow,
  shadowPath: shadowPath,
  events: ["input", "keydown", "click"],
  boundingBox: boundingBox
}
```

### Step 2: Drill Into Subpages (`drill`)

```
Current Page: Homepage
  -> Click video card
Subpage: Video Page
  -> Scan all interactive elements (include Shadow DOM)
  -> Test input interaction modes
  -> Save to pages/video-page.json
  -> Save navigation path
  -> Search network requests, discover APIs
  -> Save to apis/<name>.json
  -> Go back
```

**Must return to previous page after each subpage exploration!**

```javascript
async function exploreSubPage(tabId, parentPageKey, entrySelector, subPageKey, description) {
  saveNavigation(`${parentPageKey}->${subPageKey}`, {
    from: parentPageKey, to: subPageKey,
    steps: [{action: "click", page: parentPageKey, selector: entrySelector}]
  })

  await mcp({tool:"browser_mcp_browser_click", args:{tabId, selector: entrySelector}})
  await mcp({tool:"browser_mcp_browser_wait", args:{tabId, ms: 1500}})

  await pierceScan(tabId, subPageKey)
  await testInputCapabilities(tabId, subPageKey)

  // API discovery: search network requests from page interaction
  const apis = await mcp({tool:"browser_mcp_browser_network_search", args:{
    tabId,
    mimeType: "application/json",
    limit: 30
  }})
  if (apis.results?.length) {
    saveApis(tabId, subPageKey, apis.results)
  }

  // Go back: browser back button or click the logo
}
```

### Step 3: Save to Modular Directory

#### `meta.json`

```json
{
  "manual": { "site": "ExampleSite", "baseUrl": "https://www.example.com/", "date": "2026-07-17" },
  "siteMap": {
    "Home": { "url": "/", "childrenPages": ["Video Page", "Search Results"] },
    "Video Page": { "urlPattern": "/video/", "from": "Home" },
    "Search Results": { "urlPattern": "/search?keyword=", "from": "Home" }
  },
  "apiMap": {
    "search": { "method": "GET", "urlPattern": "/api/search?keyword=", "mimeType": "application/json", "usedBy": ["searchVideo", "searchBook"] },
    "productDetail": { "method": "GET", "urlPattern": "/api/product/*", "mimeType": "application/json", "usedBy": ["getProductInfo"] }
  }
}
```

- `apiMap` records all discovered APIs for the site
- `usedBy` links to workflow names, meaning the workflow can use this API instead of DOM operations

#### `apis/<name>.json` -- API definition (mapped to workflows)

Records APIs discovered via network monitoring, linked to workflows. When executing, prefer API over DOM.

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
    "usedBy": ["searchProductsWorkflow"],
    "discoveredAt": "2026-07-17"
  }
}
```

| Field | Description |
|-------|-------------|
| `method` / `url` | HTTP method and endpoint |
| `params` | Parameter list, marks which come from user input |
| `response.fields` | Key fields in the API response |
| `usedBy` | Links to `workflows/` names |

**Rule:** If the current workflow has a matching API definition, use `browser_network_replay` to get data instead of operating the page DOM.

#### `pages/<page>.json`

```json
{
  "likeButton": {
    "locator": { "type": "css", "selector": ".video-like",
      "altSelectors": ["button[title*='like']", "[class*='like']"] },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  },
  "commentEditor": {
    "locator": {
      "type": "shadow",
      "path": [{ "host": "x-comments", "shadow": true }, { "selector": "#input .brt-editor" }]
    },
    "capabilities": ["focus", "insertText", "clear"],
    "interaction": {
      "action": "insert_text", "method": "cdp",
      "notes": "Standard type() fails due to contenteditable + React, needs CDP Input.insertText"
    }
  }
}
```

**Locator Types:**

| Type | Use Case | Example |
|------|----------|---------|
| `css` | Normal DOM | `{ type:"css", selector:".video-like" }` |
| `shadow` | Web Component | `{ type:"shadow", path:[{host:"x-comments",shadow:true},{selector:".brt-editor"}] }` |
| `iframe` | iframe | `{ type:"iframe", frameSelector:"iframe#sandbox", innerSelector:".btn" }` |
| `xpath` | Complex | `{ type:"xpath", selector:"//div[@class='menu']//button" }` |

#### `navigation/<from>-to-<to>.json`

```json
{
  "Home->Video Page": {
    "steps": [{"action": "click", "page": "Home", "target": "videoCardLink"}],
    "backMethods": [{"action": "browser_back"}]
  }
}
```

#### `workflows/<name>.json`

```json
{
  "postComment": {
    "steps": [
      { "action": "scroll", "target": "commentApp" },
      { "action": "click", "target": "commentEditor" },
      { "action": "input", "target": "commentEditor",
        "strategy": "auto",
        "fallback": ["cdp_insert_text", "execCommand", "input_event_dispatch"],
        "params": { "text": "___content___", "clear": true } },
      { "action": "click", "target": "commentSubmitBtn" }
    ]
  }
}
```

**Workflow Actions:** click, input, hover, scroll, wait, pressKey, select, evaluate

#### `capabilities.json` (Auto-generated)

```json
{
  "videoPage": {
    "commentEditor": {
      "supports": ["shadow-dom", "contenteditable", "cdp-input-required"],
      "unsupported": ["dom-type"],
      "recommendedMethod": "cdp",
      "knownIssues": ["browser_type() fails due to React state control"]
    }
  }
}
```

---

## Interaction Model Upgrade

| Old Model | New Model |
|-----------|-----------|
| `selector: ".brt-editor"` | `locator: { type:"shadow", path:[...] }` |
| `type: "type"` | `capabilities: ["focus","insertText","clear"]` |
| `type: "click"` | `interaction: { action:"click", method:"dom" }` |
| Only `input/textarea` | `input,textarea,[contenteditable],[role=textbox]` |
| Flat DOM scan | `pierceQuery()` penetrates Shadow DOM |

## Selector Priority

| Priority | Locator Type | Example |
|----------|-------------|---------|
| 1 | `css#id` | `#submit-button` |
| 2 | `css[aria]` | `[aria-label*="Like"]` |
| 3 | `css[data-testid]` | `[data-testid="like"]` |
| 4 | `css[name]` | `[name="search_query"]` |
| 5 | `css hierarchy` | `.video-info button` |
| 6 | `shadow pierce` | `x-comments >> .brt-editor` |
| 7 | `xpath` | `//div[@class='menu']//button` |

## pierceQuery -- Shadow DOM Penetration

Standard `querySelector` cannot penetrate Shadow DOM. The explorer needs Chrome DevTools-level piercing:

```
document
  +-- <x-comments>              <- Shadow Host
  |     +-- #shadow-root
  |           +-- <div class="brt-editor" contenteditable>
  +-- <iframe#sandbox>          <- iframe
        +-- #document
              +-- <button>
```

```javascript
const shadowHosts = document.querySelectorAll('x-comments')
for (const host of shadowHosts) {
  const root = host.shadowRoot
  if (!root) continue
  const editors = root.querySelectorAll('[contenteditable], textarea, input')
  // Record pierce path
}
```

### Input Fallback Strategy

| Priority | Method | Applicable |
|----------|--------|------------|
| 1 | CDP Input.insertText | contenteditable + React |
| 2 | document.execCommand('insertText') | Legacy rich text |
| 3 | dispatchEvent(new InputEvent()) | React state control |
| 4 | clipboard + paste | Compatibility |
| 5 | Character-by-character | Last resort |

---

## Manual Updater (Incremental Updates)

### Core Principle

**Existing full manual -> Only explore changed parts -> Update small files -> Rebuild**

Never re-scan unchanged pages.

### Scenario A: Fix a Broken Selector

**Problem**: A button's class changed.

**Steps**:
1. Open only that page
2. Query only the target element
3. Update the selector in the page JSON file

```json
"likeButton": {
  "selector": ".new-class",
  "altSelectors": [".old-class", "button[title*='like']"]
}
```

### Scenario B: New Element Inside Shadow DOM

**Problem**: Discover elements inside a Web Component.

**Steps**:
1. Locate the Shadow Host
2. Record the pierce path
3. Add locator with `type: "shadow"`

```json
"commentEditor": {
  "locator": {
    "type": "shadow",
    "path": [{ "host": "x-comments", "shadow": true }, { "selector": ".brt-editor" }]
  },
  "capabilities": ["focus", "insertText", "clear"],
  "interaction": { "action": "insert_text", "method": "cdp" }
}
```

### Scenario C: New Workflow

**Problem**: Need a new operation workflow.

**Steps**:
1. Open the page, locate target area
2. Test input methods
3. Create workflow file with fallback strategy

### Comparison: Incremental vs Full

| Dimension | Full Exploration | Incremental Update |
|-----------|----------------|-------------------|
| Pages opened | Home + all subpages | **Only the changed page** |
| Elements queried | All | **Only target area** |
| Files modified | Multiple large files | **1-2 small files** |
| Risk | May introduce regressions | **Only affects changed parts** |
| Token consumption | High | **Very low** |
