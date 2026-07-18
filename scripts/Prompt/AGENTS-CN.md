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
├── meta.json         # 站点基本信息
├── pages/            # 页面交互元素选择器
├── navigation/       # 页面间导航路径
└── workflows/        # 操作流程
```

### 用法

1. **读 README.md** -- 看手册有哪些页面、导航、流程
2. **查元素** -- 去 `pages/<page>.json` 找 selectors
3. **走导航** -- 去 `navigation/` 看页面跳转步骤
4. **执行流程** -- 去 `workflows/` 按 steps 顺序执行

## 用户录制的工作流

用户说"发你了"、"看看"等类似句子时，调用以下工具查看用户从弹窗发送的数据：

- `workflow.list_elements` -- 查看用户标记的元素
- `workflow.list_recordings` -- 查看用户录制的操作流程
