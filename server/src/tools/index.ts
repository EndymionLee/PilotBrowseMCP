/**
 * 工具注册聚合
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExtensionConnection } from '../transport/extension-ws.js';

import { registerBrowserTools } from './browser.js';
import { registerContentTools } from './content.js';
import { registerDomTools } from './dom.js';
import { registerNetworkTools } from './network.js';
import { registerSecurityTools } from './security.js';
import { registerFindTools } from './find.js';
import { registerFileTools } from './files.js';
import { registerWorkflowTools } from './workflow.js';

export function registerAllTools(server: McpServer, conn: ExtensionConnection): void {
  registerBrowserTools(server, conn);
  registerContentTools(server, conn);
  registerDomTools(server, conn);
  registerNetworkTools(server, conn);
  registerSecurityTools(server, conn);
  registerFindTools(server, conn);
  registerFileTools(server, conn);
  registerWorkflowTools(server, conn);
}
