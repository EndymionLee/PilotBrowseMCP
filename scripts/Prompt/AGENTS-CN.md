# 项目提示

## 操作手册优先

**凡是操作或探索浏览器中的已有站点，先检查 `website-manuals/` 目录下是否有该站点的手册。**

- **有手册** --> **先读 `README.md`** 了解全貌，再根据需要看具体文件
- **无手册** --> 再走完整探索流程

避免每次重新扫页面，浪费时间和 token。

## 手册目录结构

```
website-manuals/<site>/
├── README.md         # 手册概览（必读）
├── meta.json         # 站点信息 + 页面地图 + API 映射
├── pages/            # 页面交互元素选择器
├── navigation/       # 页面间导航路径
├── workflows/        # 操作流程
├── apis/             # API 定义（匹配到 workflow）
└── capabilities.json # 浏览器能力模型
```

### 用法

1. **读 README.md** -- 看手册有哪些页面、导航、流程
2. **查元素** -- 去 `pages/<page>.json` 找 selectors
3. **走导航** -- 去 `navigation/` 看页面跳转步骤
4. **执行流程** -- 去 `workflows/` 按 steps 顺序执行
5. **调 API** -- 如果手册中有 `apis/`，优先用 `browser_network_replay` 调 API 而非操作 DOM

## API 优先策略

SPA 页面的数据通过 API 加载，HTML 里只有空壳。优先使用网络工具发现和调用 API：

```
start_network_monitor → 操作页面 → browser_network_search
                                    ├→ browser_network_detail → 查看详情
                                    ├→ browser_network_replay → 重放（支持 overrides + extract）
                                    └→ browser_network_wait → 等某个请求完成再继续
```

详情见 `scripts/Skill/SKILL-CN.md` 中"网络请求监听"章节。

## 用户录制与标记

用户说"发你了"、"看看"等类似句子时，调用以下工具查看用户从弹窗发送的数据：

- `workflow_list_elements` -- 查看用户标记的元素
- `workflow_list_recordings` -- 查看用户录制的操作流程

## 批量任务

涉及批量、并发、多页爬取的场景（如爬 100 章小说），不要用 MCP 工具逐条操作。
根据手册中的 API 定义生成 Python 脚本直接跑，只返回摘要给 LLM。
