import { z } from 'zod';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';
import { logger } from '../lib/logger.js';

const RECORDINGS_DIR = path.resolve('recordings');
const MANUALS_BASE = path.resolve(process.env.MANUALS_DIR || 'E:\\PiTest\\website-manuals');

export function registerWorkflowTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'workflow.list_recordings', {
    description: 'List raw operation recordings sent by the user from the extension popup. Each recording captures what the user did on a website (clicks, inputs) along with their description. The agent reviews these to understand the workflow, then calls workflow.generate to save a proper workflow file to website-manuals.',
    inputSchema: z.object({}),
  }, async () => {
    try {
      await fs.mkdir(RECORDINGS_DIR, { recursive: true });
      const files = await fs.readdir(RECORDINGS_DIR);
      const recordings = await Promise.all(
        files.filter(f => f.endsWith('.json')).map(async (f) => {
          try {
            const raw = JSON.parse(await fs.readFile(path.join(RECORDINGS_DIR, f), 'utf-8'));
            return { name: raw.name, description: raw.description, site: raw.site, stepCount: raw.steps?.length || 0, recordedAt: raw.recordedAt, url: raw.url };
          } catch { return null; }
        }),
      );
      return { recordings: recordings.filter(Boolean) };
    } catch { return { recordings: [] }; }
  });

  defineTool(server, conn, 'workflow.get_recording', {
    description: 'Get the raw steps of a user recording. Returns each step with action type (click/type), element selector, and input value. The agent reviews this to understand the workflow, then calls workflow.generate to save a proper workflow file.',
    inputSchema: z.object({
      name: z.string().describe('Recording name from workflow.list_recordings'),
    }),
  }, async (args) => {
    const { name } = args as any;
    const safe = name.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const filePath = path.join(RECORDINGS_DIR, `${safe}.json`);
    try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); }
    catch { throw new Error(`Recording "${name}" not found`); }
  });

  defineTool(server, conn, 'workflow.generate', {
    description: 'Save a processed workflow to website-manuals/<site>/workflows/. The agent reviews raw recordings (workflow.get_recording) to understand the user workflow, then uses this tool to generate a properly formatted workflow file. After saving, automatically rebuilds the comprehensive manual. Format: {"workflowName":{"description":"...","startsOn":"Home","steps":[{"action":"click","page":"Home","target":"searchInput"},{"action":"type","page":"Home","target":"searchInput","params":{"text":"___text___"}}]}}',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "youtube", "examplesite"'),
      workflowName: z.string().describe('Workflow name, e.g. "searchVideo", "postComment"'),
      data: z.any().describe('Workflow data object. Format: { workflowName: { description, startsOn, steps: [{ action, page, target, params? }] } }'),
    }),
  }, async (args) => {
    const { site, workflowName, data } = args as any;
    const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const safeName = workflowName.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const wfDir = path.join(MANUALS_BASE, safeSite, 'workflows');
    const wfPath = path.join(wfDir, `${safeName}.json`);
    await fs.mkdir(wfDir, { recursive: true });
    await fs.writeFile(wfPath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('Workflow', 'Generated', { site: safeSite, name: safeName });
    const buildJs = path.join(MANUALS_BASE, 'build.js');
    if (existsSync(buildJs)) {
      try { execSync(`node build.js "${safeSite}"`, { cwd: MANUALS_BASE, stdio: 'pipe' }); } catch {}
    }
    return { success: true, path: `${safeSite}/workflows/${safeName}.json`, site: safeSite };
  });

  defineTool(server, conn, 'workflow.list', {
    description: 'List processed workflows in website-manuals. These are workflows the agent has already processed and saved.',
    inputSchema: z.object({}),
  }, async () => {
    const workflows: any[] = [];
    try {
      const sites = await fs.readdir(MANUALS_BASE);
      for (const site of sites) {
        const wfDir = path.join(MANUALS_BASE, site, 'workflows');
        try {
          await fs.access(wfDir);
          const files = await fs.readdir(wfDir);
          for (const file of files.filter(f => f.endsWith('.json'))) {
            try {
              const data = JSON.parse(await fs.readFile(path.join(wfDir, file), 'utf-8'));
              const wfName = Object.keys(data)[0];
              workflows.push({ name: wfName, site, description: data[wfName]?.description || '', stepCount: data[wfName]?.steps?.length || 0 });
            } catch {}
          }
        } catch {}
      }
    } catch {}
    return { workflows };
  });

  defineTool(server, conn, 'workflow.add_element', {
    description: 'Save a user-marked element to website-manuals pages/. When the user picks an element from the popup and tells you what it is, use this tool to save the element info (selector, description) to the corresponding site page file. Also rebuilds the comprehensive manual automatically.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name'),
      pageName: z.string().describe('Page name, e.g. "homepage", "videoPage"'),
      elementName: z.string().describe('Element name, e.g. "searchInput", "likeButton"'),
      description: z.string().describe('What the user told you this element does'),
      selector: z.string().describe('CSS selector for the element'),
      type: z.enum(['click', 'type', 'select']).optional().default('click'),
    }),
  }, async (args) => {
    const { site, pageName, elementName, description, selector, type = 'click' } = args as any;
    const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const pagesDir = path.join(MANUALS_BASE, safeSite, 'pages');
    const pageFile = path.join(pagesDir, `${pageName}.json`);
    await fs.mkdir(pagesDir, { recursive: true });
    let pageData: Record<string, any> = {};
    try { pageData = JSON.parse(await fs.readFile(pageFile, 'utf-8')); } catch {}
    pageData[elementName] = { selector, description: description || '', type, addedAt: new Date().toISOString().slice(0, 10) };
    await fs.writeFile(pageFile, JSON.stringify(pageData, null, 2), 'utf-8');
    logger.info('Workflow', 'Added element', { site: safeSite, page: pageName, element: elementName });
    const buildJs = path.join(MANUALS_BASE, 'build.js');
    if (existsSync(buildJs)) { try { execSync(`node build.js "${safeSite}"`, { cwd: MANUALS_BASE, stdio: 'pipe' }); } catch {} }
    return { success: true, path: `${safeSite}/pages/${pageName}.json` };
  });

  defineTool(server, conn, 'workflow.list_elements', {
    description: 'List elements the user has marked via the extension popup. The user clicks "Pick" in the popup, selects an element on the page, and describes its purpose. The agent reviews these to understand page elements.',
    inputSchema: z.object({}),
  }, async () => {
    const dir = path.resolve('picked-elements');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const elements = await Promise.all(
        files.filter(f => f.endsWith('.json')).map(async (f) => {
          try {
            const raw = JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'));
            return { name: raw.name || f.replace('.json', ''), description: raw.description, selector: raw.selector, site: raw.site, pickedAt: raw.pickedAt };
          } catch { return null; }
        }),
      );
      return { elements: elements.filter(Boolean) };
    } catch { return { elements: [] }; }
  });

  defineTool(server, conn, 'workflow.get_element', {
    description: 'Get details of a user-marked element, including selector, description, HTML snippet, and more.',
    inputSchema: z.object({
      name: z.string().describe('Element name from workflow.list_elements'),
    }),
  }, async (args) => {
    const { name } = args as any;
    const filePath = path.resolve('picked-elements', `${name}.json`);
    try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); }
    catch { throw new Error(`Element "${name}" not found`); }
  });
}
