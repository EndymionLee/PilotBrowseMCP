import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';
import { logger } from '../lib/logger.js';

const ALLOWED_EXTS = ['.md', '.txt', '.html', '.json', '.csv'];

export function registerFileTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser.inspect_page', {
    description: 'Inspect the page structure: headings, content areas, tables, lists, forms. Returns tag names, IDs, and classes only -- no full content. Very lightweight (a few tokens). Use this to understand page layout before deciding how to extract or save content.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
    }),
  }, async (args) => {
    const { tabId } = args as any;
    const selectors = ['h1', 'h2', 'h3', 'article', 'section', 'main', '.content', '.article', '.post', '#content', '#main', 'nav', 'aside', 'footer', 'header', 'table', 'img', 'form'];
    const structure: Record<string, any[]> = {};
    for (const sel of selectors) {
      try {
        const r = await conn.sendRequest<{ elements: any[] }>('query_dom', { tabId, selector: sel });
        if (r.elements?.length) {
          structure[sel] = r.elements.slice(0, 5).map((el: any) => ({
            tag: el.tag, id: el.id, class: el.className?.slice(0, 60), text: el.text?.slice(0, 80),
          }));
        }
      } catch {}
    }
    const pageInfo = await conn.sendRequest<{ text: string }>('get_text', { tabId }).catch(() => ({ text: '' }));
    return { textLength: pageInfo.text.length, textPreview: pageInfo.text.slice(0, 200), structure };
  });

  defineTool(server, conn, 'browser.save_content', {
    description: 'Auto-detect the main content of the page and save it directly to a local file. Uses Readability algorithm (same as get_markdown) to identify the primary content area. Content flows from the browser to disk without entering the LLM context. Best for saving articles, novels, blog posts. If the auto-detection is inaccurate, use browser.inspect_page first to find the right selectors, then browser.save_xpath.',
    inputSchema: z.object({
      filePath: z.string().describe('File path, e.g. "output/article.md" or "D:/novels/chapter1.txt"'),
      tabId: z.number().optional().describe('Tab ID, defaults to active tab'),
    }),
  }, async (args) => {
    const { filePath, tabId } = args as any;
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) throw new Error(`Unsupported extension: ${ext}. Allowed: ${ALLOWED_EXTS.join(', ')}`);
    const r = await conn.sendRequest<{ title: string; content: string; url: string }>('get_markdown', { tabId });
    if (!r.content) throw new Error('No content detected');
    const text = `# ${r.title}\n\nSource: ${r.url}\n\n---\n\n${r.content}`;
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, text, 'utf-8');
    const size = Buffer.byteLength(text, 'utf-8');
    logger.info('Files', 'Saved content', { path: resolved, title: r.title, size: `${size}B` });
    return `Saved "${r.title}" to ${resolved} (${(size / 1024).toFixed(1)}KB)`;
  });

  defineTool(server, conn, 'browser.save_xpath', {
    description: 'Extract text from elements matching an XPath expression and save to a local file. Use browser.inspect_page to find the page structure first, then construct the XPath. Examples: "//article//p" for all paragraphs, "//div[@id="content"]//text()" for all text nodes. Content goes directly to disk, not through the LLM.',
    inputSchema: z.object({
      filePath: z.string().describe('File path'),
      tabId: z.number().describe('Tab ID'),
      xpath: z.string().describe('XPath expression. Examples: //article, //div[@id="content"], //div[contains(@class,"novel")]//p'),
    }),
  }, async (args) => {
    const { filePath, tabId, xpath } = args as any;
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) throw new Error(`Unsupported extension: ${ext}`);
    const result = await conn.sendRequest<{ text: string; nodes: number }>('xpath_query', { tabId, xpath });
    if (!result.text) throw new Error('XPath matched no content');
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, result.text, 'utf-8');
    const size = Buffer.byteLength(result.text, 'utf-8');
    logger.info('Files', 'Saved XPath', { path: resolved, nodes: result.nodes, size: `${size}B` });
    return `Saved ${result.nodes} nodes to ${resolved} (${(size / 1024).toFixed(1)}KB)`;
  });
}
