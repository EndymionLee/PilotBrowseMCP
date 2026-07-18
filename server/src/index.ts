/**
 * Pilot Browse MCP - Server Entry
 *
 * Bootstrap:
 *  1. 创建 MCP Server
 *  2. 创建 WebSocket Transport（等待 Extension 连接）
 *  3. 注册所有工具
 *  4. 连接 MCP stdio transport
 */
import { createServer, startServer } from './lib/mcp-server.js';
import { ExtensionConnection } from './transport/extension-ws.js';
import { registerAllTools } from './tools/index.js';
import { setLogLevel } from './lib/logger.js';
import { logger } from './lib/logger.js';
import { config } from './config.js';
import fs from 'fs/promises';
import path from 'path';

async function main(): Promise<void> {
  if (config.debug) {
    setLogLevel('DEBUG');
  }

  // 1. Extension WebSocket 连接
  const conn = new ExtensionConnection();

  // 暂存用户录制的原始操作数据（Agent 处理后生成正式 workflow）
  conn.on('save_workflow', async (raw: any) => {
    const d = raw?.data || raw;
    if (!d?.description) return;

    const { description, url, title, steps } = d;
    const safeName = description.replace(/[^a-zA-Z0-9一-龥_-]/g, '_').slice(0, 40) || `recording_${Date.now().toString(36)}`;
    let siteDir = 'unknown';
    try { if (url) siteDir = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; } catch {}

    const recording = { name: safeName, description, url, title, site: siteDir, steps: steps ?? [], recordedAt: new Date().toISOString() };

    const recordingsDir = path.resolve('recordings');
    await fs.mkdir(recordingsDir, { recursive: true });
    await fs.writeFile(path.join(recordingsDir, `${safeName}.json`), JSON.stringify(recording, null, 2), 'utf-8');
    logger.info('Workflow', '收到录制', { name: safeName, site: siteDir, steps: steps?.length ?? 0 });
  });

  // 监听用户标记的元素
  conn.on('save_element', async (raw: any) => {
    const d = raw?.data || raw;
    if (!d?.description || !d?.selector) return;
    const { description, selector, url, text, ariaLabel, placeholder } = d;
    let siteDir = 'unknown';
    try { if (url) siteDir = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; } catch {}

    const safeName = description.replace(/[^a-zA-Z0-9一-龥_-]/g, '_').slice(0, 40);
    const elDir = path.resolve('picked-elements');
    await fs.mkdir(elDir, { recursive: true });
    await fs.writeFile(path.join(elDir, `${safeName}.json`), JSON.stringify({
      description, selector, text, ariaLabel, placeholder, site: siteDir, url, pickedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
    logger.info('Workflow', '收到标记元素', { name: safeName, site: siteDir, selector });
  });

  // 监听关闭信号（从扩展弹窗触发）
  conn.on('shutdown', () => {
    logger.info('Server', '收到关闭信号');
    setTimeout(() => process.exit(0), 100);
  });

  // 2. MCP Server
  const server = createServer();

  // 3. 注册工具
  registerAllTools(server, conn);

  // 4. 启动 MCP (stdio)
  await startServer(server);
}

main().catch((err) => {
  console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
