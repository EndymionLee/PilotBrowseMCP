/**
 * Content Script - 注入到页面中执行
 *
 * 职责:
 * 1. 监听来自 Background 的消息
 * 2. 执行 DOM 操作（查询、点击、输入、滚动）
 * 3. 提取页面内容（Markdown、文章、表格等）
 * 4. MutationObserver 监听 DOM 变化
 */
import {
  extractMarkdown,
  extractText,
  extractArticle,
  extractTable,
  extractLinks,
  extractImages,
} from './utils/content-extractor.js';

// === DOM 查询（支持 Shadow DOM）=====
/** 递归查询所有匹配选择器的元素（穿透 shadow root） */
function queryAllDeep(selector: string, root: Document | ShadowRoot = document): Element[] {
  let results = Array.from(root.querySelectorAll(selector));
  // 查找所有带有 shadow root 的元素，递归查询
  const hosts = root.querySelectorAll('*');
  for (const host of hosts) {
    const shadow = (host as Element).shadowRoot;
    if (shadow) results = results.concat(queryAllDeep(selector, shadow));
  }
  return results;
}

function queryDOM(selector: string): Array<{
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  attributes: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
}> {
  const elements = queryAllDeep(selector);
  const results: Array<{
    tag: string;
    id?: string;
    className?: string;
    text?: string;
    attributes: Record<string, string>;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }> = [];

  elements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const attrs: Record<string, string> = {};
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      attrs[attr.name] = attr.value;
    }

    results.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: (el as HTMLElement).className?.toString() || undefined,
      text: (el.textContent ?? '').trim().slice(0, 200) || undefined,
      attributes: attrs,
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    });
  });

  return results;
}

// === Shadow DOM 穿透选择器 ====
function querySelectorDeep(selector: string, root: Document | ShadowRoot = document): HTMLElement | null {
  // 先在当前根查询
  let el = root.querySelector(selector);
  if (el) return el as HTMLElement;
  // 遍历 shadow roots 递归查询
  const hosts = root.querySelectorAll('*');
  for (const host of hosts) {
    const shadow = (host as Element).shadowRoot;
    if (shadow) {
      el = querySelectorDeep(selector, shadow);
      if (el) return el as HTMLElement;
    }
  }
  return null;
}

// === XPath 查询（获取匹配节点的文本内容）=====
function queryXPath(xpath: string): { text: string; nodes: number } {
  let text = '';
  let count = 0;

  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i) as Node;
      if (node) {
        const t = node.textContent?.trim();
        if (t) {
          text += t + '\n';
          count++;
        }
      }
    }
  } catch (err) {
    throw new Error(`XPath 无效: ${(err as Error).message}`);
  }

  return { text: text.trim(), nodes: count };
}

