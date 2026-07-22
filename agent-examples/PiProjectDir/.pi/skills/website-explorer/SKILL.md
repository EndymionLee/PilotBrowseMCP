---
name: website-explorer
description: Discover website capabilities from user behaviors. Learn APIs and automate workflows.
---

# Website Capability Learner

Explore websites, understand interaction capabilities, discover APIs, and generate reusable automation manuals.

## Core Rules

1. Record capabilities, not selectors
2. API first, DOM second
3. Explore incrementally
4. Save knowledge into structured manual

## Phases

| Phase | File | Purpose |
|-------|------|---------|
| 1. Exploration | [exploration.md](exploration.md) | Trigger behaviors, discover page structure |
| 2. API Discovery | [api-discovery.md](api-discovery.md) | Extract clean API definitions from network events |
| 3. Capability Learning | [capability-learning.md](capability-learning.md) | Bind API + automation into capability model |
| 4. Execution | [execution.md](execution.md) | Execute capabilities, API first, workflow fallback |
| 5. Evolution | [evolution.md](evolution.md) | Improve implementations over time |
| 6. Batch Tasks | [batch-tasks.md](batch-tasks.md) | Python scripts for bulk work |

## Output

```
website-manuals/<site>/
  README.md          # Root index
  pages/             # Page interaction models
  navigation/        # Navigation paths
  workflows/
    README.md        # Workflow index
    flows/           # Workflow JSON files
  apis/
    README.md        # API index
    endpoints/       # API JSON files
```

Every directory: index README + detail subdirectory. See: `manual-schema.md`
