# Tool Reference

## Network Pipeline

| Tool | Phase | Purpose |
|------|-------|---------|
| `start_network_monitor` | 1 | Begin capturing requests |
| `stop_network_monitor` | -- | Stop (cache preserved) |
| `browser_network_clear_cache` | -- | Clear without stopping |
| `browser_network_search` | 2 | Find APIs by pattern |
| `browser_network_detail` | 2 | Inspect request/response |
| `browser_network_wait` | 4 | Wait for API after action |
| `browser_network_replay` | 4 | Execute API (server or browser context) |
| `browser_network_export` | -- | Export as curl/fetch/Python |
| `browser_network_analyze` | 2 | Analyze API structure |
| `browser_network_override` | -- | Response interception for testing |

## Page Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `current_page` | 1 | Know current location |
| `inspect_page` | 1 | Understand page structure |
| `query` | 1 | Find interactive elements |
| `click`, `type`, `scroll` | 1 | Trigger behaviors |
| `evaluate` | 4 | Execute JS in page context |
| `wait_for_element` | 4 | Wait for dynamic content |
| `find` | 1 | Locate by text/role/label |

## Content Tools

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

## Workflow Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `workflow_list_recordings` | 1 | View user recordings |
| `workflow_get_recording` | 1 | Get recording details |
| `workflow_generate` | 3 | Save workflow |
| `workflow_add_element` | 1 | Save marked elements |
| `workflow_list` | -- | List saved workflows |

## Permission & Data Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `cookies` | 4 | Read auth cookies |
| `local_storage` | 4 | Read stored data |
| `screenshot` | -- | Visual capture |
| `permissions_list / grant / revoke` | -- | Permission management |
