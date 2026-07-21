# Project Instructions

## Manual First

**Before operating or exploring any website, check `website-manuals/` for an existing manual.**

- **Has manual** --> **Read `README.md`** first, then check specific files as needed
- **No manual** --> Run the full exploration process

Avoid re-scanning pages every time, saving tokens and time.

## Manual Directory Structure

```
website-manuals/<site>/
├── README.md         # Manual overview (must read)
├── meta.json         # Site info + page map + API map
├── pages/            # Page interaction selectors
├── navigation/       # Navigation paths
├── workflows/        # Operation workflows
├── apis/             # API definitions (mapped to workflows)
└── capabilities.json # Browser capability model
```

### Usage

1. **Read README.md** -- understand pages, navigation, and workflows available
2. **Find elements** -- check `pages/<page>.json` for selectors
3. **Navigate** -- check `navigation/` for step-by-step navigation
4. **Execute workflows** -- follow `steps` in `workflows/<name>.json`
5. **Use APIs** -- if `apis/` exists, prefer `browser_network_replay` to call APIs instead of DOM operations

## API-First Strategy

SPA pages load data via APIs, the HTML is just a shell. Use network tools to discover and call APIs:

```
start_network_monitor → interact → browser_network_search
                                    ├→ browser_network_detail → inspect
                                    ├→ browser_network_replay → replay (overrides + extract)
                                    └→ browser_network_wait → wait for specific request
```

See `scripts/Skill/SKILL-EN.md` "Network Monitoring" section for details.

## User Recordings & Marked Elements

When the user says "sent you", "check it", or similar, call these tools to view data from the popup:

- `workflow_list_elements` -- view elements marked by the user
- `workflow_list_recordings` -- view operation workflows recorded by the user

## Batch Tasks

For batch, concurrent, or multi-page scraping (e.g. crawling 100 novel chapters), do NOT call MCP tools one by one.
Generate a Python script based on the manual API definitions, run it directly, and return only a summary to the LLM.
