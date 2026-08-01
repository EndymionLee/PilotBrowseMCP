/**
 * 标签页管理处理器
 */
import type { Router } from '../router.js';
import { listTabs, openTab, closeTab, activateTab } from '../../utils/tab-manager.js';

export function registerTabHandlers(router: Router): void {
  router.register('list_tabs', async (params, respond) => {
    const tabs = await listTabs((params as any)?.query);
    respond({ tabs });
  });

  router.register('open_tab', async (params, respond) => {
    const p = params as { url: string; active?: boolean };
    const tab = await openTab(p.url, p.active ?? true);
    respond({ tab });
  });

  router.register('close_tab', async (params, respond) => {
    await closeTab((params as { id: number }).id);
    respond({ success: true });
  });

  router.register('activate_tab', async (params, respond) => {
    await activateTab((params as { id: number }).id);
    respond({ success: true });
  });

  router.register('navigate_tab', async (params, respond) => {
    const { tabId, url } = params as { tabId: number; url: string };
    await chrome.tabs.update(tabId, { url });
    respond({ success: true, tabId });
  });

  router.register('reload_tab', async (params, respond) => {
    const { tabId } = params as { tabId: number };
    await chrome.tabs.reload(tabId);
    respond({ success: true, tabId });
  });

  router.register('wait_for_load', async (params, respond) => {
    const { tabId, timeout = 15000 } = params as { tabId: number; timeout?: number };
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') { respond({ loaded: true, url: tab.url }); return; }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    respond({ loaded: false, message: `页面 ${timeout}ms 内未加载完成` });
  });

  router.register('get_foreground_setting', async (_params, respond) => {
    try {
      const r = await chrome.storage.local.get('foreground');
      respond({ foreground: r.foreground !== false });
    } catch {
      respond({ foreground: true });
    }
  });
}
