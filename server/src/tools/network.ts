import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerNetworkTools(server: McpServer, conn: ExtensionConnection): void {
  // ─── start_network_monitor ───

  defineTool(server, conn, 'browser_start_network_monitor', {
    description:
      'Start monitoring all network requests (XHR, Fetch) for a browser tab. Requests and responses are cached for later search, inspection, and replay. ' +
      'Each tab needs separate monitoring. ' +
      'Parameters: tabId (required). ' +
      'Returns: confirmation message.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to monitor. Get it from browser.list_tabs first'),
    }),
  }, async (args) => {
    await conn.sendRequest('start_network_monitor', args);
    return `Started monitoring tab ${args.tabId}`;
  });

  // ─── stop_network_monitor ───

  defineTool(server, conn, 'browser_stop_network_monitor', {
    description:
      'Stop monitoring network requests for a tab. Cached requests are preserved and can still be searched, inspected, and replayed. ' +
      'Parameters: tabId (required). ' +
      'Returns: confirmation message.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to stop monitoring'),
    }),
  }, async (args) => {
    await conn.sendRequest('stop_network_monitor', args);
    return `Stopped monitoring tab ${args.tabId}`;
  });

  // ─── clear_cache ───

  defineTool(server, conn, 'browser_network_clear_cache', {
    description:
      'Clear all cached network requests for a tab. Monitoring continues if active. Use to free memory or reset the cache without stopping monitoring. ' +
      'Parameters: tabId (required, number), allTabs (optional, boolean, clears all tabs if true). ' +
      'Returns: confirmation with count of cleared entries.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID to clear cache for'),
      allTabs: z.boolean().optional().describe('Clear cache for all tabs'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ cleared: number }>('network_clear_cache', args);
    return `Cleared ${r.cleared} cached requests`;
  });

  // ─── search ───

  defineTool(server, conn, 'browser_network_search', {
    description:
      'Search cached network requests captured by the monitor. ' +
      'SPAs load data via XHR/Fetch -- this tool reveals those hidden API endpoints and their response data. ' +
      'Parameters: tabId (optional, searches all if omitted), keyword (in URL/body/headers), urlPattern (regex), method (GET/POST/PUT/DELETE/PATCH), statusCode, mimeType (e.g. "application/json"), sort (latest/oldest/largest/smallest), limit (default 20), offset. ' +
      'Returns: list of matching requests with requestId, URL, method, status, MIME type, size, body preview.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Limit search to a specific tab. Searches all monitored tabs if omitted'),
      keyword: z.string().optional().describe('Search keyword in URL, response body, or request headers'),
      urlPattern: z.string().optional().describe('URL pattern filter. Supports regex, e.g. "/api/product" or "product|list"'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('HTTP method filter'),
      statusCode: z.number().optional().describe('HTTP status code filter, e.g. 200, 404, 500'),
      mimeType: z.string().optional().describe('MIME type filter, e.g. "application/json" for APIs'),
      sort: z.enum(['latest', 'oldest', 'largest', 'smallest']).optional().default('latest').describe('Sort order: latest (newest first), oldest, largest (by response body size), smallest'),
      limit: z.number().optional().default(20).describe('Max results, default 20. Increase for broader search'),
      offset: z.number().optional().default(0).describe('Pagination offset'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ requests: any[]; total: number }>('network_search', args);
    const results = r.requests.map((req: any) => ({
      id: req.id, method: req.method, url: req.url,
      status: req.response?.status, mime: req.response?.mimeType,
      size: req.response?.bodySize,
      // 只对 JSON 响应返回 body_preview，避免图片/视频等二进制数据浪费 token
      body_preview: (req.response?.mimeType?.includes('json'))
        ? req.response?.body?.slice(0, 500)
        : undefined,
    }));
    return JSON.stringify({ total: r.total, results }, null, 2);
  });

  // ─── detail ───

  defineTool(server, conn, 'browser_network_detail', {
    description:
      'Get complete details of a cached network request by requestId. ' +
      'The size section helps judge whether this API returns the data you are looking for (e.g. a product list response is typically much larger than an auth check). ' +
      'Parameters: requestId (required, from network.search). ' +
      'Returns: structured object with request (headers, body), response (status, headers, mimeType, body), timing (startedAt, responseAt, elapsed), size (responseBody, headers, total).',
    inputSchema: z.object({
      requestId: z.string().describe('Request ID from browser.network.search results'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<any>('network_get', args);
    if (!r) return 'Request not found';

    const timing = r.timestamp ? { startedAt: new Date(r.timestamp).toISOString(), responseAt: r.response?.timestamp ? new Date(r.response.timestamp).toISOString() : null, elapsed: r.response?.timestamp ? r.response.timestamp - r.timestamp : null } : null;

    return JSON.stringify({
      id: r.id,
      url: r.url,
      method: r.method,
      timing,
      request: { headers: r.headers, body: r.postData || null },
      response: r.response ? {
        status: r.response.status,
        statusText: r.response.statusText,
        headers: r.response.headers,
        mimeType: r.response.mimeType,
        body: r.response.body,
      } : null,
      size: r.response ? {
        responseBody: r.response.body?.length || r.response.bodySize || 0,
        headers: JSON.stringify(r.response.headers).length,
        total: (r.response.body?.length || r.response.bodySize || 0) + JSON.stringify(r.response.headers).length,
      } : null,
    }, null, 2);
  });

  // ─── wait ───

  defineTool(server, conn, 'browser_network_wait', {
    description:
      'Wait for a network request matching the given criteria to arrive and complete. ' +
      'Parameters: tabId (required), urlPattern (required, regex), method (optional), statusCode (optional), keyword (optional), timeout (default 10000ms). ' +
      'Returns: matched request details (id, url, method, status, body preview, elapsed time) or timeout error.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to watch'),
      urlPattern: z.string().describe('URL pattern to wait for. Supports regex, e.g. "/api/search"'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('HTTP method filter'),
      statusCode: z.number().optional().describe('Expected status code, e.g. 200'),
      keyword: z.string().optional().describe('Keyword to match in URL, response body, or headers'),
      timeout: z.number().optional().default(10000).describe('Max wait time in ms, default 10000'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<any>('network_wait', args);
    if (!r) return 'Timeout: no matching request found';
    return JSON.stringify({
      id: r.id,
      url: r.url,
      method: r.method,
      status: r.response?.status,
      mime: r.response?.mimeType,
      body_preview: r.response?.body?.slice(0, 1000),
      bodySize: r.response?.body?.length || r.response?.bodySize,
      elapsed: r.elapsed,
    }, null, 2);
  });

  // ─── replay ───

  defineTool(server, conn, 'browser_network_replay', {
    description:
      'Replay a cached network request with optional parameter overrides and response extraction. ' +
      'Turns a captured API call into a reusable data primitive -- paginate, search, refresh, all without touching the DOM. ' +
      'By default runs server-side without cookies (safe for public APIs). ' +
      'Set options.context="browser" to run the replay in the browser context with full cookies (required for authenticated APIs). ' +
      'Parameters: requestId (required). overrides (optional): query, headers, body. extract (optional): path. ' +
      'options (optional): context ("server" | "browser", default "server"), timeout (default 15000). ' +
      'Returns: response status, headers, body preview, and extracted data if path specified.',
    inputSchema: z.object({
      requestId: z.string().describe('Request ID from browser.network.search results'),

      overrides: z.object({
        query: z.record(z.any()).optional().describe('Override URL query params, e.g. { "page": 2 }'),
        headers: z.record(z.string()).optional().describe('Override request headers, e.g. { "x-language": "zh" }'),
        body: z.any().optional().describe('Override request body (JSON object will be stringified)'),
      }).optional().describe('Modify request before sending'),

      options: z.object({
        context: z.enum(['server', 'browser']).optional().default('server').describe('"server" (default, no cookies) or "browser" (uses browser session cookies, required for authenticated APIs)'),
        timeout: z.number().optional().default(15000).describe('Request timeout in ms, default 15000'),
      }).optional().describe('Replay options'),

      extract: z.object({
        path: z.string().optional().describe('JSON path to extract, e.g. "data.products[0].name" or "data.list"'),
      }).optional().describe('Extract specific fields from JSON response'),
    }),
  }, async (args) => {
    const { requestId, overrides, extract, options } = args as any;

    // 浏览器上下文模式：通过 Extension 发请求，携带完整 Cookie
    if (options?.context === 'browser') {
      const result = await conn.sendRequest<any>('network_replay_browser', { requestId, overrides, extract });
      if (!result || result.error) return result?.error || 'Replay failed in browser context';
      const output: any = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        body_length: result.body?.length,
        body_preview: result.body?.slice(0, 2000),
      };
      if (result.extracted !== undefined) {
        output.extracted = result.extracted;
        output.extracted_preview = typeof result.extracted === 'object'
          ? JSON.stringify(result.extracted).slice(0, 2000)
          : String(result.extracted).slice(0, 2000);
      }
      return JSON.stringify(output, null, 2);
    }

    // 服务端模式：不携带 Cookie
    const req = await conn.sendRequest<any>('network_get', { requestId });
    if (!req) return 'Request not found';

    let url = req.url;
    const headers: Record<string, string> = { ...req.headers };
    delete headers['Host']; delete headers['Origin']; delete headers['Referer'];
    delete headers['Cookie']; delete headers['User-Agent'];

    if (overrides?.query) {
      const u = new URL(url);
      for (const [k, v] of Object.entries(overrides.query)) { u.searchParams.set(k, String(v)); }
      url = u.toString();
    }
    if (overrides?.headers) { Object.assign(headers, overrides.headers); }

    const rOpts: RequestInit = { method: req.method, headers };
    if (overrides?.body !== undefined) {
      rOpts.body = typeof overrides.body === 'object' ? JSON.stringify(overrides.body) : String(overrides.body);
    } else if (req.postData && req.method !== 'GET') {
      rOpts.body = req.postData;
    }

    try {
      const response = await fetch(url, rOpts);
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });
      let body: string | undefined;
      try { body = await response.text(); } catch { body = undefined; }

      let extracted: any = undefined;
      if (extract?.path && body) {
        try { const json = JSON.parse(body); extracted = resolvePath(json, extract.path); } catch { extracted = undefined; }
      }

      const result: any = {
        status: response.status, statusText: response.statusText, headers: respHeaders,
        body_length: body?.length, body_preview: body?.slice(0, 2000),
      };
      if (extracted !== undefined) {
        result.extracted = extracted;
        result.extracted_preview = typeof extracted === 'object' ? JSON.stringify(extracted).slice(0, 2000) : String(extracted).slice(0, 2000);
      }
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Replay failed: ${(err as Error).message}`;
    }
  });

  // ─── export ───

  defineTool(server, conn, 'browser_network_export', {
    description:
      'Export a cached network request as executable client code. ' +
      'Parameters: requestId (required), format (curl | fetch | python | har), includeHeaders (default true). ' +
      'Returns: formatted code string ready to copy and use.',
    inputSchema: z.object({
      requestId: z.string().describe('Request ID from browser.network.search results'),
      format: z.enum(['curl', 'fetch', 'python', 'har']).describe('Output format: curl command, fetch (JS), python requests, or HAR'),
      includeHeaders: z.boolean().optional().default(true).describe('Include request headers in output'),
    }),
  }, async (args) => {
    const req = await conn.sendRequest<any>('network_get', args);
    if (!req) return 'Request not found';

    const { format, includeHeaders } = args as any;
    switch (format) {
      case 'curl': {
        let cmd = `curl -X ${req.method}`;
        if (includeHeaders) {
          for (const [k, v] of Object.entries(req.headers || {})) {
            cmd += ` \\\n  -H '${k}: ${v}'`;
          }
        }
        if (req.postData) cmd += ` \\\n  -d '${req.postData.replace(/'/g, "\\'")}'`;
        cmd += ` \\\n  '${req.url}'`;
        return cmd;
      }
      case 'fetch': {
        const opts: any = { method: req.method };
        if (includeHeaders && req.headers) opts.headers = req.headers;
        if (req.postData) opts.body = req.postData;
        return `fetch('${req.url}', ${JSON.stringify(opts, null, 2)})`;
      }
      case 'python': {
        let code = `import requests\n\n`;
        code += `url = '${req.url}'\n`;
        if (includeHeaders && req.headers) code += `headers = ${JSON.stringify(req.headers, null, 2)}\n`;
        code += `\nresp = requests.${req.method.toLowerCase()}(url`;
        if (includeHeaders && req.headers) code += `, headers=headers`;
        if (req.postData && req.method !== 'GET') code += `, data='''${req.postData}'''`;
        code += `)\n\nprint(resp.status_code, resp.text[:500])`;
        return code;
      }
      case 'har': {
        return JSON.stringify({
          log: {
            version: '1.2',
            entries: [{
              request: {
                method: req.method, url: req.url,
                headers: Object.entries(req.headers || {}).map(([k, v]) => ({ name: k, value: v })),
                postData: req.postData ? { text: req.postData, mimeType: 'application/x-www-form-urlencoded' } : undefined,
              },
              response: req.response ? {
                status: req.response.status, statusText: req.response.statusText,
                headers: Object.entries(req.response.headers || {}).map(([k, v]) => ({ name: k, value: v })),
                content: { text: req.response.body, mimeType: req.response.mimeType },
              } : {},
              startedDateTime: new Date(req.timestamp).toISOString(),
            }],
          },
        }, null, 2);
      }
      default: return `Unsupported format: ${format}`;
    }
  });

  // ─── analyze ───

  defineTool(server, conn, 'browser_network_analyze', {
    description:
      'Analyze captured network traffic to understand the site API architecture. ' +
      'Groups endpoints by pattern, infers API purpose (search/list/detail/auth/checkout), and generates replay-ready templates. ' +
      'The output is designed to complement the website manual (website-manuals/apis/) for skill learning and reuse. ' +
      'Parameters: tabId (optional, analyzes all if omitted). ' +
      'Returns: summary (total requests, API endpoints found, replayable count), apiCatalog (endpoint, methods, purpose, avgResponseSize, replayTemplate, sampleFields), replayRecommendations.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Tab ID to analyze. Analyzes all monitored tabs if omitted'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ requests: any[]; total: number }>('network_search', { tabId: args.tabId, limit: 500, sort: 'largest' });
    if (!r.requests?.length) return 'No cached requests found. Start monitoring first with browser.start_network_monitor.';

    const endpoints = new Map<string, {
      methods: Set<string>; urls: Set<string>; statusCodes: Set<number>;
      mimeTypes: Set<string>; count: number; totalSize: number;
      sampleResponse?: any; sampleRequest?: any;
    }>();

    for (const req of r.requests) {
      try {
        const url = new URL(req.url);
        const segments = url.pathname.split('/').filter(Boolean);
        const pattern = segments.map((s) => {
          if (/^\d+$/.test(s) || /^[0-9a-f]{8,}-?[0-9a-f]{4,}$/i.test(s)) return '{id}';
          return s;
        }).join('/');
        if (/\.(js|css|png|jpg|gif|svg|woff2?|ttf|eot|ico)$/i.test(url.pathname)) continue;

        const key = `${url.hostname}/${pattern}`;
        if (!endpoints.has(key)) endpoints.set(key, { methods: new Set(), urls: new Set(), statusCodes: new Set(), mimeTypes: new Set(), count: 0, totalSize: 0 });
        const ep = endpoints.get(key)!;
        ep.methods.add(req.method);
        ep.urls.add(req.url);
        if (req.response?.status) ep.statusCodes.add(req.response.status);
        if (req.response?.mimeType) ep.mimeTypes.add(req.response.mimeType);
        ep.count++;
        ep.totalSize += req.response?.bodySize || req.response?.body?.length || 0;
        if (!ep.sampleResponse && req.response?.body) try { ep.sampleResponse = JSON.parse(req.response.body.slice(0, 500)); } catch {}
        if (!ep.sampleRequest) ep.sampleRequest = { url: req.url, method: req.method, headers: req.headers, postData: req.postData };
      } catch {}
    }

    const sortedEndpoints = Array.from(endpoints.entries()).sort((a, b) => b[1].count - a[1].count);
    const apiCatalog = sortedEndpoints
      .filter(([_, ep]) => Array.from(ep.mimeTypes).some(m => m?.includes('json')))
      .map(([pattern, ep]) => {
        const purpose = detectApiPurpose(pattern, ep.sampleResponse, Array.from(ep.methods));
        const sampleUrl = Array.from(ep.urls)[0] || '';
        return {
          endpoint: `/${pattern}`, methods: Array.from(ep.methods), purpose,
          requestCount: ep.count, avgResponseSize: Math.round(ep.totalSize / ep.count),
          statusCodes: Array.from(ep.statusCodes),
          replayTemplate: { url: sampleUrl, method: Array.from(ep.methods)[0], note: 'use network.search to find a requestId' },
          sampleFields: ep.sampleResponse ? Object.keys(ep.sampleResponse).slice(0, 10) : null,
        };
      });

    const replayable = apiCatalog.filter(api => api.methods.includes('GET') && api.purpose !== 'unknown');

    return JSON.stringify({
      summary: { totalRequests: r.total, apiEndpointsFound: apiCatalog.length, replayableEndpoints: replayable.length },
      apiCatalog,
      replayRecommendations: replayable.slice(0, 10).map(api => ({
        endpoint: api.endpoint, purpose: api.purpose,
        example: `browser.network.replay({ requestId: "...", overrides: { query: { page: 1 } }, extract: { path: "data" } })`,
      })),
    }, null, 2);
  });

  // ─── override ───

  defineTool(server, conn, 'browser_network_override', {
    description:
      'Intercept and replace responses for requests matching a URL pattern. ' +
      'Use for testing edge cases: simulate error responses, spoof status codes, inject XSS test payloads, or bypass frontend auth checks. ' +
      'Rules are active until monitoring stops or overrides are cleared. ' +
      'Parameters: tabId (required), action ("set" | "clear" | "list"). For "set": urlPattern (regex), responseBody, statusCode (default 200), responseHeaders (optional). ' +
      'Returns: confirmation or active rule list.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to apply overrides on'),
      action: z.enum(['set', 'clear', 'list']).describe('Action: set (add rule), clear (remove all), list (show active)'),
      urlPattern: z.string().optional().describe('URL regex pattern to match, required for action=set. E.g. "/api/user"'),
      responseBody: z.string().optional().describe('Replacement response body text, required for action=set'),
      statusCode: z.number().optional().describe('Override status code, default 200'),
      responseHeaders: z.record(z.string()).optional().describe('Additional response headers'),
    }),
  }, async (args) => {
    const { tabId, action } = args as any;
    if (action === 'list') {
      const rules = await conn.sendRequest<{ rules: any[] }>('network_override_list', { tabId });
      return JSON.stringify({ activeRules: rules.rules?.length || 0, rules: rules.rules || [] }, null, 2);
    }
    if (action === 'clear') {
      await conn.sendRequest('network_override_clear', { tabId });
      return 'All override rules cleared';
    }
    const { urlPattern, responseBody, statusCode = 200, responseHeaders } = args as any;
    if (!urlPattern || responseBody === undefined) return 'urlPattern and responseBody are required for action=set';
    await conn.sendRequest('network_override_set', { tabId, urlPattern, responseBody, statusCode, responseHeaders });
    return `Override rule set: match "${urlPattern}" -> status ${statusCode}`;
  });
}

