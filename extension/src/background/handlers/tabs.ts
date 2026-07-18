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
}
