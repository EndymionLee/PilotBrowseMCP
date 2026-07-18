/**
 * MCP Server 创建
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from '../config.js';
import { logger } from './logger.js';

let server: McpServer | null = null;

export function createServer(): McpServer {
  if (server) return server;

  server = new McpServer(config.serverInfo);
  logger.info('MCP', 'MCP Server 已创建', { version: config.serverInfo.version });
  return server;
}

export async function startServer(srv: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  logger.info('MCP', 'MCP Server 已就绪，等待 Agent 连接');
}

export function getServer(): McpServer {
  if (!server) throw new Error('MCP Server 尚未初始化');
  return server;
}
