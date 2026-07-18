/**
 * 集中配置
 */
export const config = {
  /** WebSocket 端口 */
  wsPort: parseInt(process.env.BROWSER_MCP_WS_PORT ?? '', 10) || 9456,

  /** WebSocket 连接超时 (ms) */
  wsConnectionTimeout: parseInt(process.env.BROWSER_MCP_WS_TIMEOUT ?? '', 10) || 60000,

  /** 请求超时 (ms) */
  requestTimeout: parseInt(process.env.BROWSER_MCP_REQ_TIMEOUT ?? '', 10) || 30000,

  /** 调试模式 */
  debug: process.env.BROWSER_MCP_DEBUG === 'true',

  /** MCP Server 信息 */
  serverInfo: {
    name: 'pilot-browse-mcp-server',
    version: '0.2.0',
  },
} as const;
