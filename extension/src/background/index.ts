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
import { startRec, stopRec, isRecording, resetRec } from './handlers/recorder.js';

const WS_URL = 'ws://localhost:9456';
const wsClient = new WsClient(WS_URL);
const router = new Router();

registerTabHandlers(router);
registerContentHandlers(router);
registerDomHandlers(router);
registerNetworkHandlers(router, wsClient);
registerCookieHandlers(router);
registerScreenshotHandlers(router);
registerPermissionHandlers(router);

chrome.tabs.onCreated.addListener(() => notifyTabs());
chrome.tabs.onRemoved.addListener(() => notifyTabs());
chrome.tabs.onUpdated.addListener(() => notifyTabs());
chrome.tabs.onActivated.addListener(() => notifyTabs());

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
        startRec(tabs[0]?.id || 0).then(sendResponse);
      });
      return true;
    }

    case 'recording_stop': {
      stopRec().then((result) => sendResponse(result));
      return true;
    }

    case 'recording_status':
      sendResponse({ recording: isRecording() });
      return true;

    case 'recording_reset':
      resetRec();
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
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'browser-mcp-keepalive') wsClient.onAlarm();
});

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
