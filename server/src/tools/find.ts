import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerFindTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser.find', {
    description: 'Find elements on the page by visible text, aria-label, placeholder, role, or tag. No CSS selectors needed -- describe what you are looking for in natural language. Returns matched elements with a selector ready for browser.click or browser.type. Match priority: aria-label > visible text > placeholder > alt > title. Supports waitFor to wait for dynamic content before searching.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      text: z.string().optional().describe('Visible text to find, e.g. "Login", "Next page", "Search"'),
      role: z.string().optional().describe('ARIA role, e.g. "button", "link", "dialog"'),
      type: z.string().optional().describe('Input type, e.g. "text", "email", "password"'),
      tag: z.string().optional().describe('HTML tag, e.g. "button", "a", "input"'),
      waitFor: z.string().optional().describe('CSS selector to wait for before searching. Use for dynamically loaded content, e.g. waitFor=".pagination" before finding "Next" button'),
      timeout: z.number().optional().default(10000).describe('Timeout in ms for waitFor. Default 10000'),
    }),
  }, async (args) => {
    const { tabId, text, role, type, tag, waitFor, timeout } = args as any;
    if (!text && !role && !type && !tag) {
      throw new Error('Specify at least one of: text, role, type, or tag');
    }
    const result = await conn.sendRequest<{ elements: any[]; error?: string }>('find_element', {
      tabId, text, role, type, tag, waitFor, timeout,
    });
    if (result.error) throw new Error(result.error);
    if (!result.elements?.length) {
      throw new Error('No matching elements found. Try: 1) different keywords 2) browser.current_page to confirm the page is loaded');
    }
    return result.elements.map((el: any) => ({
      selector: el.selector, tag: el.tag, text: el.text?.slice(0, 100),
      matchType: el.matchType, id: el.id, boundingBox: el.boundingBox,
    }));
  });
}
