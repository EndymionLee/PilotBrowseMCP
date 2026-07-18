import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerBrowserTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser.list_tabs', {
    description: 'List all open browser tabs with id, title, and URL. Use query parameter to filter by title or URL. Call this first to find the tab you want to operate on.',
    inputSchema: z.object({
      query: z.string().optional().describe('Fuzzy match filter for title or URL, e.g. "github" returns tabs with "github" in the title or URL'),
    }),
  }, async (args) => {
    const result = await conn.sendRequest<{ tabs: unknown[] }>('list_tabs', args);
    return result.tabs;
  });

  defineTool(server, conn, 'browser.open', {
    description: 'Open a new tab and navigate to a URL. Set active=false to open in the background.',
    inputSchema: z.object({
      url: z.string().describe('Full URL including protocol, e.g. https://example.com'),
      active: z.boolean().optional().default(true).describe('Switch to the new tab immediately. false = stay on current tab'),
    }),
  }, async (args) => {
    const result = await conn.sendRequest<{ tab: unknown }>('open_tab', args);
    return result.tab;
  });

  defineTool(server, conn, 'browser.close', {
    description: 'Close a tab by its ID from browser.list_tabs.',
    inputSchema: z.object({
      id: z.number().describe('Tab ID to close'),
    }),
  }, async (args) => {
    await conn.sendRequest('close_tab', args);
    return `Tab ${args.id} closed`;
  });

  defineTool(server, conn, 'browser.activate', {
    description: 'Switch to a specific tab and bring it to the foreground.',
    inputSchema: z.object({
      id: z.number().describe('Tab ID to activate'),
    }),
  }, async (args) => {
    await conn.sendRequest('activate_tab', args);
    return `Switched to tab ${args.id}`;
  });

  defineTool(server, conn, 'browser.current_page', {
    description: 'Get the current active tab info: ID, title, URL. Call this at the start of a task to know which page you are on.',
    inputSchema: z.object({}),
  }, async (_args) => {
    const result = await conn.sendRequest<{ tabs: { id: number; url: string; title: string; active: boolean }[] }>('list_tabs');
    const active = result.tabs.find((t) => t.active);
    if (!active) throw new Error('No active tab found');
    return { tabId: active.id, title: active.title, url: active.url };
  });

  defineTool(server, conn, 'browser.screenshot', {
    description: 'Capture a screenshot of the current window or a specific tab. Returns base64 encoded image data. Requires screenshot permission.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID to capture. Defaults to active tab'),
      format: z.enum(['png', 'jpeg']).optional().default('png').describe('Image format: png (lossless) or jpeg (compressed)'),
      quality: z.number().min(1).max(100).optional().describe('JPEG quality 1-100. Higher is better. Only applies to jpeg'),
    }),
  }, async (args) => {
    const result = await conn.sendRequest<{ data: string; mimeType: string }>('screenshot', args);
    return { content: [{ type: 'image' as const, data: result.data, mimeType: result.mimeType }] };
  });
}
