/**
 * 网络监听处理器
 *
 * 通过 chrome.debugger API 拦截请求，NetworkStore 缓存数据
 * 支持工具：monitor, search, get, wait, replay, override
 */
import type { Router } from '../router.js';
import { NetworkStore } from '../../utils/network-store.js';
import type { NetworkSearchParams, StoredRequest } from '../../utils/network-store.js';
import type { WsClient } from '../ws-client.js';

const networkStores = new Map<number, NetworkStore>();
const debuggerHandlers = new Map<number, (source: chrome.debugger.Debuggee, method: string, params: unknown) => void>();

// ─── Override 规则 ───

interface OverrideRule {
  urlPattern: string;
  responseBody: string;
  statusCode: number;
  responseHeaders?: Record<string, string>;
}

const overrideRules = new Map<number, OverrideRule[]>();
const fetchHandlers = new Map<number, (event: any) => void>();

// ─── 注册 ───

export function registerNetworkHandlers(router: Router, wsClient: WsClient): void {
  // ── start_network_monitor ──

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

    // 如果有 override 规则，启用 Fetch 域
    if (overrideRules.has(tabId) && overrideRules.get(tabId)!.length > 0) {
      await enableFetchOverride(tabId);
    }

    respond({ success: true, storeSize: store.size });
  });

  // ── stop_network_monitor ──

  router.register('stop_network_monitor', async (params, respond) => {
    const tabId = (params as { tabId: number }).tabId;

    const handler = debuggerHandlers.get(tabId);
    if (handler) {
      chrome.debugger.onEvent.removeListener(handler);
      debuggerHandlers.delete(tabId);
    }

    const fetchHandler = fetchHandlers.get(tabId);
    if (fetchHandler) {
      chrome.debugger.onEvent.removeListener(fetchHandler);
      fetchHandlers.delete(tabId);
    }

    await chrome.debugger.detach({ tabId });
    // 只停监听，不清缓存，保留缓存的请求数据供后续查看和重放
    overrideRules.delete(tabId);
    respond({ success: true });
  });

  // ── get_network_logs (legacy) ──

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

  // ── network_search ──

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

  // ── network_get (新增) ──

  router.register('network_get', async (params, respond) => {
    const requestId = (params as { requestId: string }).requestId;

    for (const store of networkStores.values()) {
      const found = store.get(requestId);
      if (found) {
        respond(found);
        return;
      }
    }
    respond(undefined, { code: -1, message: `请求未找到: ${requestId}` });
  });

  // ── network_clear_cache (新增) ──

  router.register('network_clear_cache', async (params, respond) => {
    const { tabId, allTabs } = params as { tabId?: number; allTabs?: boolean };
    let cleared = 0;

    if (allTabs) {
      for (const store of networkStores.values()) {
        cleared += store.size;
      }
      networkStores.clear();
    } else if (tabId !== undefined) {
      const store = networkStores.get(tabId);
      if (store) {
        cleared = store.size;
        store.clearAll();
      }
    } else {
      respond(undefined, { code: -1, message: '提供 tabId 或设置 allTabs=true' });
      return;
    }

    respond({ cleared });
  });

  // ── network_wait (新增) ──

  router.register('network_wait', async (params, respond) => {
    const { tabId, urlPattern, method, statusCode, keyword, timeout = 10000 } = params as {
      tabId: number;
      urlPattern: string;
      method?: string;
      statusCode?: number;
      keyword?: string;
      timeout?: number;
    };

    const store = networkStores.get(tabId);
    if (!store) {
      respond(undefined, { code: -1, message: '网络监听未启动，请先调用 browser.start_network_monitor' });
      return;
    }

    const re = new RegExp(urlPattern, 'i');
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = store.search({ tabId, method, statusCode, keyword, limit: 50 });
      const match = result.requests.find((req) => re.test(req.url) && req.response);
      if (match) {
        respond({ ...match, elapsed: Date.now() - startTime });
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    respond(undefined, { code: -1, message: `等待超时: ${timeout}ms 内未匹配到 ${urlPattern}` });
  });

  // ── network_replay ──

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

  // ── network_replay_browser (浏览器上下文重放) ──

  router.register('network_replay_browser', async (params, respond) => {
    const { requestId, overrides, extract } = params as {
      requestId: string;
      overrides?: { query?: Record<string, any>; headers?: Record<string, string>; body?: any };
      extract?: { path?: string };
    };

    // 从缓存获取原始请求
    let found: StoredRequest | undefined;
    for (const store of networkStores.values()) {
      found = store.get(requestId);
      if (found) break;
    }
    if (!found) {
      respond(undefined, { code: -1, message: `请求未找到: ${requestId}` });
      return;
    }

    // 构造请求（保留 Cookie，使用浏览器 fetch）
    let url = found.url;
    const headers: Record<string, string> = { ...found.headers };
    // 只移除 Host，保留 Cookie 和其他认证头
    delete headers['Host'];

    if (overrides?.query) {
      try {
        const u = new URL(url);
        for (const [k, v] of Object.entries(overrides.query)) { u.searchParams.set(k, String(v)); }
        url = u.toString();
      } catch {}
    }
    if (overrides?.headers) { Object.assign(headers, overrides.headers); }

    const fetchOptions: RequestInit = { method: found.method, headers, credentials: 'include' };
    if (overrides?.body !== undefined) {
      fetchOptions.body = typeof overrides.body === 'object' ? JSON.stringify(overrides.body) : String(overrides.body);
    } else if (found.postData && found.method !== 'GET') {
      fetchOptions.body = found.postData;
    }

    try {
      const response = await fetch(url, fetchOptions);
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });
      const body = await response.text();

      let extracted: any = undefined;
      if (extract?.path && body) {
        try {
          const json = JSON.parse(body);
          // 用 resolvePath 函数，但 extension 里没有，直接实现简单路径提取
          const parts = extract.path.split('.');
          let current = json;
          for (const part of parts) {
            if (current === null || current === undefined) break;
            const match = part.match(/^(\w+)\[(\d+)\]$/);
            if (match) { current = current[match[1]]; if (Array.isArray(current)) current = current[parseInt(match[2])]; }
            else { current = current[part]; }
          }
          extracted = current;
        } catch {}
      }

      respond({ status: response.status, statusText: response.statusText, headers: respHeaders, body, extracted });
    } catch (err) {
      respond(undefined, { code: -1, message: `浏览器重放失败: ${(err as Error).message}` });
    }
  });

  // ── network_override_set (新增) ──

  router.register('network_override_set', async (params, respond) => {
    const { tabId, urlPattern, responseBody, statusCode = 200, responseHeaders } = params as {
      tabId: number;
      urlPattern: string;
      responseBody: string;
      statusCode?: number;
      responseHeaders?: Record<string, string>;
    };

    if (!overrideRules.has(tabId)) {
      overrideRules.set(tabId, []);
    }
    overrideRules.get(tabId)!.push({ urlPattern, responseBody, statusCode, responseHeaders });

    // 如果已经在监听，启用 Fetch 域
    if (debuggerHandlers.has(tabId) && !fetchHandlers.has(tabId)) {
      try {
        await enableFetchOverride(tabId);
      } catch (err) {
        respond(undefined, { code: -1, message: `启用 Fetch 拦截失败: ${(err as Error).message}` });
        return;
      }
    }

    respond({ success: true, rulesCount: overrideRules.get(tabId)!.length });
  });

  // ── network_override_clear (新增) ──

  router.register('network_override_clear', async (params, respond) => {
    const tabId = (params as { tabId: number }).tabId;
    overrideRules.delete(tabId);

    const fetchHandler = fetchHandlers.get(tabId);
    if (fetchHandler) {
      chrome.debugger.onEvent.removeListener(fetchHandler);
      fetchHandlers.delete(tabId);
    }

    if (debuggerHandlers.has(tabId)) {
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.disable');
      } catch {}
    }

    respond({ success: true });
  });

  // ── network_override_list (新增) ──

  router.register('network_override_list', async (params, respond) => {
    const tabId = (params as { tabId: number }).tabId;
    const rules = overrideRules.get(tabId) || [];
    respond({ rules });
  });
}

