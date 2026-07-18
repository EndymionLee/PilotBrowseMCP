/**
 * Popup script
 */

type PermissionAction = 'cookies' | 'local_storage' | 'screenshot' | 'get_html';
type LocaleData = Record<string, { message: string }>;

let localeData: LocaleData | null = null;
let currentLang = 'en';

// 加载语言文件
async function loadLang(lang: string): Promise<LocaleData> {
  // 尝试精确匹配，然后尝试主语言，最后 fallback 英文
  const tries = [lang, lang.split('_')[0], 'en'];
  for (const l of tries) {
    try {
      const resp = await fetch(chrome.runtime.getURL(`_locales/${l}/messages.json`));
      if (resp.ok) return await resp.json();
    } catch {}
  }
  return {};
}

function _(key: string, ...args: string[]): string {
  const msg = localeData?.[key]?.message;
  if (!msg) return key;
  return args.reduce((s, a, i) => s.replace(`$${i + 1}`, a), msg);
}

// 保存语言偏好
async function saveLang(lang: string): Promise<void> {
  await chrome.storage.local.set({ lang });
}

async function getSavedLang(): Promise<string> {
  try {
    const data = await chrome.storage.local.get('lang');
    if (data.lang) return data.lang;
    const uiLang = (chrome.i18n.getUILanguage?.() || 'en').replace('-', '_');
    // 处理 zh → zh_CN 等简写
    const langMap: Record<string, string> = { zh: 'zh_CN', ko: 'ko', ja: 'ja', en: 'en' };
    return langMap[uiLang] || langMap[uiLang.split('_')[0]] || 'en';
  } catch { return 'en'; }
}

