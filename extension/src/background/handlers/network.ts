/**
 * 网络监听处理器
 *
 * 通过 chrome.debugger API 拦截请求，NetworkStore 缓存数据
 */
import type { Router } from '../router.js';
import { NetworkStore } from '../../utils/network-store.js';
import type { NetworkSearchParams, StoredRequest } from '../../utils/network-store.js';
import type { WsClient } from '../ws-client.js';

const networkStores = new Map<number, NetworkStore>();
const debuggerHandlers = new Map<number, (source: chrome.debugger.Debuggee, method: string, params: unknown) => void>();

export function registerNetworkHandlers(router: Router, wsClient: WsClient): void {
  router.register('start_network_monitor', async (params, respond) => {
    const tabId = (params as { tabId: number }).tabId;

    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');

    if (!networkStores.has(tabId)) {
      networkStores.set(tabId, new NetworkStore(500));
    }
    const store = networkStores.get(tabId)!;

    const handler = (source: chrome.debugger.Debuggee, eventMethod: string, eventParams: unknown) => {
      if (source.tabId !== tabId) return;

      const p = eventParams as Record<string, unknown>;

      switch (eventMethod) {
        case 'Network.requestWillBeSent':
          store.onRequestWillBeSent(tabId, p);
          break;
        case 'Network.responseReceived':
          store.onResponseReceived(tabId, p);
          break;
        case 'Network.loadingFinished':
          store.onLoadingFinished(tabId, p, (reqId: string) =>
            chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody', { requestId: reqId }),
          );
          break;
        case 'Network.loadingFailed':
          store.onLoadingFailed(tabId, p);
          break;
      }

      // 转发关键事件到 MCP Server
      const relevant = ['Network.requestWillBeSent', 'Network.responseReceived'];
      if (relevant.includes(eventMethod)) {
        wsClient.send({
          type: 'event',
          event: eventMethod,
          data: { source, params: eventParams },
        });
      }
    };

    chrome.debugger.onEvent.addListener(handler);
    debuggerHandlers.set(tabId, handler);

    respond({ success: true, storeSize: store.size });
  });

  router.register('stop_network_monitor', async (params, respond) => {
    const tabId = (params as { tabId: number }).tabId;

    const handler = debuggerHandlers.get(tabId);
    if (handler) {
      chrome.debugger.onEvent.removeListener(handler);
      debuggerHandlers.delete(tabId);
    }

    await chrome.debugger.detach({ tabId });
    networkStores.delete(tabId);
    respond({ success: true });
  });

  router.register('get_network_logs', async (params, respond) => {
    const p = params as { tabId: number; keyword?: string; limit?: number };
    const store = networkStores.get(p.tabId);
    if (!store) {
      respond({ requests: [], total: 0, message: '尚未启动网络监听' });
      return;
    }
    const result = store.search({ tabId: p.tabId, keyword: p.keyword, limit: p.limit ?? 50 });
    respond(result);
  });

  router.register('network_search', async (params, respond) => {
    const sp = params as NetworkSearchParams;
    const { tabId } = sp;

    if (tabId !== undefined) {
      const store = networkStores.get(tabId);
      if (!store) { respond({ requests: [], total: 0 }); return; }
      respond(store.search(sp));
      return;
    }

    // 跨所有标签页搜索
    const all: StoredRequest[] = [];
    for (const store of networkStores.values()) {
      const result = store.search(sp);
      all.push(...result.requests);
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    const limit = sp.limit ?? 50;
    const offset = sp.offset ?? 0;
    respond({ requests: all.slice(offset, offset + limit), total: all.length });
  });

  router.register('network_replay', async (params, respond) => {
    const requestId = (params as { requestId: string }).requestId;

    let found: StoredRequest | undefined;
    for (const store of networkStores.values()) {
      found = store.get(requestId);
      if (found) break;
    }
    if (!found) {
      respond(undefined, { code: -1, message: `未找到请求: ${requestId}` });
      return;
    }

    // 重放请求
    const headers: Record<string, string> = { ...found.headers };
    delete headers['Host'];
    delete headers['Origin'];
    delete headers['Referer'];
    delete headers['Cookie'];
    delete headers['User-Agent'];

    const options: RequestInit = { method: found.method, headers };
    if (found.postData && found.method !== 'GET') {
      options.body = found.postData;
    }

    try {
      const response = await fetch(found.url, options);
      const body = await response.text();
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });

      respond({
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
        body,
      });
    } catch (err) {
      respond(undefined, { code: -1, message: `重放失败: ${(err as Error).message}` });
    }
  });
}
