# Pilot Browse MCP

[English](README.md)

**通过用户行为发现网站 API 和能力，沉淀为可复用的能力模型。**

---

## 展示 (Pi演示)

### 能力学习

安装 skill，agent 在操作网站的过程中自动发现 API，将 API 和操作流程绑定为可复用的能力。

![标记元素](assets/Image/EpWeb.gif)

学习成果保存在 `website-manuals/` 目录下：

```
website-manuals/<site>/
  README.md              # 根索引
  pages/                 # 页面交互模型
  navigation/            # 导航路径
  workflows/
    README.md            # 流程索引
    flows/               # workflow JSON
  apis/
    README.md            # API 索引（先读）
    endpoints/           # API JSON
```

### 人工辅助

遇到复杂交互时，用户可以录制操作或标记元素，帮助 agent 学习。

#### 标记元素

<img src="assets/Image/MarkElement.gif" alt="标记元素"  />

#### 录制流程

<img src="assets/Image/RecordWorkflow.gif" alt="标记元素"  />

### 能力复用

后续同类任务直接调 API（快速）或走浏览器流程（兜底），省 token 且更稳定。

### 样例

构建各种工作流，简单样例展示。

#### 抓包提取签到api



#### YouTube 视频点赞

搜索关键字，找到视频，然后点赞和评论。

<video src="https://github.com/user-attachments/assets/129c69f7-21a7-4fbe-93ae-6b0205450933" controls width="100%" style="max-width:720px;"></video>

#### 起点小说保存

搜索小说名，找到小说，爬取前5章节。

<video src="https://github.com/user-attachments/assets/b244db3b-fb98-433c-b6ed-d8a74c75e802" controls width="100%" style="max-width:720px;"></video>

---

## 安装

```bash
# 构建
cd server && npm install && npm run build
cd extension && npm install && npm run build

# 加载扩展
# chrome://extensions/ -> 开发者模式 -> 加载已解压的扩展程序 -> extension/dist/

# 启动服务
cd server && node dist/index.js
```

### MCP 配置

实例：

args 填写具体路径的 server/dist/index.js

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "node",
      "args": ["/path/to/server/dist/index.js"]
    }
  }
}
```

### 探索SKILL

scripts\Skill

### 快速构建工作项目

参考agent-examples，里面有各种agent工作项目例子，在工作路径运行agent，即可自动配置MCP，加载SKILL和项目提示词（mcp配置文件参数要改为正确路径）

---

## 架构

```
AI Agent (Claude Code / Pi / Codex)
    |
    | 1) MCP stdio protocol (JSON-RPC)
    | stdin / stdout
    v
MCP Server (Node.js)          protocol translator
    |
    | 2) WebSocket :9456
    v
Chrome Extension
    |
    | 3) Chrome API
    |
    v
Browser
```

## 特性

- **45 个 MCP 工具** -- 标签页管理、内容提取、DOM 操作、网络拦截、文件保存、录制
- **元素拾取** -- 点页面上任意元素，告诉 Agent 这是什么
- **录制工作流** -- 演示一遍，Agent 学会并复用
- **网络 API 工具集** -- 监听、搜索、详情、重放(含 overrides + extract)、导出代码、站点 API 结构分析
- **省 token 保存** -- 页面内容直接写磁盘，不经过 LLM
- **Shadow DOM + contenteditable**

## 工具

| 分类             | 工具                                          | 功能                                      |
| ---------------- | --------------------------------------------- | ----------------------------------------- |
| **页面**   | `browser_get_markdown`                      | Readability + Turndown 转 Markdown        |
|                  | `browser_get_text`                          | 获取页面纯文本（比 get_html 轻）          |
|                  | `browser_get_html`                          | 获取页面原始 HTML（重，最后兜底）         |
|                  | `browser_find`                              | 按文字/aria-label/role 查找元素           |
|                  | `browser_current_page`                      | 获取当前标签页信息                        |
|                  | `browser_inspect_page`                      | 查看页面结构骨架                          |
|                  | `browser_query`                             | CSS 选择器查询（穿透 Shadow DOM）         |
|                  | `browser_evaluate`                          | 执行 JS，处理复杂交互                     |
|                  | `browser_extract_article`                   | 提取文章元数据（标题/作者/日期/正文）      |
|                  | `browser_extract_table`                     | 提取表格为 JSON                           |
|                  | `browser_extract_links`                     | 提取页面所有链接                          |
|                  | `browser_extract_images`                    | 提取图片信息（src/alt/尺寸）              |
| **操作**   | `browser_click`                             | 点击元素（composed:true 穿透 Shadow DOM） |
|                  | `browser_type`                              | 输入文本（支持 contenteditable）          |
|                  | `browser_scroll`                            | 滚动页面                                  |
|                  | `browser_wait`                              | 等待指定毫秒数                            |
|                  | `browser_wait_for_element`                  | 等待元素出现                              |
| **保存**   | `browser_save_content`                      | 自动检测正文并保存（零 token）            |
|                  | `browser_save_xpath`                        | 按 XPath 提取并保存                       |
| **网络**   | `browser_start_network_monitor`             | 开始拦截请求                              |
|                  | `browser_stop_network_monitor`              | 停止拦截（缓存保留，可继续查看/重放）     |
|                  | `browser_network_clear_cache`               | 清除缓存的请求（不停监听）                 |
|                  | `browser_network_search`                    | 搜索缓存的请求                            |
|                  | `browser_network_detail`                    | 获取请求完整详情（header/body/耗时）      |
|                  | `browser_network_wait`                      | 等待匹配的请求出现（替代固定延时）        |
|                  | `browser_network_replay`                    | 重放请求（支持 overrides + extract）      |
|                  | `browser_network_export`                    | 导出为 curl / fetch / Python / HAR        |
|                  | `browser_network_analyze`                   | 分析站点 API 结构                         |
|                  | `browser_network_override`                  | 设置响应覆盖规则（body/status/header）    |
| **标签页** | `browser_list_tabs`                         | 列出所有标签页                            |
|                  | `browser_open / close / activate`           | 标签页管理                                |
| **录制**   | `workflow_list_recordings`                  | 查看录制                                  |
|                  | `workflow_get_recording`                    | 获取录制详情                              |
|                  | `workflow_list_elements`                    | 查看标记的元素                            |
|                  | `workflow_get_element`                      | 获取标记元素详情                          |
|                  | `workflow_list`                             | 列出已生成的 workflow                     |
|                  | `workflow_add_element`                      | 保存用户标记的元素到 pages/               |
|                  | `workflow_generate`                         | 生成 workflow                             |
| **数据**   | `browser_cookies`                           | 读取 Cookie（需授权）                     |
|                  | `browser_local_storage`                     | 读取 LocalStorage（需授权）               |
|                  | `browser_screenshot`                        | 截图（需授权）                            |
|                  | `browser_permissions_list / grant / revoke` | 权限管理                                  |

---

## License

MIT