// ─── Fetch 域覆盖逻辑 ───

async function enableFetchOverride(tabId: number): Promise<void> {
  await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
    patterns: [{ requestStage: 'Response' }],
  });

  const handler = async (source: chrome.debugger.Debuggee, eventMethod: string, eventParams: unknown) => {
    if (source.tabId !== tabId) return;
    if (eventMethod !== 'Fetch.requestPaused') return;

    const p = eventParams as any;
    const rules = overrideRules.get(tabId) || [];

    let matchedRule: OverrideRule | null = null;
    for (const rule of rules) {
      try {
        const re = new RegExp(rule.urlPattern, 'i');
        if (re.test(p.request?.url || '')) {
          matchedRule = rule;
          break;
        }
      } catch {}
    }

    if (matchedRule) {
      // 构造自定义响应头
      const responseHeaders = Object.entries(matchedRule.responseHeaders || {}).map(([k, v]) => ({
        name: k,
        value: v,
      }));
      // 添加 Content-Type
      if (!responseHeaders.some((h) => h.name.toLowerCase() === 'content-type')) {
        responseHeaders.push({ name: 'Content-Type', value: 'application/json; charset=utf-8' });
      }

      try {
        await chrome.debugger.sendCommand(
          { tabId },
          'Fetch.fulfillRequest',
          {
            requestId: p.requestId,
            responseCode: matchedRule.statusCode,
            responseHeaders,
            body: btoa(unescape(encodeURIComponent(matchedRule.responseBody))),
          },
        );
      } catch {}
    } else {
      // 不匹配，放行
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
          requestId: p.requestId,
        });
      } catch {}
    }
  };

  chrome.debugger.onEvent.addListener(handler);
  fetchHandlers.set(tabId, handler);
}
