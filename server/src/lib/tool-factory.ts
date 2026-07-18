/**
 * 工具工厂 - 消除工具定义中的 try/catch/response 样板代码
 *
 * 用法:
 *   defineTool(server, 'browser.list_tabs', { description, inputSchema },
 *     async (args, conn) => {
 *       const result = await conn.sendRequest('list_tabs', args);
 *       return result.tabs;
 *     });
 *
 * 自动处理:
 *   - 错误捕获和格式化
 *   - 响应包装 { content: [{ type: 'text', text }] }
 *   - 日志记录（含耗时）
 *   - 参数摘要（过滤敏感信息）
 */
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { logger } from './logger.js';

type ToolHandler = (args: any, conn: ExtensionConnection) => Promise<unknown>;

export function defineTool(
  server: McpServer,
  conn: ExtensionConnection,
  name: string,
  config: { description: string; inputSchema: any },
  handler: (args: any) => Promise<unknown>,
): void {
  const srv = server as any;

  srv.registerTool(name, {
    description: config.description,
    inputSchema: config.inputSchema,
  }, async (args: unknown) => {
    const start = Date.now();
    logger.info('Tool', `调用 ${name}`, { args: summarizeArgs(args) });

    try {
      const result = await handler(args);
      const duration = Date.now() - start;
      logger.info('Tool', `完成 ${name}`, { duration: `${duration}ms` });

      if (result && typeof result === 'object' && 'content' in result) {
        return result;
      }
      return {
        content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Tool', `失败 ${name}`, { duration: `${duration}ms`, error: message });
      return { content: [{ type: 'text' as const, text: message }], isError: true };
    }
  });
}

/** 参数摘要：截断长文本，掩盖敏感字段 */
function summarizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 80) {
      summary[key] = value.slice(0, 80) + '...';
    } else if (typeof value === 'string' && ['cookie', 'token', 'auth', 'secret', 'password'].some((k) => key.toLowerCase().includes(k))) {
      summary[key] = '***';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
