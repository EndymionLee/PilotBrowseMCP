/**
 * 权限管理 - PermissionStore
 *
 * 敏感操作需要用户授权后才能执行:
 *   - cookies: 读取 Cookie
 *   - local_storage: 读取 LocalStorage
 *   - screenshot: 截图
 *   - get_html: 获取页面 HTML
 *
 * 授权模式:
 *   1. 首次调用敏感 API -> 返回 permission_denied 错误
 *   2. 用户在 Popup 中查看并授权
 *   3. 授权后同一 session 内不再提示
 *
 * 权限存储在 chrome.storage.local，跨会话持久化。
 */

export type PermissionAction = 'cookies' | 'local_storage' | 'screenshot' | 'get_html';

const SENSITIVE_ACTIONS: PermissionAction[] = ['cookies', 'local_storage', 'screenshot', 'get_html'];

const STORAGE_KEY = 'browser_mcp_permissions';

interface PermissionState {
  granted: PermissionAction[];
  updatedAt: string;
}

export class PermissionStore {
  private state: PermissionState = { granted: [], updatedAt: '' };
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        this.state = result[STORAGE_KEY];
      }
      this.loaded = true;
    } catch (err) {
      console.error('[Permission] 加载失败:', err);
      this.loaded = true;
    }
  }

  private async save(): Promise<void> {
    this.state.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEY]: this.state });
  }

  /** 检查某个操作是否已授权 */
  async isGranted(action: PermissionAction): Promise<boolean> {
    if (!this.loaded) await this.init();
    return this.state.granted.includes(action);
  }

  /** 检查操作是否需要授权（是否为敏感操作） */
  static isSensitive(method: string): PermissionAction | null {
    if (method === 'get_cookies') return 'cookies';
    if (method === 'get_local_storage') return 'local_storage';
    if (method === 'screenshot') return 'screenshot';
    if (method === 'get_html') return 'get_html';
    return null;
  }

  /** 授予某个操作的权限 */
  async grant(action: PermissionAction): Promise<void> {
    if (!this.loaded) await this.init();
    if (!this.state.granted.includes(action)) {
      this.state.granted.push(action);
      await this.save();
    }
  }

  /** 撤销某个操作的权限 */
  async revoke(action: PermissionAction): Promise<void> {
    if (!this.loaded) await this.init();
    this.state.granted = this.state.granted.filter((a) => a !== action);
    await this.save();
  }

  /** 获取所有已授权的操作 */
  async getGranted(): Promise<PermissionAction[]> {
    if (!this.loaded) await this.init();
    return [...this.state.granted];
  }

  /** 获取所有敏感操作列表 */
  static listSensitive(): PermissionAction[] {
    return [...SENSITIVE_ACTIONS];
  }
}

export const permissionStore = new PermissionStore();
