/**
 * WebSocket 客户端 - 管理与 MCP Server 的连接
 *
 * 增强:
 * - chrome.alarms 保活（解决 MV3 Service Worker 休眠问题）
 * - 指数退避重连
 * - 状态持久化（SW 重启后恢复连接）
 */
import type { OutgoingMessage } from '../shared/protocol.js';

const ALARM_NAME = 'browser-mcp-keepalive';
const STORAGE_KEY = 'ws_url';

type MessageHandler = (data: Record<string, unknown>) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30000;
  private readonly baseReconnectDelay = 1000;
  private messageHandler: MessageHandler | null = null;
  private _connected = false;
  private destroyed = false;

  get connected(): boolean {
    return this._connected;
  }

  constructor(private url: string) {}

  async init(): Promise<void> {
    this.destroyed = false;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.url });
    } catch { /* ignore */ }

    this.startKeepalive();
    this.forceReconnect(); // 立即强制重连（清理旧状态）
  }

  /** 强制重连：清理旧连接状态，立即重试 */
  private forceReconnect(): void {
    this.cancelReconnect();
    // 清理可能残留的旧连接
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onopen = null;
        this.ws.close();
      } catch { /* ignore */ }
      this.ws = null;
    }
    this._connected = false;
    this.connect();
  }

  connect(): void {
    if (this.destroyed) return;
    // 如果已有连接，不重复创建
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error('[WS] 创建失败:', err);
      this.scheduleReconnect();
      return;
    }

    const onOpen = () => {
      console.log('[WS] 已连接到 MCP Server');
      this._connected = true;
      this.reconnectAttempts = 0;
      this.send({ type: 'registered' });
      this.onStatusChange?.(true);
    };

    const onClose = () => {
      console.log('[WS] 断开连接');
      this._connected = false;
      this.ws = null;
      this.onStatusChange?.(false);
      if (!this.destroyed) this.scheduleReconnect();
    };

    const onError = () => {
      // onclose 会随后触发，但有些情况 onclose 不会触发，手动触发
      // 加个兜底：如果 5 秒后还没连接上，主动重连
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.messageHandler?.(data);
      } catch (err) {
        console.error('[WS] 消息解析失败:', err);
      }
    };

    this.ws.onopen = onOpen;
    this.ws.onclose = onClose;
    this.ws.onerror = onError;
    this.ws.onmessage = onMessage;
  }

  onStatusChange: ((connected: boolean) => void) | null = null;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  send(msg: OutgoingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.destroyed = true;
    this.cancelReconnect();
    this.stopKeepalive();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  // ==== 保活 =====

  private startKeepalive(): void {
    try {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.25 }); // 每 15 秒
    } catch { /* ignore */ }
  }

  private stopKeepalive(): void {
    try {
      chrome.alarms.clear(ALARM_NAME);
    } catch { /* ignore */ }
  }

  /** 由 Service Worker 的 onAlarm 回调调用 */
  onAlarm(): void {
    if (this.destroyed) return;

    if (this._connected) {
      // 已连接，发个心跳确认连接真实可用
      // 如果 WebSocket 实际已断开但状态没更新，send 会静默失败
      if (this.ws?.readyState !== WebSocket.OPEN) {
        console.log('[WS] 检测到连接异常，强制重连');
        this.forceReconnect();
      }
      return;
    }

    // 未连接，尝试重连
    console.log('[WS] 保活触发重连');
    this.forceReconnect();
  }

  // ==== 重连 =====

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.destroyed) return;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  static async restore(): Promise<WsClient | null> {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      if (data[STORAGE_KEY]) {
        const client = new WsClient(data[STORAGE_KEY]);
        await client.init();
        return client;
      }
    } catch { /* ignore */ }
    return null;
  }
}
