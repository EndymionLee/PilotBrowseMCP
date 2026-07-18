/**
 * Extension WebSocket 传输层
 *
 * 职责:
 * 1. 启动 WebSocket 服务器，等待 Extension 连接
 * 2. 管理请求/响应映射（requestId -> pending promise）
 * 3. 心跳检测（保持连接活跃）
 * 4. 自动重连
 * 5. 事件推送（Extension -> Server）
 */
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// ---- 类型 ----

interface RequestMessage {
  type: 'request';
  id: string;
  method: string;
  params?: unknown;
}

interface ResponseMessage {
  type: 'response';
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

type ExtensionEvent =
  | { type: 'registered' }
  | ResponseMessage
  | { type: 'event'; event: string; data: unknown }
  | { type: 'network_request'; data: unknown }
  | { type: 'network_response'; data: unknown }
  | { type: 'dom_mutation'; data: unknown };

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

// ---- Connection ----

export class ExtensionConnection {
  private wss: WebSocketServer;
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private reqCounter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventListeners = new Map<string, Set<(data: unknown) => void>>();

  /** 连接状态 */
  private _connected = false;
  get connected(): boolean {
    return this._connected;
  }

  constructor() {
    this.wss = new WebSocketServer({ port: config.wsPort });
    this.setup();
  }

  // ---- 设置 ----

  private setup(): void {
    this.wss.on('listening', () => {
      logger.info('Transport', `WebSocket 已启动`, { port: config.wsPort });
    });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Transport', 'Extension 已连接');
      this.ws = ws;
      this._connected = true;
      this.startHeartbeat();

      ws.on('message', (data: Buffer) => {
        try {
          const msg: ExtensionEvent = JSON.parse(data.toString());
          this.dispatch(msg);
        } catch (err) {
          logger.error('Transport', '消息解析失败', { error: String(err) });
        }
      });

      ws.on('close', () => {
        logger.info('Transport', 'Extension 已断开');
        this.ws = null;
        this._connected = false;
        this.stopHeartbeat();
        this.rejectAll('Extension 已断开连接');
      });

      ws.on('error', (err) => {
        logger.error('Transport', 'WebSocket 连接错误', { error: err.message });
      });
    });

    this.wss.on('error', (err) => {
      logger.error('Transport', 'WebSocket 服务器错误', { error: err.message });
    });
  }

  // ---- 心跳 ----

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ---- 消息派发 ----

  private dispatch(msg: ExtensionEvent): void {
    switch (msg.type) {
      case 'response': {
        const pending = this.pending.get(msg.id);
        if (!pending) {
          logger.warn('Transport', `收到未知请求的响应`, { id: msg.id });
          return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
        break;
      }
      case 'registered':
        logger.info('Transport', 'Extension 注册完成');
        this.emit('extension_ready', null);
        break;
      case 'event':
        this.emit(msg.event, msg.data);
        break;
      case 'network_request':
      case 'network_response':
      case 'dom_mutation':
        this.emit(msg.type, msg.data);
        break;
    }
  }

  // ---- 发送请求 ----

  async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this._connected || !this.ws) {
      throw new Error('Extension 未连接');
    }

    const id = `req_${++this.reqCounter}_${Date.now().toString(36)}`;
    const msg: RequestMessage = { type: 'request', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`请求超时: ${method}`));
      }, config.requestTimeout);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, method });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  // ---- 事件订阅 ----

  on(event: string, handler: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: string, handler: (data: unknown) => void): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: string, data: unknown): void {
    this.eventListeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        logger.error('Transport', `事件处理器异常`, { event, error: String(err) });
      }
    });
  }

  // ---- 等待连接 ----

  waitForConnection(timeout = config.wsConnectionTimeout): Promise<void> {
    if (this._connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('等待 Extension 连接超时')), timeout);
      this.on('extension_ready', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  // ---- 清理 ----

  private rejectAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  close(): void {
    this.stopHeartbeat();
    this.rejectAll('Server 关闭');
    this.ws?.close();
    this.wss.close();
    this.eventListeners.clear();
    logger.info('Transport', 'Transport 已关闭');
  }
}
