/**
 * Service Worker 入口
 */
import { WsClient } from './ws-client.js';
import { Router } from './router.js';
import type { RequestMessage } from '../shared/protocol.js';

import { registerTabHandlers } from './handlers/tabs.js';
import { registerContentHandlers } from './handlers/content.js';
import { registerDomHandlers } from './handlers/dom.js';
import { registerNetworkHandlers } from './handlers/network.js';
import { registerCookieHandlers } from './handlers/cookies.js';
import { registerScreenshotHandlers } from './handlers/screenshot.js';
import { registerPermissionHandlers } from './handlers/permissions.js';
import { permissionStore, PermissionStore } from './permissions.js';
import { startRec, stopRec, isRecording, resetRec, reInject } from './handlers/recorder.js';
import { Lexer } from '../pab/lexer.js';
import { Parser } from '../pab/parser.js';
import { Interpreter } from '../pab/interpreter.js';

let currentRecTabId = 0;
let recTabs = new Set<number>();
let recTabCounts = new Map<number, number>(); // tabId -> steps seen
let recGlobalCount = 0;
let recBlink: ReturnType<typeof setInterval> | null = null;
let blinkContent = 'REC';

const WS_URL = 'ws://localhost:9456';
const wsClient = new WsClient(WS_URL);
const router = new Router();

registerTabHandlers(router);
registerContentHandlers(router);
registerDomHandlers(router);

// PAB 执行（WebSocket 路径，供 Server 调用）
router.register('pab_run', async (params, respond) => {
  const pabCode = (params as any).code as string;
  if (!pabCode) { respond(undefined, { code: -1, message: 'code is required' }); return; }
  try {
    const tokens = new Lexer(pabCode).tokenize();
    const ast = new Parser(tokens).parse();
    const ctx = new Interpreter(router);
    await ctx.run(ast);
    const logs = ctx.getLogs();
    const ok = logs.filter(l => l.type !== 'error').length;
    const fail = logs.filter(l => l.type === 'error').length;
    scriptResults = { ok, fail, total: logs.length, details: logs };
    chrome.storage.local.set({ lastScriptResult: scriptResults }).catch(() => {});
    chrome.action.setBadgeText({ text: fail > 0 ? `${fail}F` : 'OK' });
    chrome.action.setBadgeBackgroundColor({ color: fail > 0 ? '#FF3B30' : '#30B94E' });
    setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 8000);
    respond({ success: true, ok, fail, total: logs.length, details: logs });
  } catch (err) {
    const msg = (err as Error).message;
    scriptResults = { ok: 0, fail: 1, total: 1, details: [{ step: 0, type: 'error', error: msg, timestamp: Date.now() }] };
    chrome.storage.local.set({ lastScriptResult: scriptResults }).catch(() => {});
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF3B30' });
    setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 8000);
    respond(undefined, { code: -1, message: msg });
  }
});
registerNetworkHandlers(router, wsClient);
registerCookieHandlers(router);
registerScreenshotHandlers(router);
registerPermissionHandlers(router);

chrome.tabs.onCreated.addListener(() => notifyTabs());
chrome.tabs.onRemoved.addListener(() => notifyTabs());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  notifyTabs();
  if (isRecording() && changeInfo.status === 'complete') {
    activateRecOnTab(tabId, 1);
  }
});
chrome.tabs.onActivated.addListener((activeInfo) => {
  notifyTabs();
  if (isRecording()) {
    activateRecOnTab(activeInfo.tabId);
  }
});

async function activateRecOnTab(tabId: number, retries = 2): Promise<void> {
  if (!isRecording()) return;
  for (let i = 0; i < retries; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { source: 'browser-mcp-bg', method: 'recording_start' });
      recTabs.add(tabId);
      return;
    } catch {
      // content script 未加载，注入后再试
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await new Promise((r) => setTimeout(r, 700));
      } catch { return; }
    }
  }
}

async function notifyTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const list = tabs.filter((t) => t.id && t.url).map((t) => ({ id: t.id!, url: t.url!, title: t.title ?? '', active: t.active ?? false }));
    wsClient.send({ type: 'event', event: 'tabs_updated', data: { tabs: list } });
  } catch {}
}

