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
├── meta.json         # Site basic info
├── pages/            # Page interaction selectors
├── navigation/       # Navigation paths
└── workflows/        # Operation workflows
```

### Usage

1. **Read README.md** -- understand pages, navigation, and workflows available
2. **Find elements** -- check `pages/<page>.json` for selectors
3. **Navigate** -- check `navigation/` for step-by-step navigation
4. **Execute workflows** -- follow `steps` in `workflows/<name>.json`

## User Recordings

When the user says "sent you", "check it", or similar, call these tools to view data sent from the popup:

- `workflow.list_elements` -- view elements marked by the user
- `workflow.list_recordings` -- view operation workflows recorded by the user