// === 语义查找（按文字/角色找元素） ======
function findElements(query: {
  text?: string;
  role?: string;
  type?: string;
  tag?: string;
}): Array<{
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  selector: string;
  attributes: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
  matchType: string;
}> {
  const { text, role, type, tag } = query;
  const results: Array<any> = [];

  // 递归收集元素（支持 shadow DOM）
  function collectElements(root: Element | Document): Element[] {
    const base = tag
      ? Array.from(root.querySelectorAll(tag))
      : Array.from(root.querySelectorAll('a, button, input, textarea, select, [role], [aria-label], [onclick]'));
    // 遍历 shadow roots
    const all = root.querySelectorAll('*');
    for (const el of all) {
      const shadow = (el as Element).shadowRoot;
      if (shadow) base.push(...collectElements(shadow));
    }
    return base;
  }

  const allElements = collectElements(document);

  for (const el of allElements) {
    const htmlEl = el as HTMLElement;
    let matchType = '';
    let matched = false;

    // 按 role 匹配
    if (role) {
      const elRole = htmlEl.getAttribute('role') || '';
      if (elRole === role) { matchType = 'role'; matched = true; }
    }

    // 按 aria-label 匹配
    if (!matched && text) {
      const ariaLabel = htmlEl.getAttribute('aria-label') || '';
      if (ariaLabel.toLowerCase().includes(text.toLowerCase())) {
        matchType = 'aria-label'; matched = true;
      }
    }

    // 按可见文本匹配
    if (!matched && text) {
      const visibleText = (htmlEl.textContent || '').trim();
      if (visibleText.toLowerCase().includes(text.toLowerCase())) {
        matchType = 'text'; matched = true;
      }
    }

    // 按 placeholder 匹配
    if (!matched && text) {
      const placeholder = (htmlEl as HTMLInputElement).placeholder || '';
      if (placeholder.toLowerCase().includes(text.toLowerCase())) {
        matchType = 'placeholder'; matched = true;
      }
    }

    // 按 alt 匹配
    if (!matched && text) {
      const alt = (htmlEl as HTMLImageElement).alt || '';
      if (alt.toLowerCase().includes(text.toLowerCase())) {
        matchType = 'alt'; matched = true;
      }
    }

    // 按 title 匹配
    if (!matched && text) {
      const title = htmlEl.getAttribute('title') || '';
      if (title.toLowerCase().includes(text.toLowerCase())) {
        matchType = 'title'; matched = true;
      }
    }

    // 按 type 匹配（input type）
    if (!matched && type) {
      const elType = (htmlEl as HTMLInputElement).type || '';
      if (elType === type) { matchType = 'type'; matched = true; }
    }

    if (!matched) continue;

    // 生成 CSS 选择器
    const selector = generateSelector(htmlEl);

    const rect = htmlEl.getBoundingClientRect();
    const attrs: Record<string, string> = {};
    for (let i = 0; i < htmlEl.attributes.length; i++) {
      const a = htmlEl.attributes[i];
      attrs[a.name] = a.value;
    }

    results.push({
      tag: htmlEl.tagName.toLowerCase(),
      id: htmlEl.id || undefined,
      className: htmlEl.className?.toString().slice(0, 100) || undefined,
      text: (htmlEl.textContent || '').trim().slice(0, 200),
      selector,
      html: htmlEl.outerHTML?.slice(0, 400) || undefined,
      attributes: attrs,
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      matchType,
    });
  }

  // 按匹配质量排序: aria-label > text > placeholder > alt > title
  const rank: Record<string, number> = { 'aria-label': 0, 'text': 1, placeholder: 2, alt: 3, title: 4, role: 0, type: 3 };
  results.sort((a, b) => (rank[a.matchType] ?? 9) - (rank[b.matchType] ?? 9));

  return results.slice(0, 10);
}

/** 为元素生成唯一 CSS 选择器（多策略，同拾取器） */
function generateSelector(el: HTMLElement): string {
  // 策略1: id
  if (el.id) return `#${CSS.escape(el.id)}`;

  // 策略2: tag + classes
  let tagSel = el.tagName.toLowerCase();
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).slice(0, 3).filter(c => !c.includes('_')).join('.');
    if (cls) tagSel += '.' + cls.split('.').map(c => CSS.escape(c)).join('.');
  }

  // 检查是否唯一
  if (document.querySelectorAll(tagSel).length === 1) return tagSel;

  // 策略3: 完整路径
  const path: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let segment = current.tagName.toLowerCase();
    if (current.id) { path.unshift(`#${CSS.escape(current.id)}`); break; }
    if (current.className && typeof current.className === 'string') {
      const cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) segment += '.' + cls.split('.').map(c => CSS.escape(c)).join('.');
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(s => s.tagName === current!.tagName);
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    path.unshift(segment);
    current = current.parentElement;
  }
  return path.join(' > ');
}

// === 点击元素 ======
function clickElement(selector: string): boolean {
  const el = querySelectorDeep(selector);
  if (!el) throw new Error(`未找到元素: ${selector}`);

  // 用 composed:true 事件穿透 Shadow DOM
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  return true;
}

