# Pilot Browse MCP

[中文](README.zh-CN.md)

**Show your agent how to use websites, or let it explore autonomously. Pilot Browse MCP turns website interactions into reusable manuals, making future tasks faster and cheaper.**

---

## Showcase (Pi Demo)

### Agent Autonomy

Install a skill, let the agent explore a website. When done, it generates an operation manual. You can share manuals with others.

![Agent Explore](assets/Image/EpWeb.gif)

After exploration, the manual is saved in `website-manuals/`:

```
website-manuals/<site>/
├── README.md              # Manual overview (read this first!)
├── meta.json              # Site info + page map
├── pages/                 # Page interaction models (JSON)
├── navigation/            # Navigation paths
├── workflows/             # Operation workflows (with fallback)
└── capabilities.json      # Browser capability model
```

### Guided Teaching

Stuck on exploration? Record or mark elements manually to help the agent through.

#### Mark Element

<img src="assets/Image/MarkElement.gif" alt="Mark Element" />

#### Record Workflow

<img src="assets/Image/RecordWorkflow.gif" alt="Record Workflow" />

### Manual Reuse

Given a task, the agent checks for existing manuals. If found, it operates based on the manual -- fewer tokens, faster execution.

### Demos

Build various workflows, simple demo showcase.

#### YouTube Like & Comment

Search a keyword, find a video, like and comment.

<video src="https://github.com/user-attachments/assets/129c69f7-21a7-4fbe-93ae-6b0205450933" controls width="100%" style="max-width:720px;"></video>

#### Qidian Novel Saver

Search a novel, save the first 5 chapters.

<video src="https://github.com/user-attachments/assets/b244db3b-fb98-433c-b6ed-d8a74c75e802" controls width="100%" style="max-width:720px;"></video>

---

## Install

```bash
# Build
cd server && npm install && npm run build
cd extension && npm install && npm run build

# Load extension
# chrome://extensions/ -> Developer mode -> Load unpacked -> extension/dist/

# Start server
cd server && node dist/index.js
```

### MCP Configuration

Example - fill `args` with the actual path to `server/dist/index.js`:

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "node",
      "args": ["/path/to/server/dist/index.js"]
    }
  }
}
```

### Skills

Check `scripts/Skill` for available skills.

### Quick Start with Examples

Refer to `agent-examples/` for ready-to-use agent workspace examples. Run your agent in one of those directories and it will automatically load the MCP config, skills, and project prompts. (Remember to update the MCP path to your actual setup.)

---

## Architecture

```
AI Agent (Claude Code / Pi / Codex)
    |
    | 1) MCP stdio protocol (JSON-RPC)
    | stdin / stdout
    v
MCP Server (Node.js)          protocol translator
    |
    | 2) WebSocket :9456
    v
Chrome Extension
    |
    | 3) Chrome API
    |
    v
Browser
```

## Features

- **40+ MCP tools** -- tab management, content extraction, DOM operations, network interception, file saving, workflow recording
- **Element picker** -- click any element on the page and tell the agent what it is
- **Workflow recording** -- demonstrate operations to the agent, it learns and reuses
- **Network API discovery** -- intercept XHR/Fetch to find JSON APIs behind SPAs
- **Token-efficient saving** -- save page content directly to disk, bypassing the LLM
- **Shadow DOM + contenteditable**

## Tools

| Category | Tool | What it does |
|----------|------|--------------|
| **Page** | `browser.get_markdown` | Convert page to clean Markdown via Readability + Turndown |
| | `browser.find` | Find element by visible text, aria-label, or role |
| | `browser.current_page` | Get current tab URL and title |
| | `browser.inspect_page` | See page structure (headings, sections, buttons) |
| | `browser.query` | Query elements by CSS selector (penetrates Shadow DOM) |
| | `browser.evaluate` | Execute JS in page context |
| **Actions** | `browser.click` | Click an element (composed:true for Shadow DOM) |
| | `browser.type` | Type text into input or contenteditable |
| | `browser.scroll` | Scroll the page |
| | `browser.wait_for_element` | Wait for an element to appear |
| **Saving** | `browser.save_content` | Auto-detect main content and save to file (zero LLM tokens) |
| | `browser.save_xpath` | Extract by XPath and save to file |
| **Network** | `browser.start_network_monitor` | Start intercepting requests |
| | `browser.network.search` | Search cached requests by keyword, method, status |
| | `browser.network.replay` | Replay a cached request |
| **Tabs** | `browser.list_tabs` | List all open tabs |
| | `browser.open / close / activate` | Tab management |
| **Recording** | `workflow.list_recordings` | View recordings from popup |
| | `workflow.get_recording` | Get recording details |
| | `workflow.list_elements` | View marked elements |
| | `workflow.generate` | Save a processed workflow to website-manuals |
| **Data** | `browser.cookies` | Read cookies (requires permission) |
| | `browser.screenshot` | Take screenshot (requires permission) |
| | `browser.permissions.list / grant / revoke` | Permission management |

---

## License

MIT
