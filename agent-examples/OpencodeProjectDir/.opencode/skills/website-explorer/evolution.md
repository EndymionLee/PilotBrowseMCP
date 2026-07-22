# 5. Capability Evolution Phase

Goal: Each execution improves the capability.

## Evolution Loop

```
First visit:          browser workflow only (learn how to do it)
After API discovery:  API added as primary, workflow kept as fallback
After refinement:     Parameters documented, error handling added
After site changes:   API breaks -> fallback to workflow -> re-discover
```

## When to Trigger Evolution

| Signal | Action |
|--------|--------|
| New API found during execution | Add to capability as primary |
| API returns 401/403 | Log auth as precondition |
| Browser workflow fails | Mark as stale, re-explore |
| Multiple similar APIs | Merge into parameterized capability |
| GraphQL endpoint found | Replace multiple REST calls with one query |

Each execution makes the capability more robust and token-efficient.