wsClient.onMessage((raw) => {
  const msg = raw as unknown as RequestMessage;
  if (msg.type !== 'request') return;
  router.dispatch(msg, (result, error) => { wsClient.send({ type: 'response', id: msg.id, result, error }); })
    .catch((err) => { wsClient.send({ type: 'response', id: msg.id, error: { code: -1, message: err.message } }); });
});

// ---- Popup / 后台任务 ----


async function waitForRecordingResult(responseKey: string): Promise<any[]> {
  for (let i = 0; i < 20; i++) {
    const data = await chrome.storage.session.get(responseKey);
    if (data[responseKey]) {
      const r = data[responseKey];
      await chrome.storage.session.remove(responseKey);
      return r.steps ?? [];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return [];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as any;

  // content script 消息：检查录制状态（页面跳转后内容脚本重启时调用）
  if (msg.source === 'browser-mcp-content' && msg.type === 'recording_check') {
    const tabId = _sender?.tab?.id;
    if (isRecording() && tabId) activateRecOnTab(tabId, 1);
    return;
  }

  // content script 消息：录制状态更新（全局计数）
  if (msg.source === 'browser-mcp-content' && msg.type === 'recording_active') {
    const tabId = _sender?.tab?.id || 0;
    const prev = recTabCounts.get(tabId) || 0;
    if (msg.stepCount > prev) {
      const delta = msg.stepCount - prev;
      recGlobalCount += delta;
      recTabCounts.set(tabId, msg.stepCount);
    }
    const displayCount = recGlobalCount || msg.stepCount;
    blinkContent = String(displayCount);
    chrome.action.setBadgeText({ text: String(displayCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#E0352B' });
    return;
  }

  if (msg.source !== 'browser-mcp-popup') return;

  switch (msg.type) {
    case 'ping':
      sendResponse({ status: wsClient.connected ? 'connected' : 'disconnected' });
      return true;

    case 'get_permissions':
      permissionStore.getGranted().then((granted) => { sendResponse({ granted, all: PermissionStore.listSensitive() }); });
      return true;

    case 'grant_permission':
      permissionStore.grant(msg.action).then(() => sendResponse({ success: true }));
      return true;

    case 'revoke_permission':
      permissionStore.revoke(msg.action).then(() => sendResponse({ success: true }));
      return true;

    // 拾取元素（用 event.composedPath 而非 elementsFromPoint）
    case 'pick_element': {
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;
        chrome.scripting.executeScript({
          target: { tabId },
          world: 'ISOLATED',
          func: () => {
            let currentEl = null;
            const overlay = document.createElement('div');
            overlay.id = '__mcp_overlay';
            overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2.5px solid #ff6b35;background:rgba(255,107,53,0.07);transition:all 0.05s;';
            document.body.appendChild(overlay);
            const tip = document.createElement('div');
            tip.id = '__mcp_tip';
            tip.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:6px 18px;border-radius:8px;font:13px sans-serif;z-index:2147483647;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
            tip.textContent = '点击拾取元素 | Esc 取消';
            document.body.appendChild(tip);

            function showOverlay(el) {
              const r = el.getBoundingClientRect();
              overlay.style.left = r.left + 'px';
              overlay.style.top = r.top + 'px';
              overlay.style.width = r.width + 'px';
              overlay.style.height = r.height + 'px';
            }
            function hideOverlay() { overlay.style.width = '0'; overlay.style.height = '0'; }

            function onMove(e) {
              const path = e.composedPath();
              const el = path.find(x => x instanceof Element && x !== document.body && x !== document.documentElement) as Element | undefined;
              if (!el || el === currentEl) return;
              currentEl = el;
              showOverlay(el);
            }

            function onPick(e) {
              e.preventDefault(); e.stopPropagation();
              const path = e.composedPath();
              const el = path.find(x => x instanceof Element && x !== document.body && x !== document.documentElement) as Element | undefined;
              cleanup();
              if (!el) return;

              let cssSel = '';
              if (el.id) cssSel = '#' + el.id;
              else if (el.className && typeof el.className === 'string') {
                const cls = el.className.trim().split(/\s+/).slice(0, 3).filter(c => !c.includes('_')).join('.');
                if (cls) cssSel = el.tagName?.toLowerCase() + '.' + cls;
              }
              if (!cssSel) {
                const p = []; let cur = el;
                while (cur && cur !== document.body && cur !== document.documentElement) {
                  let s = cur.tagName?.toLowerCase() || '';
                  if (cur.id) { p.unshift('#' + cur.id); break; }
                  if (cur.className && typeof cur.className === 'string') {
                    const c = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
                    if (c) s += '.' + c;
                  }
                  p.unshift(s); cur = cur.parentElement;
                }
                cssSel = p.join(' > ');
              }

              try {
                const text = el.textContent?.trim().slice(0, 200) || '';
                const ariaLabel = el.getAttribute('aria-label') || '';
                const placeholder = (el as HTMLInputElement).placeholder || '';
                // 检测是否在 Shadow DOM 内
                let inShadow = false;
                let shadowHost = '';
                let root = el.getRootNode();
                if (root instanceof ShadowRoot) {
                  inShadow = true;
                  shadowHost = (root.host as HTMLElement).tagName?.toLowerCase() || '';
                  const hostId = (root.host as HTMLElement).id;
                  if (hostId) shadowHost += '#' + hostId;
                }
                chrome.storage.local.set({
                  pick_result: {
                    tag: el.tagName?.toLowerCase(),
                    selector: cssSel,
                    text,
                    ariaLabel,
                    placeholder,
                    inShadow,
                    shadowHost,
                    html: el.outerHTML?.slice(0, 300),
                    url: location.href,
                  },
                  pick_time: Date.now(),
                });
              } catch {}
            }

            function onKey(e) { if (e.key === 'Escape') cleanup(); }
            function cleanup() {
              currentEl = null;
              document.removeEventListener('mousemove', onMove, true);
              document.removeEventListener('click', onPick, true);
              document.removeEventListener('keydown', onKey);
              ['__mcp_overlay', '__mcp_tip'].forEach(id => document.getElementById(id)?.remove());
            }

            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('click', onPick, true);
            document.addEventListener('keydown', onKey);
          },
        }).catch(() => {});
      });
      sendResponse({ success: true });
      return true;
    }

    // 录制
    case 'recording_start': {
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
          sendResponse({ success: false, error: '当前页面不支持录制（请打开一个普通网页）' });
          return;
        }
        currentRecTabId = tab.id!;
        recTabs.add(tab.id!);
        recTabCounts.clear();
        recGlobalCount = 0;
        // 开始闪烁 badge
        chrome.action.setBadgeText({ text: 'REC' });
        chrome.action.setBadgeBackgroundColor({ color: '#E0352B' });
        if (recBlink) clearInterval(recBlink);
        let blinkShow = true;
        recBlink = setInterval(() => {
          blinkShow = !blinkShow;
          chrome.action.setBadgeText({ text: blinkShow ? blinkContent : '' });
        }, 800);
        startRec(tab.id!).then(sendResponse);
      });
      return true;
    }

    case 'recording_stop': {
      const allTabs = Array.from(recTabs);
      currentRecTabId = 0;
      recTabs.clear();
      recTabCounts.clear();
      recGlobalCount = 0;
      if (recBlink) { clearInterval(recBlink); recBlink = null; }
      chrome.action.setBadgeText({ text: '' });
      stopRec(allTabs).then((result) => sendResponse(result));
      return true;
    }

    case 'recording_status':
      sendResponse({ recording: isRecording() });
      return true;

    case 'recording_reset':
      resetRec();
      currentRecTabId = 0;
      recTabs.clear();
      recTabCounts.clear();
      recGlobalCount = 0;
      if (recBlink) { clearInterval(recBlink); recBlink = null; }
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
      return true;

    case 'save_workflow':
      bufferedSend({ type: 'event', event: 'save_workflow', data: { description: msg.description, url: msg.url, title: msg.title, steps: msg.steps } })
        .then((sent) => { sendResponse({ success: true, sent, message: sent ? '已发送' : 'Server 离线，已暂存' }); });
      return true;

    // 关闭 Server
    case 'shutdown_server':
      wsClient.send({ type: 'event', event: 'shutdown' });
      sendResponse({ success: true });
      return true;

    case 'save_element':
      bufferedSend({ type: 'event', event: 'save_element', data: { description: msg.description, selector: msg.selector, url: msg.url } })
        .then((sent) => { sendResponse({ success: true, sent, message: sent ? '已发送' : 'Server 离线，已暂存' }); });
      return true;
    // 运行脚本（popup 一次性发送全部步骤，background 逐条执行）
    case 'script_run': {
      const runScript = async () => {
        const steps: { method: string; params: any }[] = msg.steps || [];
        // MCP 工具名 -> 内部 handler 名
        const methodMap: Record<string, string> = {
          browser_open: 'open_tab', browser_close: 'close_tab', browser_activate: 'activate_tab',
          browser_list_tabs: 'list_tabs',
          browser_click: 'click_element', browser_type: 'type_text', browser_scroll: 'scroll_page',
          browser_query: 'query_dom', browser_evaluate: 'evaluate', browser_find: 'find_element',
          browser_wait: 'wait', browser_wait_for_element: 'wait_for_element',
          browser_get_markdown: 'get_markdown', browser_get_html: 'get_html', browser_get_text: 'get_text',
          browser_extract_article: 'extract_article', browser_extract_table: 'extract_table',
          browser_extract_links: 'extract_links', browser_extract_images: 'extract_images',
          browser_start_network_monitor: 'start_network_monitor',
          browser_stop_network_monitor: 'stop_network_monitor',
          browser_network_search: 'network_search', browser_network_detail: 'network_get',
          browser_network_wait: 'network_wait', browser_network_replay: 'network_replay',
          browser_network_clear_cache: 'network_clear_cache',
          browser_cookies: 'get_cookies', browser_local_storage: 'get_local_storage',
          browser_screenshot: 'screenshot',
          browser_permissions_list: 'permissions_list', browser_permissions_grant: 'permissions_grant',
          browser_current_page: 'list_tabs',
          browser_permissions_revoke: 'permissions_revoke',
        };
        // 需要 tabId 的工具（自动注入 params.tabId）
        const needTabId = new Set(['click_element', 'type_text', 'scroll_page', 'query_dom', 'evaluate', 'find_element',
          'wait_for_element', 'screenshot', 'get_markdown', 'get_html', 'get_text',
          'extract_article', 'extract_table', 'extract_links', 'extract_images',
          'start_network_monitor', 'stop_network_monitor',
          'network_search', 'network_wait', 'network_replay', 'network_clear_cache',
          'get_cookies', 'get_local_storage']);
        // 需要 id 的工具（自动注入 params.id，用于 close_tab / activate_tab）
        const needId = new Set(['close_tab', 'activate_tab']);
        let activeTabId: number | null = null;
        sendResponse({ success: true, total: steps.length });
        let ok = 0, fail = 0;
        const details: { step: number; method: string; status: string; error?: string }[] = [];
        chrome.action.setBadgeText({ text: '...' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const innerMethod = methodMap[step.method] || step.method;
          const params = { ...(step.params || {}) };
          if (activeTabId && needTabId.has(innerMethod) && !params.tabId) {
            params.tabId = activeTabId;
          }
          if (activeTabId && needId.has(innerMethod) && !params.id) {
            params.id = activeTabId;
          }
          chrome.action.setBadgeText({ text: `${i + 1}/${steps.length}` });
          let status = 'ok';
          let error: string | undefined;
          try {
            if (innerMethod === 'wait') {
              const ms = params.ms || 1000;
              await new Promise((r) => setTimeout(r, ms));
            } else {
              const req = { type: 'request' as const, id: `script_${i}_${Date.now()}`, method: innerMethod, params };
              const result: any = await new Promise((resolve, reject) => {
                router.dispatch(req, (res, err) => {
                  if (err) reject(new Error(err.message)); else resolve(res);
                }).catch(reject);
              });
              if (innerMethod === 'open_tab' && result?.tab?.id) {
                activeTabId = result.tab.id;
              }
            }
            ok++;
          } catch (e) {
            status = 'fail';
            error = (e as Error).message;
            fail++;
          }
          details.push({ step: i + 1, method: step.method, status, error });
        }
        scriptResults = { ok, fail, total: steps.length, details };
        chrome.action.setBadgeText({ text: fail > 0 ? `${fail}F` : 'OK' });
        chrome.action.setBadgeBackgroundColor({ color: fail > 0 ? '#FF3B30' : '#30B94E' });
        setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 5000);
      };
      runScript();
      return;
    }
    // 查询脚本状态（popup 打开时调用）
    case 'script_status': {
      if (scriptResults) { sendResponse(scriptResults); return true; }
      chrome.storage.local.get('lastScriptResult').then((r) => {
        const result = r.lastScriptResult || null;
        // 取出后清掉 storage，下次弹窗不会再显示旧结果
        if (result) chrome.storage.local.remove('lastScriptResult').catch(() => {});
        sendResponse(result);
      });
      return true;
    }

    case 'script_clear': {
      scriptResults = null;
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
      return true;
    }


    // PAB 脚本执行
    case 'pab_run': {
      const pabCode = msg.code as string;
      const inputs = msg.inputs || {};
      if (pabAbortController) { pabAbortController.abort(); }
      pabAbortController = new AbortController();
      const signal = pabAbortController.signal;
      (async () => {
        try {
          chrome.action.setBadgeText({ text: 'RUN' });
          chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
          const tokens = new Lexer(pabCode).tokenize();
          const ast = new Parser(tokens).parse();
          const ctx = new Interpreter(router, inputs, pabAbortController!);
          const result = await ctx.run(ast);
          if (signal.aborted) { sendResponse({ stopped: true }); return; }
          const logs = ctx.getLogs();
          const ok = logs.filter(l => l.type !== 'error').length;
          const fail = logs.filter(l => l.type === 'error').length;
          scriptResults = { ok, fail, total: logs.length, details: logs };
          chrome.storage.local.set({ lastScriptResult: scriptResults }).catch(() => {});
          chrome.action.setBadgeText({ text: fail > 0 ? `${fail}F` : 'OK' });
          chrome.action.setBadgeBackgroundColor({ color: fail > 0 ? '#FF3B30' : '#30B94E' });
          setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 8000);
          sendResponse({ success: true, ok, fail, total: logs.length, details: logs });
        } catch (err) {
          const msg = (err as Error).message;
          if (signal.aborted) { sendResponse({ stopped: true }); return; }
          console.error('[PAB]', msg);
          scriptResults = { ok: 0, fail: 1, total: 1, details: [{ step: 0, type: 'error', error: msg, timestamp: Date.now() }] };
          chrome.storage.local.set({ lastScriptResult: scriptResults }).catch(() => {});
          chrome.action.setBadgeText({ text: 'ERR' });
          chrome.action.setBadgeBackgroundColor({ color: '#FF3B30' });
          setTimeout(() => { chrome.action.setBadgeText({ text: '' }); }, 8000);
          sendResponse({ error: msg });
        }
      })();
      return true;
    }

    // PAB 停止
    case 'pab_stop': {
      if (pabAbortController) { pabAbortController.abort(); pabAbortController = null; }
      chrome.action.setBadgeText({ text: 'STOP' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
      sendResponse({ success: true });
      return true;
    }
  }
});