// === 输入文本（支持 input / textarea / contenteditable）=====
function typeText(selector: string, text: string, clear?: boolean): boolean {
  const el = querySelectorDeep(selector);
  if (!el) throw new Error(`未找到输入元素: ${selector}`);

  el.focus();

  // 判断是否为 contenteditable div
  const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';

  if (isContentEditable) {
    // contenteditable: 用 execCommand 触发 React 内部状态更新
    if (clear) el.textContent = '';
    // 选中编辑器内容（或末尾）
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // 折叠到末尾
    sel?.removeAllRanges();
    sel?.addRange(range);
    // execCommand 会触发 beforeinput → input → React 状态更新
    document.execCommand('insertText', false, text);
  } else {
    // 标准 input / textarea
    const input = el as HTMLInputElement;
    if (clear) input.value = '';
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  return true;
}

// === 滚动 ======
function scrollPage(params: { x?: number; y?: number; direction?: string; amount?: number }): boolean {
  const { x, y, direction, amount = 300 } = params;

  if (x !== undefined || y !== undefined) {
    window.scrollTo({ left: x ?? 0, top: y ?? 0, behavior: 'smooth' });
  } else if (direction) {
    const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
    window.scrollBy({ left: deltaX, top: deltaY, behavior: 'smooth' });
  }

  return true;
}

// === MutationObserver 封装 ======
let activeObserver: MutationObserver | null = null;
let observerCallback: ((mutations: string) => void) | null = null;

function startObserving(config?: Record<string, unknown>): void {
  if (activeObserver) {
    activeObserver.disconnect();
  }

  const obsConfig: MutationObserverInit = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
    ...config,
  };

  let mutationBuffer: string[] = [];
  let bufferTimer: ReturnType<typeof setTimeout> | null = null;

  activeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const desc: string[] = [];
      if (mutation.type === 'childList') {
        desc.push(`子节点变化: +${mutation.addedNodes.length} / -${mutation.removedNodes.length}`);
      }
      if (mutation.type === 'attributes') {
        desc.push(`属性变化: ${mutation.attributeName}`);
      }
      if (mutation.type === 'characterData') {
        desc.push('文本变化');
      }
      mutationBuffer.push(desc.join(', '));
    }

    // 批处理 - 每 500ms 发送一次变更摘要
    if (!bufferTimer) {
      bufferTimer = setTimeout(() => {
        if (observerCallback && mutationBuffer.length > 0) {
          observerCallback(mutationBuffer.join(' | '));
          mutationBuffer = [];
        }
        bufferTimer = null;
      }, 500);
    }
  });

  activeObserver.observe(document.body, obsConfig);
}

function stopObserving(): void {
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }
}

// === 等待元素出现 ======
function waitForElement(selector: string, timeout = 10000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (querySelectorDeep(selector)) {
      resolve(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (querySelectorDeep(selector)) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`等待元素超时: ${selector}`));
    }, timeout);
  });
}

// === LocalStorage ======
function getLocalStorage(keys?: string[]): { items: Record<string, string | null> } {
  const items: Record<string, string | null> = {};
  if (keys) {
    for (const key of keys) {
      items[key] = localStorage.getItem(key);
    }
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) items[key] = localStorage.getItem(key);
    }
  }
  return { items };
}

