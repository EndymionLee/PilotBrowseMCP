/**
 * 共享消息协议 - Background <-> Content Script <-> MCP Server
 */

// Background -> MCP Server
export interface RequestMessage {
  type: 'request';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseMessage {
  type: 'response';
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

// Background -> MCP Server (push)
export type OutgoingMessage =
  | { type: 'registered' }
  | ResponseMessage
  | { type: 'event'; event: string; data: unknown }
  | { type: 'network_request'; data: unknown }
  | { type: 'network_response'; data: unknown }
  | { type: 'dom_mutation'; data: unknown }
  | { type: 'tab_updated'; data: { tabId: number; url?: string; title?: string } };

// Background <-> Content Script
export interface ContentScriptMessage {
  source: 'browser-mcp-bg' | 'browser-mcp-content';
  method: string;
  params?: Record<string, unknown>;
  type?: string;
  data?: unknown;
  error?: string;
}
