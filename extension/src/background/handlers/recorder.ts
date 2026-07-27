/**
 * 录制管理器
 */
let recording = false;
let currentTabId = 0;

export function isRecording(): boolean { return recording; }
export function resetRec(): void { recording = false; currentTabId = 0; }

export async function startRec(tabId: number): Promise<{ success: boolean; error?: string }> {
  if (recording) return { success: false, error: '已有录制在进行' };
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return { success: false, error: '当前页面不支持录制（请打开一个普通网页）' };
  }
  try {
    await chrome.tabs.sendMessage(tabId, { source: 'browser-mcp-bg', method: 'recording_start' });
    recording = true;
    currentTabId = tabId;
    return { success: true };
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await new Promise((r) => setTimeout(r, 500));
      await chrome.tabs.sendMessage(tabId, { source: 'browser-mcp-bg', method: 'recording_start' });
      recording = true;
      currentTabId = tabId;
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export async function stopRec(allTabs?: number[]): Promise<{
  success: boolean; steps?: any[]; pageUrl?: string; pageTitle?: string; error?: string;
}> {
  if (!recording) return { success: false, error: '没有进行中的录制' };
  recording = false;
  currentTabId = 0;

  const tabsToCollect = allTabs && allTabs.length > 0 ? allTabs : [];
  let allSteps: any[] = [];

  for (const tabId of tabsToCollect) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { source: 'browser-mcp-bg', method: 'recording_stop' }) as any;
      if (result?.steps) allSteps = allSteps.concat(result.steps);
    } catch { /* ignore if tab is closed or not accessible */ }
  }

  // 按时间戳排序（跨标签页录制保持时间顺序）
  allSteps.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return {
    success: true,
    steps: allSteps.map((s: any, i: number) => ({
      step: i + 1, type: s.type, selector: s.selector, text: s.text?.slice(0, 100),
      value: s.value?.slice(0, 100), url: s.url || '',
    })),
  };
}
