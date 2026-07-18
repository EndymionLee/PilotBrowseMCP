# 网站操作手册管理

本目录存储各个网站的交互操作手册，采用 **模块化结构** 便于增量更新和改错。

## 目录结构

```
website-manuals/
├── <site>/                    # 站点文件夹（如 bilibili/ youtube/）
│   ├── meta.json              # 站点基本信息 + siteMap
│   ├── pages/                 # 每个页面一个 JSON 文件
│   │   ├── homepage.json
│   │   ├── video-page.json
│   │   └── ...
│   ├── navigation/            # 每个导航路径一个 JSON 文件
│   │   ├── homepage-to-video.json
│   │   └── ...
│   └── workflows/             # 每个工作流一个 JSON 文件
│       ├── like-video.json
│       └── ...
├── build.js                   # 合并脚本
└── README.md                  # 本文件
```

## 日常操作

### 构建完整手册

```bash
node build.js           # 构建所有站点
node build.js bilibili  # 只构建 bilibili
```

### 增量更新（加一个新选择器）

1. 打开对应的 `pages/xxx.json`
2. 在 `selectors` 下追加一条
3. 可选：加 `"added": "2026-07-16"` 标记新增日期
4. 跑 `node build.js`

### 改错（修复一个选择器）

1. 打开对应的 `pages/xxx.json`
2. 修改该选择器的旧值为新值
3. 可选：加 `"updated": "2026-07-16"` 标记修改日期
4. 跑 `node build.js`

### 废弃旧选择器

保留旧条目，加 `"deprecated": true` 字段，在旁边新增一条正确的。

### 新增导航路径

1. 在 `navigation/` 下新建 `from-to.json`
2. 写路径步骤
3. 跑 `node build.js`

### 新增工作流

1. 在 `workflows/` 下新建 `xxx.json`
2. 写步骤
3. 跑 `node build.js`

## 最佳实践

| 场景 | 改哪个文件 |
|------|-----------|
| 首页按钮选择器失效 | `bilibili/pages/homepage.json` |
| 新增视频页功能 | `bilibili/pages/video-page.json` |
| 新增搜索筛选 | `bilibili/pages/search-results.json` |
| 新增"一键三连"工作流 | `bilibili/workflows/xxx.json` |
| 新增"首页→直播"导航 | `bilibili/navigation/homepage-to-live.json` |

每个文件独立、小量、专注一件事，修改风险极低。
