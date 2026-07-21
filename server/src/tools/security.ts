import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';
import { defineTool } from '../lib/tool-factory.js';

export function registerSecurityTools(server: McpServer, conn: ExtensionConnection): void {
  defineTool(server, conn, 'browser_permissions_list', {
    description: 'Check current permission state. Returns granted and pending sensitive operations. When a sensitive API returns a permission error, use this tool to check state, then ask the user to grant permissions via the extension popup. Parameters: none. Returns: object with granted (string array), pending (string array), all (string array).',
    inputSchema: z.object({}),
  }, async () => {
    const result = await conn.sendRequest<{ granted: string[]; pending: string[]; all: string[] }>('permissions_list');
    return result;
  });

  defineTool(server, conn, 'browser_permissions_grant', {
    description: 'Grant a permission for a sensitive operation. Supported: cookies, local_storage, screenshot, get_html. Parameters: action (required, string: cookies | local_storage | screenshot | get_html). Returns: confirmation.',
    inputSchema: z.object({
      action: z.enum(['cookies', 'local_storage', 'screenshot', 'get_html']).describe('Permission to grant'),
    }),
  }, async (args) => {
    return conn.sendRequest('permissions_grant', args);
  });

  defineTool(server, conn, 'browser_permissions_revoke', {
    description: 'Revoke a previously granted permission. Parameters: action (required, string: cookies | local_storage | screenshot | get_html). Returns: confirmation.',
    inputSchema: z.object({
      action: z.enum(['cookies', 'local_storage', 'screenshot', 'get_html']).describe('Permission to revoke'),
    }),
  }, async (args) => {
    return conn.sendRequest('permissions_revoke', args);
  });
}
