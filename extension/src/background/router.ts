/**
 * 消息路由器 - 将请求分发到对应的处理器
 *
 * Handler 注册:
 *   router.register('list_tabs', handler);
 *
 * 支持通配符:
 *   router.register('extract_*', handler); // 匹配所有 extract_ 开头的方法
 */
import type { RequestMessage } from '../shared/protocol.js';

type HandlerFn = (params: unknown, sendResponse: (result?: unknown, error?: { code: number; message: string }) => void) => Promise<void>;

interface HandlerEntry {
  pattern: string;
  fn: HandlerFn;
  isWildcard: boolean;
}

export class Router {
  private handlers: HandlerEntry[] = [];

  register(method: string, fn: HandlerFn): void {
    this.handlers.push({
      pattern: method,
      fn,
      isWildcard: method.includes('*'),
    });
  }

  async dispatch(req: RequestMessage, sendResponse: (result?: unknown, error?: { code: number; message: string }) => void): Promise<void> {
    for (const entry of this.handlers) {
      if (this.match(entry.pattern, req.method, entry.isWildcard)) {
        await entry.fn(req.params, sendResponse);
        return;
      }
    }
    sendResponse(undefined, { code: -32601, message: `未知方法: ${req.method}` });
  }

  private match(pattern: string, method: string, isWildcard: boolean): boolean {
    if (!isWildcard) return pattern === method;
    const prefix = pattern.replace('*', '');
    return method.startsWith(prefix);
  }
}