// ─── 工具函数 ───

function resolvePath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) { current = current[match[1]]; if (!Array.isArray(current)) return undefined; current = current[parseInt(match[2])]; }
    else { current = current[part]; }
  }
  return current;
}

function detectApiPurpose(pattern: string, sampleResponse: any, methods: string[]): string {
  const lower = pattern.toLowerCase();
  const isRead = methods.includes('GET');
  const isWrite = methods.includes('POST') || methods.includes('PUT') || methods.includes('PATCH');
  const isDelete = methods.includes('DELETE');
  if (isDelete) return 'delete';
  if (isWrite) return isRead ? 'update' : 'create';
  if (lower.includes('search') || lower.includes('query') || lower.includes('find')) return 'search';
  if (lower.includes('list') || lower.includes('feed') || lower.includes('/api/items') || lower.includes('/api/products')) return 'list';
  if (lower.includes('detail') || lower.includes('/api/') && /\/\{id\}$/.test(pattern)) return 'detail';
  if (lower.includes('login') || lower.includes('auth') || lower.includes('token')) return 'auth';
  if (lower.includes('comment') || lower.includes('review')) return 'comment';
  if (lower.includes('order') || lower.includes('checkout') || lower.includes('cart')) return 'checkout';
  if (lower.includes('upload') || lower.includes('image') || lower.includes('file')) return 'upload';
  if (lower.includes('config') || lower.includes('setting') || lower.includes('preference')) return 'config';
  if (lower.includes('notification') || lower.includes('notify') || lower.includes('message')) return 'notification';
  if (sampleResponse) {
    const keys = Object.keys(sampleResponse);
    if (keys.some(k => k.includes('total') || k.includes('count') || k.includes('page'))) return 'paginatedList';
    if (keys.some(k => k.includes('token') || k.includes('session'))) return 'auth';
    if (keys.some(k => k.includes('items') || k.includes('data') || k.includes('results') || k.includes('list'))) return 'list';
    if (keys.some(k => k.includes('id') && keys.length < 5)) return 'detail';
  }
  return isRead ? 'read' : 'write';
}
