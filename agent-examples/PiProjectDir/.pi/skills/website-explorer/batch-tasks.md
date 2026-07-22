# 6. Batch Tasks

For batch, concurrent, or multi-page scraping, do NOT call MCP tools one by one. Generate Python scripts based on discovered APIs.

```python
import requests, json, time

# From apis/ definitions
API = "https://examplesite.com/api/chapter"
HEADERS = {"Cookie": "session=xxx"}

ids = list(range(1, 101))
for i, cid in enumerate(ids):
    resp = requests.get(API, params={"id": cid}, headers=HEADERS)
    with open(f"chapters/{cid}.json", "w") as f:
        json.dump(resp.json(), f, ensure_ascii=False)
    print(f"[{i+1}/100] chapter {cid} done")
    time.sleep(0.5)
```

Script writes directly to disk. LLM only sees the summary.

## Rules

- Batch tasks always use scripts, never call MCP tools one by one
- API endpoints, params, cookies come from the manual
- Script returns only a summary to the LLM (N succeeded, M failed)
