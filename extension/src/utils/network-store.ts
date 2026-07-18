/**
 * NetworkStore - 网络请求/响应缓存
 *
 * 通过 chrome.debugger API 拦截并存储所有网络请求和响应。
 * 支持:
 * - 按 URL、方法、状态码、关键词搜索
 * - 请求重放
 * - 分页/限制
 */

export interface StoredRequest {
  id: string;
  tabId: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  response?: StoredResponse;
}

export interface StoredResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  bodySize?: number;
  mimeType: string;
  timestamp: number;
}

export interface NetworkSearchParams {
  tabId?: number;
  keyword?: string;
  urlPattern?: string;
  method?: string;
  statusCode?: number;
  mimeType?: string;
  limit?: number;
  offset?: number;
}

export interface NetworkSearchResult {
  requests: StoredRequest[];
  total: number;
}

export class NetworkStore {
  /** requestId (Chrome Debugger) -> StoredRequest */
  private requests = new Map<string, StoredRequest>();

  /** tabId -> requestId[] 索引，方便按标签页查询 */
  private tabIndex = new Map<number, string[]>();

  /** 按时间排序的 requestId 列表 */
  private timeOrder: string[] = [];

  /** 最大缓存条数 */
  private maxEntries: number;

  /** 当前正在等待 body 的请求 */
  private pendingBody = new Map<string, StoredRequest>();

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  // ==== 事件处理 ====

  /**
   * 处理 Network.requestWillBeSent
   */
  onRequestWillBeSent(tabId: number, params: any): void {
    const { requestId, request, timestamp, type } = params;
    if (!requestId || !request) return;

    const stored: StoredRequest = {
      id: requestId,
      tabId,
      url: request.url ?? '',
      method: request.method ?? 'GET',
      headers: request.headers ?? {},
      postData: request.postData,
      timestamp: (timestamp ?? Date.now()) * 1000,
    };

    // 只存储可获取 body 的请求类型
    const storeTypes = ['XHR', 'Fetch', 'Document', 'Script'];
    if (type && storeTypes.includes(type)) {
      this.pendingBody.set(requestId, stored);
    }

    this.addRequest(requestId, stored);
  }

  /**
   * 处理 Network.responseReceived
   */
  onResponseReceived(tabId: number, params: any): void {
    const { requestId, response, timestamp } = params;
    if (!requestId || !response) return;

    const existing = this.requests.get(requestId);
    if (!existing) return;

    existing.response = {
      status: response.status ?? 0,
      statusText: response.statusText ?? '',
      headers: response.headers ?? {},
      mimeType: response.mimeType ?? '',
      bodySize: response.encodedDataLength,
      timestamp: (timestamp ?? Date.now()) * 1000,
    };
  }

  /**
   * 处理 Network.loadingFinished
   * 此时可以获取响应体
   */
  async onLoadingFinished(
    tabId: number,
    params: any,
    getBody: (requestId: string) => Promise<{ body: string; base64Encoded: boolean }>,
  ): Promise<void> {
    const { requestId } = params;
    const pending = this.pendingBody.get(requestId);
    if (!pending) return;

    this.pendingBody.delete(requestId);

    try {
      const result = await getBody(requestId);
      const stored = this.requests.get(requestId);
      if (stored && stored.response) {
        stored.response.body = result.body;
        stored.response.bodySize = result.body.length;
      }
    } catch {
      // getResponseBody 在某些请求上会失败（如 data: URL, 已重定向的请求等）
    }
  }

  /**
   * 处理 Network.loadingFailed
   */
  onLoadingFailed(tabId: number, params: any): void {
    const { requestId } = params;
    this.pendingBody.delete(requestId);
  }

  // ==== 内部方法 ====

  private addRequest(requestId: string, request: StoredRequest): void {
    // 检查是否超过上限，移除最旧的
    if (this.requests.size >= this.maxEntries) {
      const oldest = this.timeOrder.shift();
      if (oldest) {
        const oldReq = this.requests.get(oldest);
        this.requests.delete(oldest);
        if (oldReq) {
          const idx = this.tabIndex.get(oldReq.tabId);
          if (idx) {
            const pos = idx.indexOf(oldest);
            if (pos >= 0) idx.splice(pos, 1);
          }
        }
      }
    }

    this.requests.set(requestId, request);
    this.timeOrder.push(requestId);

    // 更新 tab 索引
    let idx = this.tabIndex.get(request.tabId);
    if (!idx) {
      idx = [];
      this.tabIndex.set(request.tabId, idx);
    }
    idx.push(requestId);
  }

  // ==== 查询方法 ====

  /**
   * 搜索缓存的网络请求
   */
  search(params: NetworkSearchParams): NetworkSearchResult {
    const {
      tabId,
      keyword,
      urlPattern,
      method,
      statusCode,
      mimeType,
      limit = 50,
      offset = 0,
    } = params;

    let candidates: StoredRequest[];

    if (tabId !== undefined) {
      const ids = this.tabIndex.get(tabId) ?? [];
      candidates = ids.map((id) => this.requests.get(id)).filter(Boolean) as StoredRequest[];
    } else {
      candidates = Array.from(this.requests.values());
    }

    // 按时间倒序（最新的在前）
    candidates.sort((a, b) => b.timestamp - a.timestamp);

    // 筛选条件
    const filtered = candidates.filter((req) => {
      if (method && req.method.toUpperCase() !== method.toUpperCase()) return false;
      if (statusCode !== undefined && req.response?.status !== statusCode) return false;
      if (mimeType && req.response?.mimeType && !req.response.mimeType.includes(mimeType)) return false;

      if (urlPattern) {
        try {
          const re = new RegExp(urlPattern, 'i');
          if (!re.test(req.url)) return false;
        } catch {
          // 非正则时按字符串包含匹配
          if (!req.url.toLowerCase().includes(urlPattern.toLowerCase())) return false;
        }
      }

      if (keyword) {
        const kw = keyword.toLowerCase();
        const urlMatch = req.url.toLowerCase().includes(kw);
        const bodyMatch = req.response?.body?.toLowerCase().includes(kw);
        const headerMatch = Object.entries(req.headers).some(
          ([k, v]) => k.toLowerCase().includes(kw) || v.toLowerCase().includes(kw),
        );
        if (!urlMatch && !bodyMatch && !headerMatch) return false;
      }

      return true;
    });

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return { requests: paged, total };
  }

  /**
   * 按 requestId 获取单个请求
   */
  get(requestId: string): StoredRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * 清除指定标签页的缓存
   */
  clearTab(tabId: number): void {
    const ids = this.tabIndex.get(tabId);
    if (!ids) return;

    for (const id of ids) {
      this.requests.delete(id);
      const pos = this.timeOrder.indexOf(id);
      if (pos >= 0) this.timeOrder.splice(pos, 1);
      this.pendingBody.delete(id);
    }
    this.tabIndex.delete(tabId);
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.requests.clear();
    this.tabIndex.clear();
    this.timeOrder = [];
    this.pendingBody.clear();
  }

  /**
   * 当前缓存请求数
   */
  get size(): number {
    return this.requests.size;
  }
}
