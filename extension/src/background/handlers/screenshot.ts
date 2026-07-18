/**
 * 截图处理器
 */
import type { Router } from '../router.js';
import { permissionStore } from '../permissions.js';

export function registerScreenshotHandlers(router: Router): void {
  router.register('screenshot', async (params, respond) => {
    if (!(await permissionStore.isGranted('screenshot'))) {
      respond(undefined, {
        code: -100,
        message: '截图功能需要授权，请在扩展弹窗中点击"授权"按钮',
      });
      return;
    }

    const p = params as { tabId?: number; format?: string; quality?: number };
    const fmt = p.format === 'jpeg' ? 'jpeg' : 'png';

    let dataUrl: string;

    if (p.tabId) {
      const tab = await chrome.tabs.get(p.tabId);
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: fmt, quality: p.quality } as any);
    } else {
      dataUrl = await chrome.tabs.captureVisibleTab(null as unknown as number, { format: fmt, quality: p.quality } as any);
    }

    const base64 = dataUrl.split(',')[1] ?? dataUrl;
    respond({
      data: base64,
      mimeType: fmt === 'jpeg' ? 'image/jpeg' : 'image/png',
    });
  });
}