let scriptResults: { ok: number; fail: number; total: number; details?: any[] } | null = null;
let pabAbortController: AbortController | null = null;

// ---- 缓冲发送（Server 离线时暂存，连上后自动发）----
const PENDING_KEY = 'pending_events';

async function bufferedSend(data: any): Promise<boolean> {
  if (wsClient.connected) {
    wsClient.send(data);
    return true;
  }
  // 离线时存本地
  try {
    const existing = await chrome.storage.local.get(PENDING_KEY);
    const pending = existing[PENDING_KEY] || [];
    pending.push({ data, time: Date.now() });
    await chrome.storage.local.set({ [PENDING_KEY]: pending });
    console.log('[BG] 离线暂存，等待连接后发送');
  } catch {}
  return false;
}

async function flushPending(): Promise<void> {
  if (!wsClient.connected) return;
  try {
    const existing = await chrome.storage.local.get(PENDING_KEY);
    const pending = existing[PENDING_KEY] || [];
    if (pending.length === 0) return;
    const remaining: any[] = [];
    for (const item of pending) {
      if (wsClient.connected) {
        wsClient.send(item.data);
      } else {
        remaining.push(item);
      }
    }
    await chrome.storage.local.set({ [PENDING_KEY]: remaining });
    if (remaining.length < pending.length) console.log('[BG] 已发送 ' + (pending.length - remaining.length) + ' 条暂存数据');
  } catch {}
}

// 连接状态变化时 flush
wsClient.onStatusChange = (connected) => {
  if (connected) flushPending();
};

console.log('[BG] Service Worker 启动');
wsClient.init();
