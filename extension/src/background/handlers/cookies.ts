/**
 * Cookie 处理器
 */
import type { Router } from '../router.js';
import { permissionStore } from '../permissions.js';

export function registerCookieHandlers(router: Router): void {
  router.register('get_cookies', async (params, respond) => {
    // 权限检查
    if (!(await permissionStore.isGranted('cookies'))) {
      respond(undefined, {
        code: -100,
        message: '读取 Cookie 需要授权，请在扩展弹窗中点击"授权"按钮允许当前会话使用 Cookie 功能',
      });
      return;
    }

    const p = params as { tabId?: number; domain?: string };
    let domain = p.domain;

    if (!domain && p.tabId) {
      const tab = await chrome.tabs.get(p.tabId);
      if (tab.url) {
        try { domain = new URL(tab.url).hostname; } catch { /* ignore */ }
      }
    }

    const cookies = await chrome.cookies.getAll({ domain: domain ?? undefined });
    respond({
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      })),
    });
  });
}
