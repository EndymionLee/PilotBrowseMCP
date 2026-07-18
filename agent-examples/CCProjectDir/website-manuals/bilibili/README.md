# Bilibili (哔哩哔哩) 操作手册

## 站点信息
- **URL**: https://www.bilibili.com/
- **探索日期**: 2026-07-15
- **说明**: 中国最大弹幕视频网站，包含视频播放、弹幕互动、直播、番剧等

## 页面清单 (pages/)

| 文件 | 页面 | 主要交互元素 |
|------|------|-------------|
| `homepage.json` | 首页 (`/`) | 搜索框、导航栏(番剧/直播/游戏中心)、频道分类、视频推荐流、轮播图 |
| `video-page.json` | 视频播放页 (`/video/BV...`) | 播放器(播放/暂停/清晰度/倍速)、点赞/投币/收藏、弹幕输入、评论区、UP主信息 |
| `search-results.json` | 搜索结果页 (`search.bilibili.com/all?keyword=`) | 分类选项卡(综合/视频/番剧/影视)、排序(最多播放/最新)、时间/时长筛选、分页 |

## 导航路径 (navigation/)

| 文件 | 路径 |
|------|------|
| `homepage-to-video.json` | 首页 → 视频播放页 |
| `homepage-to-search.json` | 首页 → 搜索结果页 |
| `search-to-video.json` | 搜索结果页 → 视频播放页 |

## 操作流程 (workflows/)

| 文件 | 功能 | 起点页面 |
|------|------|---------|
| `search-and-watch.json` | 搜索视频并观看 | 首页 |
| `like-video.json` | 点赞视频 | 视频播放页 |
| `coin-video.json` | 投币 | 视频播放页 |
| `favorite-video.json` | 收藏视频 | 视频播放页 |
| `like-and-coin.json` | 点赞+投币（一键三连前两步） | 视频播放页 |
| `post-comment.json` | 发表评论（新版 brt 编辑器） | 视频播放页 |
| `send-danmaku.json` | 发送弹幕 | 视频播放页 |
| `change-quality.json` | 切换视频清晰度 | 视频播放页 |

## 注意事项

- 评论区有新/旧两版：新版使用 `brt` contentEditable 编辑器（`#input .brt-editor`），旧版使用 `bili-comments` Shadow DOM（需 JS 穿透）
- 发布评论按钮需要输入文字后获得 `active` class 才可点击
- 弹幕输入框直接 `type` + `pressEnter` 即可发送
- 首页视频卡片通过 `a.bili-video-card__image--link[href^='https://www.bilibili.com/video/']` 点击进入视频页
- 搜索框在首页使用 `input.nav-search-input`，在搜索结果页使用 `input.search-input-el`
