# 1. Exploration Phase

Goal: Trigger user behaviors and collect raw data.

## Process

```
start_network_monitor
  -> discover current page (current_page)
  -> inspect page structure (inspect_page)
  -> find interactive elements (query, find)
  -> trigger actions (click, type, scroll)
  -> read content (get_markdown)
  -> repeat for subpages (drill pattern)
```

## Page Discovery

### Light Scan (Preferred)

```javascript
// 1. Current page info
const info = await mcp({tool:"browser_mcp_browser_current_page", args:{tabId}})

// 2. Page structure summary
const structure = await mcp({tool:"browser_mcp_browser_inspect_page", args:{tabId}})

// 3. Interactive elements
const interactives = await mcp({tool:"browser_mcp_browser_query", args:{
  tabId,
  selector: `input, textarea, [contenteditable], [role=textbox],
    button, [role=button], a[href], select, [tabindex], [draggable]`
}})

// 4. Readable content
const markdown = await mcp({tool:"browser_mcp_browser_get_markdown", args:{tabId}})
```

### Deep Scan (When light scan is insufficient)

```javascript
const fullText = await mcp({tool:"browser_mcp_browser_get_text", args:{tabId}})
const html = await mcp({tool:"browser_mcp_browser_get_html", args:{tabId}}) // last resort
```

> 80% of scenarios, light scan is enough. `get_html` returns hundreds of KB to MB.

## Drill Into Subpages

```
Current Page: Homepage
  -> Click entry (video card, search link, menu item)
Subpage: Video Page
  -> Scan interactive elements (include Shadow DOM)
  -> Test input interaction modes
  -> Save to pages/<subpage>.json
  -> Save navigation path
  -> Search network requests, discover APIs
  -> Go back
```

```javascript
async function exploreSubPage(tabId, parentPageKey, entrySelector, subPageKey) {
  saveNavigation(`${parentPageKey}->${subPageKey}`, {
    from: parentPageKey, to: subPageKey,
    steps: [{action: "click", page: parentPageKey, selector: entrySelector}]
  })

  await mcp({tool:"browser_mcp_browser_click", args:{tabId, selector: entrySelector}})
  await mcp({tool:"browser_mcp_browser_wait", args:{tabId, ms: 1500}})

  await pierceScan(tabId, subPageKey)
  await testInputCapabilities(tabId, subPageKey)

  // Discover APIs from this interaction
  const apis = await mcp({tool:"browser_mcp_browser_network_search", args:{
    tabId, mimeType: "application/json", limit: 30
  }})
  if (apis.results?.length) saveApis(tabId, subPageKey, apis.results)
}
```

## Tool Selection Priority

| Priority | Tool | Data Size | When |
|----------|------|-----------|------|
| 1 | `current_page` | Tiny | Confirm location |
| 2 | `inspect_page` | Small | Page structure |
| 3 | `query` | Small | Find elements |
| 4 | `get_markdown` | Medium | Read content (preferred) |
| 5 | `get_text` | Medium-Large | Plain text fallback |
| 6 | `get_html` | Huge | Last resort |

## Save Page Elements

Record interaction model, not just selectors:

```json
{
  "likeButton": {
    "locator": { "type": "css", "selector": ".video-like" },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  }
}
```
