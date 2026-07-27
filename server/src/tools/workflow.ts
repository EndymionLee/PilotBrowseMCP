import { z } from 'zod';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';
import { logger } from '../lib/logger.js';

const LEARN_DIR = path.resolve('.learn');
const RECORDINGS_DIR = path.resolve(LEARN_DIR, 'recordings');
const MANUALS_BASE = path.resolve(process.env.MANUALS_DIR || 'E:\\PiTest\\website-manuals');

export function registerWorkflowTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'workflow_list_recordings', {
    description: 'List raw operation recordings sent by the user from the extension popup. Each recording captures clicks, inputs, and description. The agent reviews these to understand the workflow, then calls workflow.generate to save a proper workflow file. Parameters: none. Returns: array of recordings with name, description, site, stepCount, recordedAt, url.',
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

  defineTool(server, conn, 'workflow_get_recording', {
    description: 'Get the raw steps of a user recording. Returns each step with action type (click/type), element selector, and input value. The agent reviews this to understand the workflow, then calls workflow.generate to save a proper workflow file. Parameters: name (required, string, from list_recordings). Returns: recording object with steps array.',
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

  defineTool(server, conn, 'workflow_generate', {
    description: 'Save a processed workflow to website-manuals/<site>/workflows/. The agent reviews raw recordings to understand the user workflow, then uses this tool to generate a properly formatted workflow file. After saving, automatically rebuilds the comprehensive manual. Parameters: site (required, string), workflowName (required, string), data (required, object with description, startsOn, steps). Returns: confirmation with path and site.',
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

  defineTool(server, conn, 'workflow_generate_script', {
    description: 'Generate an MCP automation script file from workflow data. The script can be loaded and run from the Extension popup without LLM. Parameters: site (required, string), scriptName (required, string), description (required, string), steps (required, array of { method, params }). Returns: confirmation with path.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "youtube_com"'),
      scriptName: z.string().describe('Script name, e.g. "daily-checkin"'),
      description: z.string().describe('Script description'),
      steps: z.array(z.object({
        method: z.string().describe('MCP tool name, e.g. browser_open, browser_click'),
        params: z.any().optional().describe('Tool parameters'),
      })).describe('Array of tool call steps'),
    }),
  }, async (args) => {
    const { site, scriptName, description, steps } = args as any;
    const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const safeName = scriptName.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const scriptsDir = path.resolve('website-manuals', safeSite, 'workflows', 'scripts');
    const scriptPath = path.join(scriptsDir, `${safeName}.json`);
    await fs.mkdir(scriptsDir, { recursive: true });
    const data = { name: safeName, description, steps };
    await fs.writeFile(scriptPath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('Workflow', 'Script generated', { site: safeSite, name: safeName, steps: steps.length });
    return { success: true, path: `${safeSite}/workflows/scripts/${safeName}.json`, site: safeSite, stepCount: steps.length };
  });

  defineTool(server, conn, 'workflow_execute_script', {
    description: 'Load and execute an MCP script from website-manuals. Each step runs through the Extension. Results are collected and returned. The script path is website-manuals/<site>/workflows/scripts/<name>.json. Parameters: site (required, string), scriptName (required, string). Returns: execution summary with per-step results.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "youtube_com"'),
      scriptName: z.string().describe('Script name without .json, e.g. "daily-checkin"'),
    }),
  }, async (args) => {
    const { site, scriptName } = args as any;
    const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const safeName = scriptName.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const scriptPath = path.resolve('website-manuals', safeSite, 'workflows', 'scripts', `${safeName}.json`);

    let script: any;
    try { script = JSON.parse(await fs.readFile(scriptPath, 'utf-8')); }
    catch { throw new Error(`Script not found: ${safeSite}/workflows/scripts/${safeName}.json`); }

    if (!script.steps?.length) return JSON.stringify({ total: 0, ok: 0, fail: 0, message: 'No steps' });

    // MCP 工具名 -> Extension handler 名映射
    const methodMap: Record<string, string> = {
      browser_open: 'open_tab', browser_close: 'close_tab', browser_activate: 'activate_tab',
      browser_list_tabs: 'list_tabs', browser_current_page: 'list_tabs',
      browser_click: 'click_element', browser_type: 'type_text', browser_scroll: 'scroll_page',
      browser_query: 'query_dom', browser_evaluate: 'evaluate', browser_find: 'find_element',
      browser_wait: 'wait', browser_wait_for_element: 'wait_for_element',
      browser_get_markdown: 'get_markdown', browser_get_html: 'get_html', browser_get_text: 'get_text',
      browser_extract_article: 'extract_article', browser_extract_table: 'extract_table',
      browser_extract_links: 'extract_links', browser_extract_images: 'extract_images',
      browser_start_network_monitor: 'start_network_monitor',
      browser_stop_network_monitor: 'stop_network_monitor',
      browser_network_search: 'network_search', browser_network_detail: 'network_get',
      browser_network_wait: 'network_wait', browser_network_replay: 'network_replay',
      browser_network_clear_cache: 'network_clear_cache',
      browser_cookies: 'get_cookies', browser_local_storage: 'get_local_storage',
      browser_screenshot: 'screenshot',
      browser_permissions_list: 'permissions_list', browser_permissions_grant: 'permissions_grant',
      browser_permissions_revoke: 'permissions_revoke',
    };

    const results: any[] = [];
    let ok = 0, fail = 0;

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const mcpMethod = step.method || step.tool;
      const innerMethod = methodMap[mcpMethod] || mcpMethod;
      try {
        const r = await conn.sendRequest<any>(innerMethod, step.params || {});
        results.push({ step: i + 1, method: mcpMethod, status: 'ok' });
        ok++;
      } catch (err) {
        results.push({ step: i + 1, method: mcpMethod, status: 'fail', error: (err as Error).message });
        fail++;
      }
    }

    return JSON.stringify({ total: script.steps.length, ok, fail, results }, null, 2);
  });

  defineTool(server, conn, 'workflow_list', {
    description: 'List processed workflows in website-manuals. These are workflows the agent has already processed and saved. Parameters: none. Returns: array of workflows with name, site, description, stepCount.',
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

  defineTool(server, conn, 'workflow_add_element', {
    description: 'Save a user-marked element to website-manuals pages/. When the user picks an element from the popup and tells you what it is, save the element info (selector, description) to the corresponding site page file. Also rebuilds the comprehensive manual automatically. Parameters: site (required, string), pageName (required, string), elementName (required, string), description (required, string), selector (required, string), type (optional, click|type|select, default click). Returns: confirmation with path.',
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

  defineTool(server, conn, 'workflow_list_elements', {
    description: 'List elements the user has marked via the extension popup. The user clicks "Pick" in the popup, selects an element on the page, and describes its purpose. The agent reviews these to understand page elements. Parameters: none. Returns: array of elements with name, description, selector, site, pickedAt.',
    inputSchema: z.object({}),
  }, async () => {
    const dir = path.resolve(LEARN_DIR, 'picked-elements');
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

  defineTool(server, conn, 'workflow_get_element', {
    description: 'Get details of a user-marked element, including selector, description, HTML snippet, and more. Parameters: name (required, string, from list_elements). Returns: element details object.',
    inputSchema: z.object({
      name: z.string().describe('Element name from workflow.list_elements'),
    }),
  }, async (args) => {
    const { name } = args as any;
    const filePath = path.resolve(LEARN_DIR, 'picked-elements', `${name}.json`);
    try { return JSON.parse(await fs.readFile(filePath, 'utf-8')); }
    catch { throw new Error(`Element "${name}" not found`); }
  });

  // ── validate_manual ──

  defineTool(server, conn, 'workflow_validate_manual', {
    description: 'Validate a website manual file against the standard schema. Checks field names, required fields, and forbidden patterns. Call before saving any manual file. Parameters: site (required, string), fileType (required, string: page|navigation|workflow|api|script|readme|apis_index|workflows_index), filePath (required, string: path to the file to validate). Returns: list of errors, empty array if valid.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "youtube_com"'),
      fileType: z.enum(['page', 'navigation', 'workflow', 'api', 'script', 'readme', 'apis_index', 'workflows_index']).describe('Type of file to validate'),
      filePath: z.string().describe('Full path to the file to validate'),
    }),
  }, async (args) => {
    const { filePath, fileType } = args as any;
    const errors: string[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Page validation
      if (fileType === 'page') {
        for (const [key, el] of Object.entries(data)) {
          const elem = el as any;
          if (!elem.locator?.type) errors.push(`${key}: missing locator.type`);
          if (!elem.locator?.selector) errors.push(`${key}: missing locator.selector`);
          if (!elem.capabilities?.length) errors.push(`${key}: missing capabilities`);
          if (elem.capabilities && !Array.isArray(elem.capabilities)) errors.push(`${key}: capabilities must be an array`);
          if (!elem.interaction?.action) errors.push(`${key}: missing interaction.action`);
          if (!elem.interaction?.method) errors.push(`${key}: missing interaction.method`);
          if (elem.page || elem.url || elem.title) errors.push(`${key}: forbidden root fields: page, url, title`);
        }
      }

      // Navigation validation
      if (fileType === 'navigation') {
        for (const [key, nav] of Object.entries(data)) {
          const n = nav as any;
          if (!n.from) errors.push(`${key}: missing from`);
          if (!n.to) errors.push(`${key}: missing to`);
          if (!n.steps?.length) errors.push(`${key}: missing steps`);
          if (n.steps) {
            for (let i = 0; i < n.steps.length; i++) {
              if (!n.steps[i].action) errors.push(`${key}.steps[${i}]: missing action`);
              if (!n.steps[i].target) errors.push(`${key}.steps[${i}]: missing target`);
            }
          }
        }
      }

      // Workflow validation
      if (fileType === 'workflow') {
        for (const [key, wf] of Object.entries(data)) {
          const w = wf as any;
          if (!w.description) errors.push(`${key}: missing description`);
          if (!w.startsOn) errors.push(`${key}: missing startsOn`);
          if (!w.steps?.length) errors.push(`${key}: missing steps`);
          if (w.steps) {
            for (let i = 0; i < w.steps.length; i++) {
              if (!w.steps[i].action) errors.push(`${key}.steps[${i}]: missing action`);
              if (!w.steps[i].target) errors.push(`${key}.steps[${i}]: missing target`);
              if (w.steps[i].locator) errors.push(`${key}.steps[${i}]: use "target" not "locator"`);
              if (w.steps[i].duration !== undefined) errors.push(`${key}.steps[${i}]: use params.ms not duration`);
            }
          }
        }
      }

      // API validation
      if (fileType === 'api') {
        for (const [key, api] of Object.entries(data)) {
          const a = api as any;
          if (!a.description) errors.push(`${key}: missing description`);
          if (!a.method) errors.push(`${key}: missing method`);
          if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(a.method)) errors.push(`${key}: invalid method "${a.method}"`);
          if (!a.url) errors.push(`${key}: missing url`);
          if (!a.url?.startsWith('http')) errors.push(`${key}: url must start with https://`);
          if (!a.boundTo?.length) errors.push(`${key}: missing boundTo`);
          if (!a.discoveredAt) errors.push(`${key}: missing discoveredAt`);
          if (a.endpoint) errors.push(`${key}: forbidden field "endpoint", use "url"`);
          if (a.request) errors.push(`${key}: forbidden field "request"`);
          if (a.name) errors.push(`${key}: forbidden root field "name"`);
        }
      }
    } catch (err) {
      errors.push(`Cannot read or parse file: ${(err as Error).message}`);
    }

    return JSON.stringify({ valid: errors.length === 0, errors }, null, 2);
  });
}
