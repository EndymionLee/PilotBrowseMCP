/**
 * DOM 操作处理器 - 通过 Content Script 代理
 */
import type { Router } from '../router.js';
import { permissionStore } from '../permissions.js';

async function proxy(tabId: number, method: string, params?: Record<string, unknown>): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      source: 'browser-mcp-bg',
      method,
      params: params ?? {},
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    await new Promise((r) => setTimeout(r, 100));
    return chrome.tabs.sendMessage(tabId, {
      source: 'browser-mcp-bg',
      method,
      params: params ?? {},
    });
  }
}

export function registerDomHandlers(router: Router): void {
  const domMethods = ['query_dom', 'xpath_query', 'find_element', 'click_element', 'type_text', 'scroll_page', 'wait_for_element', 'observe_dom', 'evaluate'];

  for (const method of domMethods) {
    router.register(method, async (params, respond) => {
      const p = params as { tabId: number };
      const result = await proxy(p.tabId, method, p);
      respond(result);
    });
  }

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
