import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerDomTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser_query', {
    description: 'Query page elements by CSS selector. Returns tag, id, class, text, attributes, and bounding box for each match. Use to inspect page structure and find element selectors. Supports standard CSS selectors only (not Playwright-specific ones like :has-text()). Parameters: tabId (required, number), selector (required, string). Returns: array of element objects with tag, id, class, text, attributes, bounds.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID from browser.list_tabs'),
      selector: z.string().describe('CSS selector, e.g. "div.main-content a", ".class-name", "#id"'),
      frameId: z.number().optional().describe('Target a specific iframe (from browser.list_frames). Main frame is 0'),
    }),
  }, async (args) => {
    try {
      const r = await conn.sendRequest<{ elements: unknown[] }>('query_dom', args);
      return r.elements;
    } catch (err) {
      const msg = (err as Error).message;
      // 将常见的无效选择器错误转为友好提示
      if (msg.includes('not a valid selector') || msg.includes('SyntaxError')) {
        return `Invalid CSS selector: "${args.selector}". Standard CSS selectors only (e.g. ".class", "#id", "tag", "div > p"). Playwright-specific selectors like :has-text() are not supported.`;
      }
      throw err;
    }
  });

  defineTool(server, conn, 'browser_list_frames', {
    description: 'List all frames in a page (frameId + url). Use the frameId to target iframes in browser_evaluate / browser_query / browser_find. The main frame is frameId 0. Parameters: tabId (required). Returns: frames array.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ frames: unknown[] }>('list_frames', args);
    return r.frames;
  });

  defineTool(server, conn, 'browser_click', {
    description: 'Click an element on the page by CSS selector. Dispatches composed:true events that penetrate Shadow DOM. Use after browser.find to locate the element. Parameters: tabId (required, number), selector (required, string). Returns: confirmation message.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      selector: z.string().describe('CSS selector for the element to click'),
    }),
  }, async (args) => {
    await conn.sendRequest('click_element', args);
    return `Clicked: ${args.selector}`;
  });

  defineTool(server, conn, 'browser_type', {
    description: 'Type text into an input field by CSS selector. Supports standard inputs (input, textarea) and contenteditable divs. For contenteditable (rich text editors), uses execCommand for React state compatibility. Parameters: tabId (required, number), selector (required, string), text (required, string), clear (optional, boolean, default false). Returns: confirmation message.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      selector: z.string().describe('CSS selector targeting input, textarea, or [contenteditable]'),
      text: z.string().describe('Text content to type'),
      clear: z.boolean().optional().default(false).describe('Clear the input before typing'),
    }),
  }, async (args) => {
    await conn.sendRequest('type_text', args);
    return `Typed into: ${args.selector}`;
  });

  defineTool(server, conn, 'browser_scroll', {
    description: 'Scroll the page. Supports absolute position (x/y) or directional scroll (up/down/left/right by amount pixels). Parameters: tabId (required, number), x (optional, number), y (optional, number), direction (optional, up|down|left|right), amount (optional, number, default 300). Returns: confirmation message.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      x: z.number().optional().describe('Horizontal scroll target in px'),
      y: z.number().optional().describe('Vertical scroll target in px'),
      direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction, paired with amount'),
      amount: z.number().optional().default(300).describe('Scroll distance in px per directional scroll'),
    }),
  }, async (args) => {
    await conn.sendRequest('scroll_page', args);
    return 'Scrolled';
  });

  defineTool(server, conn, 'browser_wait', {
    description: 'Wait for a duration in milliseconds. Use for page load, animations, or data rendering. Prefer browser.wait_for_element when waiting for a specific element to appear. Parameters: ms (optional, number, default 1000). Returns: confirmation message.',
    inputSchema: z.object({
      ms: z.number().optional().default(1000).describe('Milliseconds to wait. 1000 = 1 second'),
    }),
  }, async (args) => {
    await new Promise((r) => setTimeout(r, args.ms ?? 1000));
    return `Waited ${args.ms ?? 1000}ms`;
  });

  defineTool(server, conn, 'browser_wait_for_element', {
    description: 'Wait for an element matching a CSS selector to appear in the DOM. Uses MutationObserver for efficient detection. Better than browser.wait because it responds as soon as the element appears. Penetrates Shadow DOM. Parameters: tabId (required, number), selector (required, string), timeout (optional, number, default 10000). Returns: confirmation message.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      selector: z.string().describe('CSS selector to wait for'),
      timeout: z.number().optional().default(10000).describe('Timeout in ms. Default 10000 (10 seconds)'),
    }),
  }, async (args) => {
    await conn.sendRequest('wait_for_element', args);
    return `Element appeared: ${args.selector}`;
  });

  defineTool(server, conn, 'browser_cookies', {
    description: 'Read cookies for the current domain. Specify a tab ID to auto-detect the domain, or provide a domain directly. Returns name, value, domain, path, secure, httpOnly, sameSite for each cookie. Requires cookie permission. Can read HttpOnly cookies (Chrome Extension API has full access, unlike document.cookie). Parameters: tabId (optional, number), domain (optional, string). Returns: array of cookies.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID to auto-detect domain'),
      domain: z.string().optional().describe('Explicit domain, e.g. ".example.com"'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ cookies: unknown[] }>('get_cookies', args);
    return r.cookies;
  });

  defineTool(server, conn, 'browser_local_storage', {
    description: 'Read LocalStorage data for a page. Specify keys to read specific items, or omit to get all key-value pairs. Requires LocalStorage permission. Parameters: tabId (required, number), keys (optional, string array, reads all if omitted). Returns: key-value pairs object.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      keys: z.array(z.string()).optional().describe('Specific keys to read, e.g. ["token", "user_info"]. Returns all keys if omitted'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ items: Record<string, unknown> }>('get_local_storage', args);
    return r.items;
  });

  defineTool(server, conn, 'browser_evaluate', {
    description: 'Execute arbitrary JavaScript code in the page MAIN world and return the result. For complex interactions: Shadow DOM access, iframe access (use frameId), React state manipulation, calling page functions, triggering network requests. Uses chrome.scripting.executeScript so it bypasses page CSP and supports Promise results. Parameters: tabId (required, number), code (required, string), frameId (optional, number, target a specific iframe), allFrames (optional, boolean, run in all frames). Returns: result of the executed JavaScript and the frameId.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      code: z.string().describe('JavaScript code to execute. Supports Promise (awaited). Example: `window.login()` or `document.querySelector("x-comments").shadowRoot...`'),
      frameId: z.number().optional().describe('Target a specific iframe by its frameId (0 = main frame). Use browser.list_frames to find frameIds'),
      allFrames: z.boolean().optional().describe('Run the code in all frames (results from the first frame are returned)'),
    }),
  }, async (args) => {
    const { tabId, code, frameId, allFrames } = args as any;
    if (!code) throw new Error('code is required');
    const result = await conn.sendRequest<any>('evaluate', { tabId, code, frameId, allFrames });
    if (result?.error) throw new Error(result.error);
    return { result: result?.result ?? null, frameId: result?.frameId ?? frameId ?? 0 };
  });
}
