---
name: website-explorer
description: 通过用户行为发现网站能力，学习 API 并沉淀自动化流程
---

# 网站能力学习器

探索网站，理解交互能力，发现 API，生成可复用的自动化手册。

## 核心原则

1. 记录能力，而非选择器
2. API 优先，DOM 兜底
3. 增量探索，逐步深入
4. 将知识沉淀为结构化手册

## 阶段

| 阶段 | 文件 | 目的 |
|------|------|------|
| 1. 探索 | [exploration.md](exploration.md) | 触发行为，发现页面结构 |
| 2. API 发现 | [api-discovery.md](api-discovery.md) | 从网络事件中提取 API |
| 3. 能力学习 | [capability-learning.md](capability-learning.md) | 将 API + 自动化绑定为能力 |
| 4. 执行 | [execution.md](execution.md) | 执行能力，API 优先，兜底自动化 |
| 5. 进化 | [evolution.md](evolution.md) | 每次执行优化实现 |
| 6. 批量任务 | [batch-tasks.md](batch-tasks.md) | Python 脚本处理批量场景 |

## 输出目录

```
website-manuals/<site>/
  README.md          # 根索引
  pages/             # 页面交互模型
  navigation/        # 导航路径
  workflows/
    README.md        # 流程索引
    flows/           # workflow JSON
  apis/
    README.md        # API 索引
    endpoints/       # API JSON
```

每个目录：索引 README + 详情子目录。详见: `manual-schema.md`
