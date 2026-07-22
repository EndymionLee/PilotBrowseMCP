# Project Instructions

## Browser First

"this site" → check `browser_mcp_browser_list_tabs`, not project files. No tabs → ask.

## Manual First

**Before operating a known website, check `website-manuals/<site>/` for an existing manual.**

- **Has manual** --> Read root `README.md` first, then load specific files as needed
- **No manual** --> Run the exploration process, then save to `website-manuals/`

## Directory Structure

```
website-manuals/<site>/
  README.md              # Root index
  pages/                 # Page elements (flat)
  navigation/            # Navigation paths (flat)
  workflows/
    README.md            # Workflow index
    flows/               # Workflow JSON files
  apis/
    README.md            # API index (browse first)
    endpoints/           # API JSON files
```

### How to Use

1. **Read root README.md** -- understand what's available
2. **Find elements** -- load specific `pages/<page>.json`
3. **Navigate** -- load `navigation/<from>-to-<to>.json`
4. **Use APIs** -- read `apis/README.md` for available APIs, then load `apis/endpoints/<name>.json`

## Execution Priority

1. **API first** -- use `browser_network_replay` when API is available
2. **Browser fallback** -- execute workflow steps (click/type) when API fails
3. **Re-discover** -- if both fail, re-explore and update the manual

API and workflow are implementations of the same capability. When API works, it's faster and cheaper. When it doesn't, fall back to the browser workflow.

## User Recordings

When the user says "sent you", "check it", or similar:

- `workflow_list_elements` -- view marked elements
- `workflow_list_recordings` -- view recorded workflows
