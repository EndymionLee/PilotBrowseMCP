/**
 * DOM 操作处理器 - 通过 Content Script 代理
 */
import type { Router } from '../router.js';
import { permissionStore } from '../permissions.js';

async function proxy(tabId: number, method: string, params?: Record<string, unknown>, frameId?: number): Promise<unknown> {
  const sendOpts = frameId !== undefined ? { frameId } : {};
  const msg = { source: 'browser-mcp-bg', method, params: params ?? {} };
  try {
    return await chrome.tabs.sendMessage(tabId, msg, sendOpts);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    await new Promise((r) => setTimeout(r, 100));
    return chrome.tabs.sendMessage(tabId, msg, sendOpts);
  }
}

export function registerDomHandlers(router: Router): void {
  const domMethods = ['query_dom', 'xpath_query', 'find_element', 'click_element', 'type_text', 'scroll_page', 'wait_for_element', 'observe_dom'];

  for (const method of domMethods) {
    router.register(method, async (params, respond) => {
      const p = params as { tabId: number; frameId?: number };
      const result = await proxy(p.tabId, method, p, p.frameId);
      respond(result);
    });
  }

  // evaluate：用 chrome.scripting.executeScript（MAIN world，绕过页面 CSP，支持 promise 与 iframe）。
  // 不再往 DOM 写内联 script（避免被 CSP 拦截、避免污染 get_text）。
  router.register('evaluate', async (params, respond) => {
    const { tabId, code, frameId, allFrames } = params as { tabId: number; code?: string; frameId?: number; allFrames?: boolean };
    if (!code) { respond(undefined, { code: -1, message: 'code 不能为空' }); return; }
    try {
      const target: { tabId: number; frameIds?: number[]; allFrames?: boolean } = { tabId };
      if (frameId !== undefined) target.frameIds = [frameId];
      if (allFrames) target.allFrames = true;
      const results = await chrome.scripting.executeScript({
        target,
        world: 'MAIN',
        func: async (c: string) => {
          // eslint-disable-next-line no-eval
          const result = await (async () => eval(c))();
          if (result === undefined || result === null) return null;
          if (typeof result === 'object') {
            try { return JSON.parse(JSON.stringify(result)); } catch { return String(result); }
          }
          return result;
        },
        args: [code],
      });
      respond({ result: results?.[0]?.result ?? null, frameId: frameId ?? results?.[0]?.frameId });
    } catch (err) {
      respond(undefined, { code: -1, message: `evaluate 失败: ${(err as Error).message}` });
    }
  });

  // LocalStorage (敏感)
  router.register('get_local_storage', async (params, respond) => {
    if (!(await permissionStore.isGranted('local_storage'))) {
      respond(undefined, { code: -100, message: '读取 LocalStorage 需要授权，请在扩展弹窗中操作' });
      return;
    }
    const p = params as { tabId: number; keys?: string[] };
    const result = await proxy(p.tabId, 'get_local_storage', p);
    respond(result);
  });
}
