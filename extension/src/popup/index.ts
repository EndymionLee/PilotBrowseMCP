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
    lblFooter: _('footer'),
    lblScripts: _('sectionScripts'),
  };
  for (const [id, text] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  const pickDesc = document.getElementById('pickDesc') as HTMLInputElement | null;
  if (pickDesc) pickDesc.placeholder = _('pickDescPlaceholder');
  const pickBtn = document.getElementById('pickBtn');
  if (pickBtn) pickBtn.textContent = _('pickBtn');
  const scriptAddEl = document.getElementById('scriptAddBtn');
  if (scriptAddEl) scriptAddEl.textContent = _('scriptAddBtn');
  const pickSendBtn = document.getElementById('pickSendBtn');
  if (pickSendBtn) pickSendBtn.textContent = _('pickSendBtn');
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
const permsList = $('permsList');
const themeBtn = $('themeBtn');
const recBtn = $('recBtn'); const recDot = $('recDot'); const recStatus = $('recStatus');
const recCount = $('recCount'); const recSteps = $('recSteps');
const pickBtn = $('pickBtn'); const pickResult = $('pickResult');
const pickInfo = $('pickInfo');
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
      pickResult.style.display = 'block';
      // 自动保存
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const desc = el.tag + (el.selector ? ' ' + el.selector : '') + (el.text ? ' "' + el.text.slice(0, 40) + '"' : '');
      bgSend({ type: 'save_element', description: desc, selector: el.selector || '', url: tabs[0]?.url || '' });
    }
  } catch {}
}

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
      recDot.className = 'rec-dot'; recStatus.textContent = '请让Agent接收';
      recCount.textContent = _('recStepCount').replace('$1', String(resp.steps?.length || 0));
      if (resp.steps?.length) {
        // 提取域名用于显示
        const siteDomain = resp.steps.find((s: any) => s.url)?.url || '';
        const siteShort = (() => { try { return new URL(siteDomain).hostname.replace('www.', ''); } catch { return ''; } })();
        recSteps.innerHTML = resp.steps.map((s: any) =>
          '<div class="rec-step"><span class="s-type">' + s.type + '</span>' +
          (s.selector || s.value || '') +
          (s.url ? '<span style="font-size:9px;color:var(--text-muted);margin-left:6px;">' +
            (() => { try { const u = new URL(s.url); return u.hostname.replace('www.', '') + (u.pathname !== '/' ? u.pathname.slice(0, 30) : ''); } catch { return ''; } })() + '</span>' : '') +
          '</div>'
        ).join('');
        // 显示页面标识
        if (siteShort) {
          const paths = [...new Set(resp.steps.map((s: any) => { try { return new URL(s.url).pathname; } catch { return ''; } }).filter(Boolean))];
          recCount.textContent = siteShort + (paths.length > 1 ? ' (' + paths.length + ' pages)' : (paths[0] && paths[0] !== '/' ? paths[0].slice(0, 25) : ''));
        }
      }
      // 自动保存录制
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      bgSend({ type: 'save_workflow', description: 'Recording ' + Date.now(), url: tabs[0]?.url || '', steps: resp.steps || [] });
    }
  }
});

// ==== Script Library ====
interface SavedScript { id: string; name: string; data: string; steps: number; addedAt: number; pinned?: boolean; pinnedAt?: number; }
const SCRIPT_KEY = 'saved_scripts';
const scriptAddBtn = $('scriptAddBtn');
const scriptList = $('scriptList');
const scriptMoreWrap = $('scriptMoreWrap');
const scriptMoreBtn = $('scriptMoreBtn');
const SHOW_COUNT = 5;
let scriptRunners = new Map<string, boolean>();
let scriptShowAll = false;

async function loadScripts(): Promise<SavedScript[]> {
  try { const r = await chrome.storage.local.get(SCRIPT_KEY); return r[SCRIPT_KEY] || []; } catch { return []; }
}
async function saveScripts(s: SavedScript[]): Promise<void> { await chrome.storage.local.set({ [SCRIPT_KEY]: s }); }

scriptMoreBtn.addEventListener('click', () => { scriptShowAll = !scriptShowAll; renderScriptList(); });

