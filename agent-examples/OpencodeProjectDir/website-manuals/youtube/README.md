# YouTube 操作手册

## 站点信息
- **URL**: https://www.youtube.com/
- **探索日期**: 2026-07-15
- **说明**: 全球最大视频分享平台，包含视频播放、Shorts、评论、订阅频道等

## 页面清单 (pages/)

| 文件 | 页面 | 主要交互元素 |
|------|------|-------------|
| `homepage.json` | 首页 (`/`) | 搜索框、侧边栏(首页/Shorts/订阅/我)、视频推荐流、Shorts卡片、创建按钮、通知 |
| `video-page.json` | 视频播放页 (`/watch?v=...`) | 视频标题、频道信息、订阅按钮、点赞/点踩、分享、保存、评论区 |
| `search-results.json` | 搜索结果页 (`/results?search_query=`) | 搜索框、筛选芯片(全部/Shorts/视频/直播)、过滤按钮、视频结果列表 |

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
| `post-comment.json` | 发表评论 | 视频播放页 |
| `share-video.json` | 分享视频（复制链接） | 视频播放页 |
| `subscribe-and-like.json` | 订阅频道+点赞视频 | 视频播放页 |
| `like-and-comment.json` | 点赞+评论（组合流程） | 视频播放页 |

## 注意事项

- 评论区使用 contentEditable div（`#contenteditable-root`），需先点击 `#placeholder-area` 激活后输入
- 点赞按钮的定位依赖 `aria-label` 属性，含"与另外"或"顶此视频"文字
- 首页视频卡片通过 `a.ytLockupMetadataViewModelTitle[href^='/watch']` 点击进入视频页
- 搜索可从首页直接提交，也可直接打开 `https://www.youtube.com/results?search_query=关键词`
- 侧边栏可展开/收起（通过 `button[aria-label='导视']` 切换）
