/**
 * 录制管理器
 *
 * 用 executeScript 直接注入录制脚本到页面，不走消息传递（解决时机问题）
 */
let recording = false;
let currentTabId = 0;

export function isRecording(): boolean { return recording; }
export function resetRec(): void { recording = false; currentTabId = 0; }

export async function startRec(tabId: number): Promise<{ success: boolean; error?: string }> {
  if (recording) return { success: false, error: '已有录制在进行' };

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.__mcp_recording = true;
        window.__mcp_rec_steps = [];

        // 录制指示器（可拖动）
        const badge = document.createElement('div');
        badge.id = '__mcp_rec_badge';
        badge.style.cssText = 'position:fixed;top:10px;left:10px;z-index:2147483647;background:#e0352b;color:#fff;padding:6px 14px;border-radius:24px;font:13px/1.4 sans-serif;cursor:move;box-shadow:0 2px 12px rgba(0,0,0,0.35);display:flex;align-items:center;gap:6px;user-select:none;';
        badge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#fff;animation:__mcp_pulse 1.2s infinite;"></span><span>录制中 <span id="__mcp_rec_count">0</span></span>';

        // 拖动功能
        let mx = 0, my = 0;
        badge.addEventListener('mousedown', (e) => {
          mx = e.clientX - badge.offsetLeft;
          my = e.clientY - badge.offsetTop;
          const onMove = (ev: MouseEvent) => {
            badge.style.left = (ev.clientX - mx) + 'px';
            badge.style.top = (ev.clientY - my) + 'px';
            badge.style.right = 'auto';
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', () => document.removeEventListener('mousemove', onMove), { once: true });
        });
        const style = document.createElement('style');
        style.id = '__mcp_rec_style';
        style.textContent = '@keyframes __mcp_pulse { 50% { opacity:0.3; transform:scale(0.8); } }';
        document.head.appendChild(style);
        document.body.appendChild(badge);

        function flashEl(el: any) {
          const orig = el.style.outline;
          el.style.outline = '2px solid #ff6b35';
          el.style.outlineOffset = '-2px';
          setTimeout(() => { el.style.outline = orig; }, 400);
        }

        function updateCount() {
          const c = document.getElementById('__mcp_rec_count');
          if (c) c.textContent = String(window.__mcp_rec_steps.length);
        }

        function genSel(el: any): string {
          if (!el || !el.tagName) return '';
          if (el.id) return '#' + el.id;
          let sel = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (cls) sel += '.' + cls;
          }
          return sel;
        }

        function dedup(type: string, sel: string): boolean {
          const steps = window.__mcp_rec_steps;
          if (steps.length === 0) return false;
          const last = steps[steps.length - 1];
          return last.type === type && last.selector === sel && (Date.now() - last.timestamp) < 600;
        }

        document.addEventListener('click', (e) => {
          if (!window.__mcp_recording) return;
          const el = e.target as HTMLElement;
          // 排除录制指示器本身的点击
          if (el?.id === '__mcp_rec_badge' || (el as HTMLElement)?.closest?.('#__mcp_rec_badge')) return;
          const sel = genSel(el);
          if (dedup('click', sel)) return;
          window.__mcp_rec_steps.push({
            type: 'click', selector: sel, text: el.textContent?.trim().slice(0, 80),
            url: location.href, timestamp: Date.now(),
          });
          flashEl(el);
          updateCount();
        }, true);

        document.addEventListener('change', (e) => {
          if (!window.__mcp_recording) return;
          const el = e.target as HTMLInputElement;
          const sel = genSel(el);
          if (dedup('type', sel)) return;
          window.__mcp_rec_steps.push({
            type: 'type', selector: sel, value: el.value?.slice(0, 200),
            url: location.href, timestamp: Date.now(),
          });
          flashEl(el);
          updateCount();
        }, true);
      },
    });

    recording = true;
    currentTabId = tabId;
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function stopRec(): Promise<{
  success: boolean; steps?: any[]; pageUrl?: string; pageTitle?: string; error?: string;
}> {
  if (!recording) return { success: false, error: '没有进行中的录制' };

  const tabId = currentTabId;
  let steps: any[] = [];

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.__mcp_recording = false;
        const s = window.__mcp_rec_steps || [];
        window.__mcp_rec_steps = [];
        // 清理指示器
        const b = document.getElementById('__mcp_rec_badge');
        if (b) b.remove();
        const st = document.getElementById('__mcp_rec_style');
        if (st) st.remove();
        return { steps: s, url: location.href, title: document.title };
      },
    });

    const data = results[0]?.result;
    if (data) {
      steps = data.steps || [];
    }
  } catch { /* ignore */ }

  recording = false;
  currentTabId = 0;

  return {
    success: true,
    steps: steps.map((s: any, i: number) => ({
      step: i + 1, type: s.type, selector: s.selector,
      text: s.text?.slice(0, 100), value: s.value?.slice(0, 100),
    })),
  };
}