function renderScriptList() {
  loadScripts().then((scripts) => {
    // 置顶按置顶时间排，其余按添加时间倒序
    const sorted = [...scripts].sort((a, b) => {
      if (a.pinned && b.pinned) return (a.pinnedAt || 0) - (b.pinnedAt || 0);
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.addedAt || 0) - (a.addedAt || 0);
    });
    const showCount = scriptShowAll ? sorted.length : SHOW_COUNT;
    const visible = sorted.slice(0, showCount);
    if (sorted.length === 0) { scriptList.innerHTML = '<div class="tabs-empty"><div style="font-size:11px;">' + _('scriptNoScripts') + '</div></div>'; scriptMoreWrap.style.display = 'none'; return; }
    scriptList.innerHTML = visible.map((s) => {
      const running = scriptRunners.get(s.id) || false;
      return '<div class="perm-item">' +
        '<div class="perm-info" style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:500;">' + s.name + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);">' + (running ? _('scriptRunning') : 'PAB ' + s.steps + ' stmts') + '</div></div>' +
        '<div style="display:flex;gap:2px;">' +
        '<button class="btn-icon script-btn-run" data-id="' + s.id + '" style="font-size:11px;width:22px;height:22px;" title="Run">' + (running ? '&#x23F9;' : '&#x25B6;') + '</button>' +
        '<button class="btn-icon script-btn-pin" data-id="' + s.id + '" style="font-size:11px;width:22px;height:22px;' + (s.pinned ? 'color:#FF9800;' : '') + '" title="' + (s.pinned ? 'Unpin' : 'Pin') + '">' + (s.pinned ? '&#x2605;' : '&#x2606;') + '</button>' +
        '<button class="btn-icon script-btn-log" data-id="' + s.id + '" style="font-size:11px;width:22px;height:22px;" title="View log">&#x1F4CB;</button>' +
        '<button class="btn-icon script-btn-rename" data-id="' + s.id + '" style="font-size:11px;width:22px;height:22px;" title="Rename">&#x270E;</button>' +
        '<button class="btn-icon script-btn-del" data-id="' + s.id + '" style="font-size:11px;width:22px;height:22px;color:var(--red);" title="Delete">&#x2715;</button>' +
        '</div></div>';
    }).join('');
    scriptMoreWrap.style.display = sorted.length > SHOW_COUNT ? '' : 'none';
    scriptMoreBtn.textContent = scriptShowAll ? _('scriptShowLess') + ' (' + sorted.length + ')' : _('scriptShowAll') + ' (' + sorted.length + ')';
    // 事件绑定
    scriptList.querySelectorAll('.script-btn-run').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (el as HTMLElement).dataset.id || '';
        // 停止运行
        if (scriptRunners.get(id)) {
          await bgSend({ type: 'pab_stop' });
          scriptRunners.set(id, false); renderScriptList();
          return;
        }
        // 开始运行
        const scripts = await loadScripts();
        const s = scripts.find(x => x.id === id);
        if (!s) return;
        scriptRunners.set(id, true); renderScriptList();
        const resp = await bgSend({ type: 'pab_run', code: s.data });
        scriptRunners.set(id, false); renderScriptList();
      });
    });
    scriptList.querySelectorAll('.script-btn-log').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sr = await bgSend({ type: 'script_status' });
        const content = $('logContent');
        const overlay = $('logOverlay');
        if (!sr || !sr.details?.length) {
          content.textContent = 'No execution log';
          overlay.style.display = '';
          return;
        }
        const lines = sr.details.map((d: any) => {
          const icon = d.error ? '❌' : (d.status === 'fail' ? '❌' : '✅');
          return icon + ' ' + (d.method || d.tool || '') + (d.error ? '\n   ' + d.error : '');
        }).join('\n');
        content.textContent = lines;
        overlay.style.display = '';
      });
    });
    $('logCloseBtn').addEventListener('click', () => { $('logOverlay').style.display = 'none'; });
    $('logOverlay').addEventListener('click', (e) => { if (e.target === $('logOverlay')) $('logOverlay').style.display = 'none'; });
    scriptList.querySelectorAll('.script-btn-rename').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (el as HTMLElement).dataset.id || '';
        const scripts = await loadScripts();
        const s = scripts.find(x => x.id === id);
        if (!s) return;
        const name = prompt(_('scriptRename'), s.name);
        if (name && name.trim()) { s.name = name.trim(); await saveScripts(scripts); renderScriptList(); }
      });
    });
    scriptList.querySelectorAll('.script-btn-pin').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (el as HTMLElement).dataset.id || '';
        const scripts = await loadScripts();
        const s = scripts.find(x => x.id === id);
        if (!s) return;
        s.pinned = !s.pinned;
        s.pinnedAt = s.pinned ? Date.now() : undefined;
        await saveScripts(scripts);
        renderScriptList();
      });
    });
    scriptList.querySelectorAll('.script-btn-del').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (el as HTMLElement).dataset.id || '';
        await saveScripts((await loadScripts()).filter(x => x.id !== id));
        renderScriptList();
      });
    });
  });
}

scriptAddBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.pab';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const lineCount = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;
      const scripts = await loadScripts();
      scripts.push({ id: Date.now().toString(36), name: file.name.replace(/\.pab$/, ''), data: text, steps: lineCount, addedAt: Date.now(), type: 'pab' });
      await saveScripts(scripts);
      renderScriptList();
    } catch {}
  };
  input.click();
});

// ==== Init ====
async function init(): Promise<void> {
  applyI18n();
  // 显示上次结果后立即清除
  try {
    const sr = await bgSend({ type: 'script_status' });
    if (sr && sr.total > 0) {
      chrome.action.setBadgeText({ text: sr.fail > 0 ? 'ERR' : 'OK' });
      chrome.action.setBadgeBackgroundColor({ color: sr.fail > 0 ? '#FF3B30' : '#30B94E' });
    }
    bgSend({ type: 'script_clear' }); // 清 storage + badge
  } catch {}
  renderScriptList();
  try { const resp = await bgSend({ type: 'ping' }); updateStatus(resp?.status === 'connected'); } catch { updateStatus(false); }
  try {
    const resp = await bgSend({ type: 'recording_status' });
    if (resp?.recording) {
      recording = true;
      recBtn.textContent = _('recBtnStop'); recBtn.className = 'rec-btn stop';
      recDot.className = 'rec-dot on'; recStatus.textContent = _('recRecording');
    }
  } catch {}
  await Promise.all([updatePermissions(), checkPickResult()]);
}

const LANG = await getSavedLang();
currentLang = LANG;
localeData = await loadLang(LANG);
langSelect.value = LANG;
PERM_META = buildPermMeta();

await loadTheme();
init();
if (updateTimer) clearInterval(updateTimer);
updateTimer = setInterval(init, 3000);