// === 拾取（指给 Agent 看：这个元素是什么）=====
// === 消息监听 ======
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.source !== 'browser-mcp-bg') return;

  const { method, params = {} } = message;

  try {
    switch (method) {
      // DOM 查询（CSS 选择器）
      case 'query_dom': {
        const elements = queryDOM(params.selector as string);
        sendResponse({ elements });
        break;
      }

      // XPath 查询
      case 'xpath_query': {
        const result = queryXPath(params.xpath as string);
        sendResponse(result);
        break;
      }

      // 语义查找（支持先等待动态内容加载）
      case 'find_element': {
        const waitFor = params.waitFor as string | undefined;
        const timeout = (params.timeout as number) ?? 10000;

        (async () => {
          try {
            // 如果指定了 waitFor，先等元素出现
            if (waitFor) {
              await waitForElement(waitFor, timeout);
            }

            const result = findElements({
              text: params.text as string,
              role: params.role as string,
              type: params.type as string,
              tag: params.tag as string,
            });
            sendResponse({ elements: result });
          } catch (err) {
            sendResponse({
              elements: [],
              error: waitFor ? `等待元素超时: ${waitFor}` : (err as Error).message,
            });
          }
        })();
        return true; // 异步响应
      }

      // 点击
      case 'click_element': {
        clickElement(params.selector as string);
        sendResponse({ success: true });
        break;
      }

      // 输入
      case 'type_text': {
        typeText(params.selector as string, params.text as string, params.clear as boolean);
        sendResponse({ success: true });
        break;
      }

      // 滚动
      case 'scroll_page': {
        scrollPage(params as { x?: number; y?: number; direction?: string; amount?: number });
        sendResponse({ success: true });
        break;
      }

      // 等待元素
      case 'wait_for_element': {
        waitForElement(params.selector as string, params.timeout as number)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // 异步响应
      }

      // DOM 观察
      case 'observe_dom': {
        observerCallback = (summary: string) => {
          chrome.runtime.sendMessage({
            source: 'browser-mcp-content',
            type: 'dom_mutation',
            data: { summary },
          }).catch(() => {});
        };
        startObserving(params.config as Record<string, unknown> | undefined);
        sendResponse({ success: true });
        break;
      }

      // 内容提取 - Markdown
      case 'get_markdown': {
        const result = extractMarkdown(document);
        if (result) {
          sendResponse({ title: result.title, content: result.content, url: location.href, textContent: result.textContent });
        } else {
          sendResponse({ title: document.title, content: '', url: location.href, textContent: '' });
        }
        break;
      }

      // 内容提取 - Markdown (通过 storage 返回，支持大数据)
      case 'get_markdown_storage': {
        const mdResult = extractMarkdown(document);
        const key = params._responseKey as string;
        if (key) {
          const data = mdResult ?? { title: document.title, content: '', url: location.href, textContent: '' };
          chrome.storage.session.set({ [key]: data }).catch(() => {});
        }
        sendResponse({ queued: true });
        break;
      }

      // 内容提取 - 纯文本
      case 'get_text': {
        const text = extractText(document);
        sendResponse({ text });
        break;
      }

      case 'get_text_storage': {
        const txtResult = { text: extractText(document) };
        const key = params._responseKey as string;
        if (key) chrome.storage.session.set({ [key]: txtResult }).catch(() => {});
        sendResponse({ queued: true });
        break;
      }

      // 提取文章
      case 'extract_article': {
        const article = extractArticle(document);
        sendResponse(article ?? { title: document.title, author: null, time: null, content: '' });
        break;
      }

      case 'extract_article_storage': {
        const articleResult = extractArticle(document) ?? { title: document.title, author: null, time: null, content: '' };
        const key = params._responseKey as string;
        if (key) chrome.storage.session.set({ [key]: articleResult }).catch(() => {});
        sendResponse({ queued: true });
        break;
      }

      // 提取表格
      case 'extract_table': {
        const table = extractTable(document, (params.index as number) ?? 0);
        sendResponse({ table: table ?? [] });
        break;
      }

      // 提取链接
      case 'extract_links': {
        const links = extractLinks(document);
        sendResponse({ links });
        break;
      }

      case 'extract_links_storage': {
        const linksResult = { links: extractLinks(document) };
        const key = params._responseKey as string;
        if (key) chrome.storage.session.set({ [key]: linksResult }).catch(() => {});
        sendResponse({ queued: true });
        break;
      }

      // 提取图片
      case 'extract_images': {
        const images = extractImages(document, params.minWidth as number, params.minHeight as number);
        sendResponse({ images });
        break;
      }

      // LocalStorage
      case 'get_local_storage': {
        const result = getLocalStorage(params.keys as string[]);
        sendResponse(result);
        break;
      }

      // 执行 JS（供 Agent 处理复杂场景）
      case 'evaluate': {
        const code = params.code as string;
        if (!code) { sendResponse({ error: 'code 不能为空' }); break; }
        try {
          const result = eval(code);
          sendResponse({ result: result ?? null });
        } catch (err) {
          sendResponse({ error: (err as Error).message });
        }
        break;
      }

      // 录制（捕获操作示例供 Agent 参考）
      case 'recording_start': {
        startRecording();
        sendResponse({ success: true });
        break;
      }

      case 'recording_stop': {
        const steps = stopRecording();
        const key = params._responseKey as string;
        if (key) {
          chrome.storage.session.set({ [key]: { steps, url: location.href, title: document.title } }).catch(() => {});
        }
        sendResponse({ success: true, stepCount: steps.length });
        break;
      }

      default:
        sendResponse({ error: `未知方法: ${method}` });
    }
  } catch (err) {
    sendResponse({ error: (err as Error).message });
  }
});

// 通知 background 脚本已就绪
chrome.runtime.sendMessage({
  source: 'browser-mcp-content',
  type: 'content_script_ready',
}).catch(() => {});

console.log('[Content] Pilot Browse MCP 已注入');