// 应用多语言
function applyI18n(): void {
  const map: Record<string, string> = {
    lblAppName: _('appName'),
    lblPermissions: _('sectionPermissions'),
    lblPermLoading: _('loading'),
    lblPick: _('sectionPick'),
    lblRec: _('sectionRec'),
    lblTabs: _('sectionTabs'),
    lblTabLoading: _('loading'),
    lblFooter: _('footer'),
  };
  for (const [id, text] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  const pickDesc = document.getElementById('pickDesc') as HTMLInputElement | null;
  if (pickDesc) pickDesc.placeholder = _('pickDescPlaceholder');
  const wfDesc = document.getElementById('wfDesc') as HTMLTextAreaElement | null;
  if (wfDesc) wfDesc.placeholder = _('wfDescPlaceholder');
  const pickBtn = document.getElementById('pickBtn');
  if (pickBtn) pickBtn.textContent = _('pickBtn');
  const pickSendBtn = document.getElementById('pickSendBtn');
  if (pickSendBtn) pickSendBtn.textContent = _('pickSendBtn');
  const wfSaveBtn = document.getElementById('wfSaveBtn');
  if (wfSaveBtn) wfSaveBtn.textContent = _('wfSaveBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.title = _('refreshBtn');
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.title = _('themeSwitch');
  const statusDetail = document.getElementById('statusDetail');
  if (statusDetail) statusDetail.textContent = _('statusPort');
  // 按钮（用现有模块级引用避免重复声明）
  const recEl = document.getElementById('recBtn');
  if (recEl && !recording) recEl.textContent = _('recBtn');
  const pickEl = document.getElementById('pickBtn');
  if (pickEl) pickEl.textContent = _('pickBtn');
  const sendEl = document.getElementById('pickSendBtn');
  if (sendEl) sendEl.textContent = _('pickSendBtn');
  const saveEl = document.getElementById('wfSaveBtn');
  if (saveEl) saveEl.textContent = _('wfSaveBtn');
}

type PermMeta = { label: string; desc: string; icon: string; iconClass: string };
function buildPermMeta(): Record<PermissionAction, PermMeta> {
  return {
    cookies:      { label: _('permCookies'), desc: _('permCookiesDesc'), icon: '\u{1F36A}', iconClass: 'cookies' },
    local_storage: { label: _('permStorage'), desc: _('permStorageDesc'), icon: '\u{1F4BE}', iconClass: 'storage' },
    screenshot:   { label: _('permScreenshot'), desc: _('permScreenshotDesc'), icon: '\u{1F4F7}', iconClass: 'screenshot' },
    get_html:     { label: _('permHtml'), desc: _('permHtmlDesc'), icon: '\u{1F50D}', iconClass: 'html' },
  };
}

const $ = (id: string) => document.getElementById(id)!;
let permVisible = false;

// 权限折叠
document.getElementById('permHeader')?.addEventListener('click', () => {
  permVisible = !permVisible;
  const body = document.getElementById('permBody');
  const arrow = document.getElementById('permArrow');
  if (body) body.style.display = permVisible ? '' : 'none';
  if (arrow) arrow.textContent = permVisible ? '▼' : '▶';
  if (permVisible) updatePermissions();
});
const statusDot = $('statusDot'); const statusPulse = $('statusPulse'); const statusText = $('statusText');
const tabsList = $('tabsList'); const permsList = $('permsList'); const refreshBtn = $('refreshBtn');
const themeBtn = $('themeBtn');
const recBtn = $('recBtn'); const recDot = $('recDot'); const recStatus = $('recStatus');
const recCount = $('recCount'); const recSteps = $('recSteps');
const wfDesc = $('wfDesc') as HTMLTextAreaElement;
const wfSaveBtn = $('wfSaveBtn'); const wfStatus = $('wfStatus');
const pickBtn = $('pickBtn'); const pickResult = $('pickResult');
const pickInfo = $('pickInfo'); const pickDesc = $('pickDesc') as HTMLInputElement;
const pickSendBtn = $('pickSendBtn');
const langSelect = $('langSelect') as HTMLSelectElement;

let updateTimer: ReturnType<typeof setInterval> | null = null;
let recording = false; let lastRecording: any = null;
let PERM_META = buildPermMeta();

async function bgSend(msg: any): Promise<any> {
  try { return await chrome.runtime.sendMessage({ source: 'browser-mcp-popup', ...msg }); } catch { return null; }
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
}
async function loadTheme(): Promise<'light' | 'dark'> {
  try { const r = await chrome.storage.local.get('theme'); const t = r.theme ?? getSystemTheme(); applyTheme(t); return t; }
  catch { const t = getSystemTheme(); applyTheme(t); return t; }
}
async function toggleTheme(): Promise<void> {
  const isDark = document.documentElement.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark'; applyTheme(newTheme);
  try { await chrome.storage.local.set({ theme: newTheme }); } catch {}
}
themeBtn.addEventListener('click', toggleTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  try { const { theme } = await chrome.storage.local.get('theme'); if (!theme) applyTheme(getSystemTheme()); } catch {}
});

// 语言切换
langSelect.addEventListener('change', async () => {
  const lang = langSelect.value;
  await saveLang(lang);
  // 重新加载语言并刷新 UI
  localeData = await loadLang(lang);
  currentLang = lang;
  PERM_META = buildPermMeta();
  applyI18n();
  // 重新渲染权限（因为 label 变了）
  await updatePermissions();
  await updateTabs();
  updateStatus(statusText.textContent === _('connected'));
});

// 关闭 Server
document.getElementById('shutdownBtn')?.addEventListener('click', async () => {
  await bgSend({ type: 'shutdown_server' });
  const detail = document.getElementById('statusDetail');
  if (detail) detail.textContent = _('shutdown');
  setTimeout(() => window.close(), 500);
});

function updateStatus(connected: boolean): void {
  statusDot.className = 'dot ' + (connected ? 'connected' : 'disconnected');
  statusPulse.className = 'pulse ' + (connected ? 'connected' : '');
  statusText.className = 'status-text ' + (connected ? 'connected' : 'disconnected');
  statusText.textContent = connected ? _('connected') : _('disconnected');
}

async function updatePermissions(): Promise<void> {
  try {
    const resp = await bgSend({ type: 'get_permissions' });
    const granted: PermissionAction[] = resp?.granted ?? [];
    const all: PermissionAction[] = resp?.all ?? [];
    if (all.length === 0) { permsList.innerHTML = '<div class="tabs-empty"><div style="font-size:11px;">' + _('noPermissions') + '</div></div>'; return; }
    permsList.innerHTML = all.map((action) => {
      const meta = PERM_META[action]; const isGranted = granted.includes(action);
      return '<div class="perm-item"><div class="perm-info"><div class="perm-icon ' + meta.iconClass + '">' + meta.icon + '</div><div><div class="perm-label">' + meta.label + '</div><div class="perm-desc">' + meta.desc + '</div></div></div><label class="switch"><input type="checkbox" ' + (isGranted ? 'checked' : '') + ' data-action="' + action + '" /><span class="slider"></span></label></div>';
    }).join('');
    permsList.querySelectorAll('.switch input').forEach((el) => {
      el.addEventListener('change', async (e) => {
        const input = e.target as HTMLInputElement; const action = input.dataset.action! as PermissionAction;
        if (input.checked) await bgSend({ type: 'grant_permission', action }); else await bgSend({ type: 'revoke_permission', action });
      });
    });
  } catch { permsList.innerHTML = '<div class="tabs-empty"><div style="font-size:11px;color:var(--red);">' + _('permissionsFailed') + '</div></div>'; }
}

// ==== Pick ====
pickBtn.addEventListener('click', async () => {
  pickBtn.textContent = _('pickBtnWaiting'); pickBtn.disabled = true;
  await bgSend({ type: 'pick_element' });
  setTimeout(() => window.close(), 800);
});

async function checkPickResult(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(['pick_result', 'pick_time']);
    if (data.pick_result && data.pick_time && Date.now() - data.pick_time < 120000) {
      const el = data.pick_result;
      chrome.storage.local.remove(['pick_result', 'pick_time']);
      pickInfo.textContent = '<' + el.tag + '> ' + (el.selector || '') + (el.text ? ' "' + el.text.slice(0, 40) + '"' : '');
      pickDesc.value = ''; pickResult.style.display = 'block';
      pickResult.dataset.selector = el.selector || '';
    }
  } catch {}
}

