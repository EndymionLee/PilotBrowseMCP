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
const MANUALS_BASE = path.resolve(process.env.MANUALS_DIR || 'website-manuals');

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
    description: 'Generate a PAB automation script (.pab) from workflow steps. The script can be loaded and run from the Extension popup without LLM. Supports control flow (if/for/fn). Parameters: site (required, string), scriptName (required, string), description (required, string), steps (required, array of { method, params }). Returns: confirmation with path.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "youtube_com"'),
      scriptName: z.string().describe('Script name, e.g. "daily-checkin"'),
      description: z.string().describe('Script description'),
      steps: z.array(z.object({
        method: z.string().describe('MCP tool name, e.g. browser_open, browser_click'),
        params: z.any().optional().describe('Tool parameters as key-value pairs'),
      })).describe('Array of tool call steps'),
    }),
  }, async (args) => {
    const { site, scriptName, description, steps } = args as any;
    const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const safeName = scriptName.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const scriptsDir = path.resolve('website-manuals', safeSite, 'workflows', 'scripts');
    const scriptPath = path.join(scriptsDir, `${safeName}.pab`);
    await fs.mkdir(scriptsDir, { recursive: true });

    // Convert steps to PAB syntax
    let pab = `# ${description}\n\n`;
    for (const step of steps) {
      const method = step.method || step.tool;
      const params = step.params || {};
      const argsList: string[] = [];
      for (const [k, v] of Object.entries(params)) {
        const val = typeof v === 'string' ? `"${v}"` : String(v);
        argsList.push(`${k}=${val}`);
      }
      if (argsList.length > 0) {
        pab += `${method}(${argsList.join(', ')})\n`;
      } else {
        pab += `${method}()\n`;
      }
    }
    pab += `\n`;

    await fs.writeFile(scriptPath, pab, 'utf-8');
    logger.info('Workflow', 'PAB script generated', { site: safeSite, name: safeName, steps: steps.length });
    return { success: true, path: `${safeSite}/workflows/scripts/${safeName}.pab`, site: safeSite, stepCount: steps.length };
  });

  defineTool(server, conn, 'workflow_execute_script', {
    description: 'Read a PAB script (.pab) from website-manuals and send it to the Extension for execution. The script runs via PAB Interpreter with full control flow support. Parameters: site (required, string), scriptName (required, string, without .pab suffix). Returns: execution summary.',
    inputSchema: z.object({
      site: z.string().describe('Site directory name, e.g. "youtube_com"'),
      scriptName: z.string().describe('Script name without .pab, e.g. "daily-checkin"'),
    }),
  }, async (args) => {
    const { site, scriptName } = args as any;
    const safeSite = site.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const safeName = scriptName.replace(/[^a-zA-Z0-9一-龥_-]/g, '_');
    const scriptPath = path.resolve(MANUALS_BASE, safeSite, 'workflows', 'scripts', `${safeName}.pab`);

    let pabCode: string;
    try { pabCode = await fs.readFile(scriptPath, 'utf-8'); }
    catch { throw new Error(`Script not found: ${safeSite}/workflows/scripts/${safeName}.pab`); }

    // 通过 Extension 执行（PAB Interpreter），等待完成
    const result = await conn.sendRequest<any>('pab_run', { code: pabCode });
    const summary = result?.details ? {
      total: result.total || result.details.length,
      ok: result.ok || 0,
      fail: result.fail || 0,
      results: result.details,
    } : { total: 1, ok: 0, fail: 1, results: [{ step: 1, status: 'fail', error: result?.error || 'Unknown error' }] };
    return JSON.stringify(summary, null, 2);
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
      fileType: z.enum(['page', 'navigation', 'workflow', 'api', 'script', 'pab', 'readme', 'apis_index', 'workflows_index']).describe('Type of file to validate'),
      filePath: z.string().describe('Full path to the file to validate'),
    }),
  }, async (args) => {
    const { filePath, fileType } = args as any;
    const errors: string[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Markdown 文件（readme / apis_index / workflows_index）：检查表格结构
      if (fileType === 'readme' || fileType === 'apis_index' || fileType === 'workflows_index') {
        if (!content.includes('[pages/](pages/)') && !content.includes('apis/')) {
          errors.push('README must contain directory links (pages/, navigation/, etc.)');
        }
        if (!content.includes('|')) errors.push('Index README should contain a markdown table');
        return JSON.stringify({ valid: errors.length === 0, errors }, null, 2);
      }

      // PAB 文件验证：检查基本语法
      if (fileType === 'pab') {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          // 检查未闭合的括号
          const opens = (trimmed.match(/\(/g) || []).length;
          const closes = (trimmed.match(/\)/g) || []).length;
          if (opens !== closes) errors.push(`Line ${i + 1}: unclosed parentheses`);
          // 检查字符串引号
          const quotes = (trimmed.match(/"/g) || []).length;
          if (quotes % 2 !== 0) errors.push(`Line ${i + 1}: unclosed string`);
          // 检查函数定义
          if (trimmed.startsWith('fn ') && !trimmed.endsWith(':')) errors.push(`Line ${i + 1}: fn declaration must end with ':'`);
          // 检查控制流
          if ((trimmed.startsWith('if ') || trimmed.startsWith('elif ') || trimmed.startsWith('else') || trimmed.startsWith('for ') || trimmed.startsWith('while ')) && !trimmed.endsWith(':')) {
            errors.push(`Line ${i + 1}: control statement must end with ':'`);
          }
        }
        return JSON.stringify({ valid: errors.length === 0, errors }, null, 2);
      }

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
          if (!a.boundTo || !Array.isArray(a.boundTo) || a.boundTo.length === 0) errors.push(`${key}: boundTo must be a non-empty array (at least one workflow reference)`);
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
