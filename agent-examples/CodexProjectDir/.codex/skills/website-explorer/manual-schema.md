# Manual Schema

## README.md (site root)

Entry point - lightweight index, just links to subdirectories.

```markdown
# <Site> Manual
- Pages: see [pages/](pages/)
- Navigation: see [navigation/](navigation/)
- Workflows: see [workflows/](workflows/)
- APIs: see [apis/](apis/)
```

## workflows/README.md (workflow index)

Lists all workflows with name + description.

```markdown
# Workflows
| File | Description | Start Page | Steps |
|------|-------------|------------|-------|
| flows/search.json | Search products | Home | 3 |
```

Workflow files: `workflows/flows/<name>.json`

## apis/README.md (API index)

Lists all APIs with name + description only. Agent reads this first then loads specific `endpoints/<name>.json`.

```markdown
# APIs
| File | Description | Method | URL | Bound Workflow |
|------|-------------|--------|-----|----------------|
| endpoints/search.json | Search products | GET | /api/search | searchProducts |
```

---

## pages/<page>.json

Interactive elements on a page. Created by `workflow_add_element` or manually.

```json
{
  "likeButton": {
    "locator": {
      "type": "css",
      "selector": ".video-like",
      "altSelectors": ["button[title*='like']"]
    },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `locator.type` | yes | css, shadow, xpath, iframe |
| `locator.selector` | yes | CSS or XPath |
| `locator.altSelectors` | no | Fallback selectors |
| `capabilities` | yes | click, type, focus, hover... |
| `interaction.action` | yes | click, input, scroll... |
| `interaction.method` | yes | dom, cdp, execCommand |

---

## navigation/<from>-to-<to>.json

Navigation path between pages.

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

---

## workflows/flows/<name>.json

Automation workflow. Created by `workflow_generate`.

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

**Actions**: click, type, input, scroll, wait, hover, pressKey, select, evaluate

---

## apis/endpoints/<name>.json

API definition. Primary implementation of a capability. Must link to workflow via `boundTo`.

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
    "response": { "type": "json", "fields": ["id", "name", "price"] },
    "boundTo": ["searchProducts"],
    "discoveredAt": "2026-07-22"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `method` | yes | GET, POST, PUT, DELETE |
| `url` | yes | API endpoint |
| `params` | no | Parameters with type, required, source |
| `response.fields` | no | Key fields in response |
| `boundTo` | yes | Links to workflow name |
| `preconditions` | no | e.g. authenticated |
