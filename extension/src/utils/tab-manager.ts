/**
 * Tab 管理工具
 */
export async function listTabs(query?: string): Promise<
  Array<{ id: number; url: string; title: string; active: boolean }>
> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => {
      if (!tab.id || !tab.url) return false;
      if (query) {
        const q = query.toLowerCase();
        const urlMatch = tab.url.toLowerCase().includes(q);
        const titleMatch = (tab.title ?? '').toLowerCase().includes(q);
        return urlMatch || titleMatch;
      }
      return true;
    })
    .map((tab) => ({
      id: tab.id!,
      url: tab.url ?? '',
      title: tab.title ?? '',
      active: tab.active ?? false,
    }));
}

export async function openTab(
  url: string,
  active = true,
): Promise<{ id: number; url: string; title: string; active: boolean }> {
  const tab = await chrome.tabs.create({ url, active });
  return {
    id: tab.id!,
    url: tab.url ?? '',
    title: tab.title ?? '',
    active: tab.active ?? false,
  };
}

export async function closeTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId);
}

export async function activateTab(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update((await chrome.tabs.get(tabId)).windowId!, {
    focused: true,
  });
}
