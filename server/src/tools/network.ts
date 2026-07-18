import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerNetworkTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser.start_network_monitor', {
    description: 'Start monitoring network requests for a tab. All XHR/Fetch requests and responses are cached for later search and replay. Use before interacting with the page to capture API calls. Each tab needs separate monitoring.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to monitor. Get it from browser.list_tabs first'),
    }),
  }, async (args) => {
    await conn.sendRequest('start_network_monitor', args);
    return `Started monitoring tab ${args.tabId}`;
  });

  defineTool(server, conn, 'browser.stop_network_monitor', {
    description: 'Stop monitoring network requests for a tab and clear cached data.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID to stop monitoring'),
    }),
  }, async (args) => {
    await conn.sendRequest('stop_network_monitor', args);
    return `Stopped monitoring tab ${args.tabId}`;
  });

  defineTool(server, conn, 'browser.get_network_logs', {
    description: 'Get cached network request logs. Backward-compatible, prefer browser.network.search for more options.',
    inputSchema: z.object({
      tabId: z.number().describe('Tab ID'),
      filter: z.string().optional().describe('URL keyword filter'),
      limit: z.number().optional().default(50),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ requests: unknown[]; total: number }>('get_network_logs', {
      tabId: args.tabId, keyword: args.filter, limit: args.limit,
    });
    return `Total: ${r.total}, showing ${r.requests.length}\n${JSON.stringify(r.requests, null, 2)}`;
  });

  defineTool(server, conn, 'browser.network.search', {
    description: 'Search cached network requests. Modern SPAs (React, Vue) load data through XHR/Fetch APIs, not in the HTML. This tool helps you discover those API endpoints and their response data. Filter by URL keyword, response body content, HTTP method, status code, or MIME type. Perfect for finding product data, lists, search results hidden in API calls.',
    inputSchema: z.object({
      tabId: z.number().optional().describe('Limit search to a specific tab. Searches all monitored tabs if omitted'),
      keyword: z.string().optional().describe('Search keyword in URL, response body, or request headers'),
      urlPattern: z.string().optional().describe('URL pattern filter. Supports regex, e.g. "/api/product" or "product|list"'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('HTTP method filter'),
      statusCode: z.number().optional().describe('HTTP status code filter, e.g. 200, 404, 500'),
      mimeType: z.string().optional().describe('MIME type filter, e.g. "application/json" for APIs'),
      limit: z.number().optional().default(20).describe('Max results, default 20'),
      offset: z.number().optional().default(0).describe('Pagination offset'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ requests: any[]; total: number }>('network_search', args);
    const results = r.requests.map((req: any) => ({
      id: req.id, method: req.method, url: req.url,
      status: req.response?.status, mime: req.response?.mimeType,
      size: req.response?.bodySize,
      body_preview: req.response?.body?.slice(0, 500),
    }));
    return JSON.stringify({ total: r.total, results }, null, 2);
  });

  defineTool(server, conn, 'browser.network.replay', {
    description: 'Replay a cached network request. Uses the same URL, method, and headers to make a fresh request and return the latest response. Use cases: refresh data after discovering an API, paginate through results, get updated information. Note: cookies and Authorization headers are not included in the replay.',
    inputSchema: z.object({
      requestId: z.string().describe('Request ID from browser.network.search results'),
    }),
  }, async (args) => {
    const r = await conn.sendRequest<{ status: number; statusText: string; headers: Record<string, string>; body?: string }>('network_replay', args);
    return JSON.stringify({
      status: r.status, statusText: r.statusText, headers: r.headers,
      body_preview: r.body?.slice(0, 2000), body_length: r.body?.length,
    }, null, 2);
  });
}