pickSendBtn.addEventListener('click', async () => {
  const desc = pickDesc.value.trim();
  if (!desc) return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const resp = await bgSend({ type: 'save_element', description: desc, selector: pickResult.dataset.selector, url: tabs[0]?.url || '' });
  pickResult.style.display = 'none'; pickDesc.value = '';
  if (resp?.message) pickDesc.placeholder = resp.message;
});

// ==== Recording ====
recBtn.addEventListener('click', async () => {
  if (!recording) {
    let resp: any; try { resp = await bgSend({ type: 'recording_start' }); } catch { return; }
    if (resp?.success) {
      recording = true; lastRecording = null;
      recBtn.textContent = _('recBtnStop'); recBtn.className = 'rec-btn stop';
      recDot.className = 'rec-dot on'; recStatus.textContent = _('recRecording');
      window.close();
    } else if (resp?.error?.includes('已有录制')) {
      await bgSend({ type: 'recording_reset' });
      recStatus.textContent = _('resetRetry');
    } else {
      recStatus.textContent = _('statusFailed') + ': ' + (resp?.error || _('unknownError'));
    }
  } else {
    const resp = await bgSend({ type: 'recording_stop' });
    if (resp?.success) {
      recording = false; lastRecording = resp;
      recBtn.textContent = _('recBtn'); recBtn.className = 'rec-btn go';
      recDot.className = 'rec-dot'; recStatus.textContent = _('recStopped');
      recCount.textContent = _('recStepCount').replace('$1', String(resp.steps?.length || 0));
      if (resp.steps?.length) {
        recSteps.innerHTML = resp.steps.map((s: any) => '<div class="rec-step"><span class="s-type">' + s.type + '</span>' + (s.selector || s.value || '') + '</div>').join('');
      }
    }
  }
});

// ==== Workflow ====
wfSaveBtn.addEventListener('click', async () => {
  const description = wfDesc.value.trim();
  if (!description) { wfStatus.textContent = _('wfNoDesc'); return; }
  wfSaveBtn.disabled = true; wfStatus.textContent = _('wfSaving');
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const resp = await bgSend({ type: 'save_workflow', description, url: tabs[0]?.url || '', steps: lastRecording?.steps || [] });
    wfStatus.textContent = resp?.message || _('wfSaved'); wfDesc.value = ''; recSteps.innerHTML = '';
    lastRecording = null; recCount.textContent = '';
  } catch { wfStatus.textContent = _('wfFailed'); }
  finally { wfSaveBtn.disabled = false; }
});

// ==== Tabs ====
async function updateTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const visible = tabs.filter((t) => t.id && t.url && !t.url.startsWith('chrome://'));
    if (visible.length === 0) { tabsList.innerHTML = '<div class="tabs-empty"><div class="icon">▢</div><div>' + _('noTabs') + '</div></div>'; return; }
    tabsList.innerHTML = visible.map((t) => {
      const domain = (() => { try { return new URL(t.url!).hostname; } catch { return ''; } })();
      return '<div class="tab-item ' + (t.active ? 'active' : '') + '" data-id="' + t.id + '"><div class="tab-favicon">' + ((t.title ?? '?').charAt(0).toUpperCase()) + '</div><div class="tab-info"><div class="title">' + (t.title || _('untitled')) + '</div><div class="url">' + t.url + '</div></div>' + (domain ? '<span class="tab-count">' + domain.replace(/^www\./, '') + '</span>' : '') + '</div>';
    }).join('');
    tabsList.querySelectorAll('.tab-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = parseInt((el as HTMLElement).dataset.id ?? '0');
        if (id) { await chrome.tabs.update(id, { active: true }); const tab = await chrome.tabs.get(id); await chrome.windows.update(tab.windowId!, { focused: true }); }
      });
    });
  } catch { tabsList.innerHTML = '<div class="tabs-empty"><div class="icon">!</div><div>' + _('loadFailed') + '</div></div>'; }
}

// ==== Init ====
async function init(): Promise<void> {
  applyI18n();
  try { const resp = await bgSend({ type: 'ping' }); updateStatus(resp?.status === 'connected'); } catch { updateStatus(false); }
  try {
    const resp = await bgSend({ type: 'recording_status' });
    if (resp?.recording) {
      recording = true;
      recBtn.textContent = _('recBtnStop'); recBtn.className = 'rec-btn stop';
      recDot.className = 'rec-dot on'; recStatus.textContent = _('recRecording');
    }
  } catch {}
  await Promise.all([updatePermissions(), updateTabs(), checkPickResult()]);
}

refreshBtn.addEventListener('click', updateTabs);

const LANG = await getSavedLang();
currentLang = LANG;
localeData = await loadLang(LANG);
langSelect.value = LANG;
PERM_META = buildPermMeta();

await loadTheme();
init();
if (updateTimer) clearInterval(updateTimer);
updateTimer = setInterval(init, 3000);
