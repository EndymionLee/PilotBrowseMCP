# 6. 批量任务

涉及批量、并发、多页爬取的场景，不要用 MCP 工具逐条操作。根据发现的 API 生成 Python 脚本直接跑。

```python
import requests, json, time

# 从 apis/ 定义中获取
API = "https://examplesite.com/api/chapter"
HEADERS = {"Cookie": "session=xxx"}

ids = list(range(1, 101))
for i, cid in enumerate(ids):
    resp = requests.get(API, params={"id": cid}, headers=HEADERS)
    with open(f"chapters/{cid}.json", "w") as f:
        json.dump(resp.json(), f, ensure_ascii=False)
    print(f"[{i+1}/100] 第{cid}章 完成")
    time.sleep(0.5)
```

脚本直接写磁盘，LLM 只看摘要。

## 规则

- 批量任务一律用脚本，不在 LLM 循环里逐条调 MCP 工具
- API 地址、参数、Cookie 从手册中获取
- 脚本只给 LLM 返回摘要（成功 N 条、失败 M 条）
