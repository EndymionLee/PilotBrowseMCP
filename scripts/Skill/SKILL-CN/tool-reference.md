# 工具参考

## 网络管线

| 工具 | 阶段 | 作用 |
|------|------|------|
| `start_network_monitor` | 1 | 开始抓包 |
| `stop_network_monitor` | -- | 停止（缓存保留） |
| `browser_network_clear_cache` | -- | 清缓存不停监听 |
| `browser_network_search` | 2 | 按条件搜索 API |
| `browser_network_detail` | 2 | 查看请求/响应详情 |
| `browser_network_wait` | 4 | 等待 API 请求完成 |
| `browser_network_replay` | 4 | 执行 API（服务端或浏览器上下文） |
| `browser_network_export` | -- | 导出为 curl/fetch/Python |
| `browser_network_analyze` | 2 | 分析 API 结构 |
| `browser_network_override` | -- | 响应拦截用于测试 |

## 页面工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `current_page` | 1 | 当前位置 |
| `inspect_page` | 1 | 页面结构 |
| `query` | 1 | 查找交互元素 |
| `click`, `type`, `scroll` | 1 | 触发操作 |
| `evaluate` | 4 | 执行 JS |
| `wait_for_element` | 4 | 等待动态内容 |
| `find` | 1 | 按文字/角色/标签定位 |

## 内容工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `get_markdown` | 1 | 阅读内容（首选） |
| `get_text` | 1 | 纯文本兜底 |
| `get_html` | 1 | 最后兜底（重） |
| `save_content` | -- | 保存到磁盘（零 token） |
| `save_xpath` | -- | 按 XPath 保存 |
| `extract_article` | 1 | 文章元数据 |
| `extract_table` | 1 | 表格转 JSON |
| `extract_links` | 1 | 所有链接 |
| `extract_images` | 1 | 图片信息 |

## 工作流工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `workflow_list_recordings` | 1 | 查看用户录制 |
| `workflow_get_recording` | 1 | 获取录制详情 |
| `workflow_generate` | 3 | 保存 workflow |
| `workflow_add_element` | 1 | 保存标记元素 |
| `workflow_list` | -- | 列出已保存 workflow |

## 权限与数据工具

| 工具 | 阶段 | 作用 |
|------|------|------|
| `cookies` | 4 | 读取登录 Cookie |
| `local_storage` | 4 | 读取存储数据 |
| `screenshot` | -- | 视觉截取 |
| `permissions_list / grant / revoke` | -- | 权限管理 |
