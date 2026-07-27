# Manual Schema

## Site Naming Convention

Directory name: `hostname_part1_part2_part3`

Format: take the hostname, remove `www.`, replace all `.` with `_`.

```
https://www.site.com   -> site_com
https://sub.site.co.jp -> sub_site_co_jp
https://site.org       -> site_org
```

Rules:
- Always lowercase
- Remove `www.` prefix
- Replace all `.` with `_`
- No other special characters

## Temporary Data (.learn/)

Intermediate data from exploration lives in `.learn/`:

```
.learn/
  recordings/        # Raw user recordings from popup
  picked-elements/   # User-marked elements from popup
```

Lifecycle:
1. User records/marks from popup -> saved to `.learn/`
2. Agent reviews and processes -> saves to `website-manuals/`
3. Raw files in `.learn/` can be deleted after processing

## Validation

Before saving any file, validate against the schemas below. Use `workflow_validate_manual` to check automatically.

---

## README.md (site root)

**Template** (fill in, do not change structure):

```markdown
# {站点名} Manual
- Pages: see [pages/](pages/)
- Navigation: see [navigation/](navigation/)
- Workflows: see [workflows/](workflows/)
- APIs: see [apis/](apis/)
```

**Validation:**
- Must contain exactly the 4 directory links above
- No inline documentation of site features
- No API details or workflow steps

---

## apis/README.md

**Template:**

```markdown
# APIs
| File | Description | Method | URL | Bound Workflow |
|------|-------------|--------|-----|----------------|
| endpoints/{name}.json | {description} | {GET/POST} | {url} | {workflowName} |
```

**Validation:**
- Each row maps to an existing file in `apis/endpoints/`
- `Method` must be one of: GET, POST, PUT, DELETE, PATCH

---

## workflows/README.md

**Template:**

```markdown
# Workflows
| File | Description | Start Page | Steps |
|------|-------------|------------|-------|
| flows/{name}.json | {description} | {page} | {N} |
```

---

## pages/{page}.json

**Template** (fill fields only, do not add wrapper keys):

```json
{
  "{elementName}": {
    "locator": {
      "type": "css",
      "selector": "{css selector}",
      "altSelectors": ["{fallback selector}"]
    },
    "capabilities": ["click"],
    "interaction": { "action": "click", "method": "dom" }
  }
}
```

**Schema validation:**
| Field | Required | Allowed Values |
|-------|----------|---------------|
| `locator.type` | yes | css, shadow, xpath, iframe |
| `locator.selector` | yes | string |
| `locator.altSelectors` | no | string array |
| `capabilities` | yes | click, type, input, focus, hover, scroll, read |
| `interaction.action` | yes | click, type, input, scroll, wait, hover, pressKey, select, evaluate |
| `interaction.method` | yes | dom, cdp, execCommand |

**Forbidden:** `page`, `url`, `title`, `parameters` at root level.

---

## navigation/{from}-to-{to}.json

**Template:**

```json
{
  "{from}->{to}": {
    "from": "{from}",
    "to": "{to}",
    "steps": [{ "action": "click", "page": "{from}", "target": "{elementName}" }],
    "backMethods": [{ "action": "browser_back" }]
  }
}
```

**Schema validation:**
- `from` and `to` must match page names used in `pages/` files
- `steps[].action` must be one of: click, type, input, scroll, wait
- `steps[].target` must reference an element name in `pages/{from}.json`

---

## workflows/flows/{name}.json

**Template:**

```json
{
  "{workflowName}": {
    "description": "{what this workflow does}",
    "startsOn": "{starting page name}",
    "steps": [
      { "action": "click", "target": "{elementName}" },
      { "action": "type", "target": "{elementName}", "params": { "text": "___input___" } }
    ]
  }
}
```

**Schema validation:**
| Field | Required | Description |
|-------|----------|-------------|
| `description` | yes | Human-readable one-liner |
| `startsOn` | yes | Must match a page name from `pages/` |
| `steps[].action` | yes | One of: click, type, input, scroll, wait, hover, pressKey, select, evaluate |
| `steps[].target` | yes | Must reference an element in the startsOn page |
| `params.text` | for type action | Use `___placeholder___` for variable parts |

**Forbidden:** `locator` as step field (use `target` instead), `duration` (use `params.ms` instead).

---

## workflows/scripts/{name}.json

**Template:**

```json
{
  "name": "{script name}",
  "steps": [
    { "method": "browser_open", "params": { "url": "{url}" } },
    { "method": "browser_wait", "params": { "ms": 2000 } },
    { "method": "browser_click", "params": { "selector": "{css selector}" } }
  ]
}
```

**Schema validation:**
- Each step `method` must be a valid MCP tool name (browser_xxx or browser_network_xxx)
- MCP script is for direct Extension execution, not LLM interpretation

---

## apis/endpoints/{name}.json

**Template:**

```json
{
  "{capabilityName}": {
    "description": "{what this API does}",
    "method": "GET",
    "url": "https://{full API URL}",
    "params": {
      "{paramName}": { "type": "string", "required": true, "source": "user_input" }
    },
    "response": { "type": "json", "fields": ["{field1}", "{field2}"] },
    "boundTo": ["{workflowName}"],
    "discoveredAt": "{YYYY-MM-DD}"
  }
}
```

**Schema validation:**
| Field | Required | Description |
|-------|----------|-------------|
| `description` | yes | One-liner |
| `method` | yes | GET, POST, PUT, DELETE, PATCH |
| `url` | yes | Full URL starting with https:// |
| `params` | no | Object with param definitions |
| `response.fields` | no | Array of field names |
| `boundTo` | **yes** | Array of workflow names this API replaces |
| `discoveredAt` | **yes** | Date in YYYY-MM-DD format |

**Forbidden:** `endpoint`, `auth`, `request`, `response.context`, `name` at root level.
