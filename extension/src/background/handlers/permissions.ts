/**
 * 权限管理处理器 - 供 MCP Server 查询和修改权限
 */
import type { Router } from '../router.js';
import { permissionStore, PermissionStore, type PermissionAction } from '../permissions.js';

export function registerPermissionHandlers(router: Router): void {
  // 查询已授权列表
  router.register('permissions_list', async (_params, respond) => {
    const granted = await permissionStore.getGranted();
    const allSensitive = PermissionStore.listSensitive();
    respond({
      granted,
      pending: allSensitive.filter((a) => !granted.includes(a)),
      all: allSensitive,
    });
  });

  // 授权某个操作
  router.register('permissions_grant', async (params, respond) => {
    const action = (params as { action: PermissionAction }).action;
    if (!PermissionStore.listSensitive().includes(action)) {
      respond(undefined, { code: -1, message: `未知权限: ${action}` });
      return;
    }
    await permissionStore.grant(action);
    respond({ success: true, action, granted: true });
  });

  // 撤销某个操作
  router.register('permissions_revoke', async (params, respond) => {
    const action = (params as { action: PermissionAction }).action;
    await permissionStore.revoke(action);
    respond({ success: true, action, revoked: true });
  });
}
