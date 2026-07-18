/**
 * 内容提取处理器
 *
 * 通过 Content Script 获取页面内容
 */
import type { Router } from '../router.js';
import { permissionStore } from '../permissions.js';

async function proxyToContentScript(tabId: number, method: string, params?: Record<string, unknown>): Promise<unknown> {
  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      source: 'browser-mcp-bg',
      method,
      params: params ?? {},
    });
    return result;
  } catch {
    // Content script 未注入，尝试注入
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

/** 获取当前激活标签页 ID */
async function getActiveTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) throw new Error('没有激活的标签页');
  return tabs[0].id;
}

/**
 * 通过 chrome.storage.session 获取内容（解决 sendMessage 大小限制）
 */
async function fetchContentViaStorage(tabId: number, method: string, params?: Record<string, unknown>): Promise<unknown> {
  const responseKey = `extract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 发送请求给 content script，带上 storage key
  await chrome.tabs.sendMessage(tabId, {
    source: 'browser-mcp-bg',
    method: `${method}_storage`,  // content script 里有对应的 _storage handler
    params: { ...params, _responseKey: responseKey },
  });

  // 轮询等待 content script 把结果写入 storage
  for (let i = 0; i < 30; i++) {
    const data = await chrome.storage.session.get(responseKey);
    if (data[responseKey]) {
      const result = data[responseKey];
      await chrome.storage.session.remove(responseKey);
      return result;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error('内容提取超时');
}

export function registerContentHandlers(router: Router): void {
  router.register('get_markdown', async (params, respond) => {
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    try {
      const result = await proxyToContentScript(tabId, 'get_markdown');
      respond(result);
    } catch {
      // sendMessage 可能因内容过大失败，改用 storage 通道
      const result = await fetchContentViaStorage(tabId, 'get_markdown');
      respond(result);
    }
  });

  router.register('get_html', async (params, respond) => {
    if (!(await permissionStore.isGranted('get_html'))) {
      respond(undefined, { code: -100, message: '获取 HTML 需要授权，请在扩展弹窗中操作' });
      return;
    }
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });
    respond({ html: result?.result ?? '' });
  });

  router.register('get_text', async (params, respond) => {
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    try {
      const result = await proxyToContentScript(tabId, 'get_text');
      respond(result);
    } catch {
      const result = await fetchContentViaStorage(tabId, 'get_text');
      respond(result);
    }
  });

  router.register('extract_article', async (params, respond) => {
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    try {
      const result = await proxyToContentScript(tabId, 'extract_article');
      respond(result);
    } catch {
      const result = await fetchContentViaStorage(tabId, 'extract_article');
      respond(result);
    }
  });

  // extract_table / extract_links / extract_images
  router.register('extract_table', async (params, respond) => {
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    const result = await proxyToContentScript(tabId, 'extract_table', params as Record<string, unknown>);
    respond(result);
  });

  router.register('extract_links', async (params, respond) => {
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    try {
      const result = await proxyToContentScript(tabId, 'extract_links');
      respond(result);
    } catch {
      const result = await fetchContentViaStorage(tabId, 'extract_links');
      respond(result);
    }
  });

  router.register('extract_images', async (params, respond) => {
    const tabId = (params as any)?.tabId ?? await getActiveTabId();
    const result = await proxyToContentScript(tabId, 'extract_images', params as Record<string, unknown>);
    respond(result);
  });
}
