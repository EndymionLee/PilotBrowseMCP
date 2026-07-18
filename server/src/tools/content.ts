import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerContentTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser.get_markdown', {
    description: 'Extract the main content of a page as clean Markdown. Uses Readability.js to strip navigation, ads, and sidebars, then Turndown to convert HTML to Markdown. Best for articles, news, docs, and text-heavy pages. Returns title, source URL, and markdown body.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID from browser.list_tabs. Uses the active tab by default'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ title: string; content: string; url: string }>('get_markdown', args);
    return `# ${r.title}\n\nSource: ${r.url}\n\n---\n\n${r.content}`;
  });

  defineTool(server, conn, 'browser.get_html', {
    description: 'Get the raw HTML source of a page. Returns unprocessed document.documentElement.outerHTML. Note: HTML contains scripts, styles, and clutter that consumes many tokens. For reading content, prefer get_markdown. Requires HTML permission.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID, defaults to active tab'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ html: string }>('get_html', args);
    return r.html;
  });

  defineTool(server, conn, 'browser.get_text', {
    description: 'Get the plain text of a page via document.body.textContent. Strips all HTML tags. Lighter than get_markdown but loses headings, links, and list structure.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID, defaults to active tab'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ text: string }>('get_text', args);
    return r.text;
  });

  defineTool(server, conn, 'browser.extract_article', {
    description: 'Extract structured article metadata from a page. Returns title, author, publish date, and body (Markdown). More metadata than get_markdown. Best for news and blog pages with clear authorship.',
    inputSchema: z.object({
      tabId: z.number().optional(),
    }),
  }, async (args) => {
    return conn.sendRequest('extract_article', args);
  });

  defineTool(server, conn, 'browser.extract_table', {
    description: 'Extract HTML table data as a JSON array. First row is used as keys. Use index to pick which table when the page has multiple. Best for price lists, rankings, data reports.',
    inputSchema: z.object({
      tabId: z.number().optional(),
      index: z.number().optional().default(0).describe('Table index (0-based). Use when the page has multiple <table> elements'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ table: unknown[] }>('extract_table', args);
    return r.table;
  });

  defineTool(server, conn, 'browser.extract_links', {
    description: 'Extract all links (<a href>) from a page. Returns text and href for each link. Filters out javascript: pseudo-protocols. Best for crawling, navigation discovery, reference collection.',
    inputSchema: z.object({
      tabId: z.number().optional(),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ links: unknown[] }>('extract_links', args);
    return r.links;
  });

  defineTool(server, conn, 'browser.extract_images', {
    description: 'Extract all images from a page with src, alt text, rendered width and height. Use minWidth/minHeight to filter out small icons.',
    inputSchema: z.object({
      tabId: z.number().optional(),
      minWidth: z.number().optional().describe('Minimum width filter in px. Filers out smaller images'),
      minHeight: z.number().optional().describe('Minimum height filter in px'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ images: unknown[] }>('extract_images', args);
    return r.images;
  });
}
