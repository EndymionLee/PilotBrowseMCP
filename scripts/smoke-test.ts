/**
 * Smoke Test - 验证 MCP Server 和 Extension 通信
 *
 * 用法:
 *   1. 启动 MCP Server:  cd server && node dist/index.js
 *   2. 运行本测试:       npx tsx scripts/smoke-test.ts
 *
 * 该测试模拟 MCP Client 连接 Server，检查工具注册和基本功能。
 * 需要 Extension 已连接才能通过全部测试。
 */
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = resolve(__dirname, '../server/dist/index.js');

// ---- 测试框架 ----

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    failed++;
  }
}

// ---- MCP Client 模拟 ----

class McpTestClient {
  private process: ReturnType<typeof spawn> | null = null;
  private buffer = '';
  private pending = new Map<string, (result: any) => void>();
  private msgId = 0;

  async start(serverPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // 读取 stderr（Server 日志）
      this.process.stderr!.on('data', (data: Buffer) => {
        // 不输出，只用于调试
      });

      // 读取 stdout（MCP 消息）
      this.process.stdout!.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.on('error', reject);

      // 等待 Server 就绪
      setTimeout(() => resolve(), 2000);
    });
  }

  private processBuffer(): void {
    // MCP 消息以 \n 分隔
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg);
          this.pending.delete(msg.id);
        }
      } catch {
        // 忽略非 JSON 行
      }
    }
  }

  async send(method: string, params?: any): Promise<any> {
    const id = `test_${++this.msgId}`;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`超时: ${method}`));
      }, 10000);

      this.pending.set(id, (result: any) => {
        clearTimeout(timeout);
        resolve(result);
      });

      this.process!.stdin!.write(msg);
    });
  }

  async listTools(): Promise<string[]> {
    const response = await this.send('tools/list');
    return (response.result?.tools ?? []).map((t: any) => t.name);
  }

  async callTool(name: string, args?: any): Promise<any> {
    const response = await this.send('tools/call', { name, arguments: args });
    return response.result;
  }

  stop(): void {
    this.process?.kill();
  }
}

// ---- 测试用例 ----

async function runTests(): Promise<void> {
  console.log('='.repeat(50));
  console.log('  Pilot Browse MCP - Smoke Test');
  console.log('='.repeat(50));
  console.log();

  const client = new McpTestClient();

  try {
    console.log('[1] 启动 MCP Server...');
    await client.start(SERVER_SCRIPT);
    console.log('  启动完成');
    console.log();

    // ---- Test 1: 工具注册 ----
    console.log('[2] 验证工具注册...');
    const tools = await client.listTools();
    const expectedTools = [
      'browser_list_tabs',
      'browser_list_frames',
      'browser_open',
      'browser_navigate',
      'browser_reload',
      'browser_wait_for_load',
      'browser_network_export_cache',
      'browser_close',
      'browser_activate',
      'browser_screenshot',
      'browser_get_markdown',
      'browser_get_html',
      'browser_get_text',
      'browser_extract_article',
      'browser_extract_table',
      'browser_extract_links',
      'browser_extract_images',
      'browser_query',
      'browser_click',
      'browser_type',
      'browser_scroll',
      'browser_wait',
      'browser_wait_for_element',
      'browser_cookies',
      'browser_local_storage',
      'browser_start_network_monitor',
      'browser_stop_network_monitor',
      'browser_network_export',
      'browser_network_search',
      'browser_network_replay',
      'browser_permissions_list',
      'browser_permissions_grant',
      'browser_permissions_revoke',
      'browser_current_page',
      'browser_inspect_page',
      'browser_find',
      'browser_save_content',
      'browser_save_xpath',
      'sql_injection_list_findings',
      'sql_injection_get_finding',
      'sql_injection_scan',
      'sql_injection_request',
      'sql_injection_stop',
      'sql_injection_update_finding',
      'sql_injection_generate_script',
      'js_extract',
      'js_analyze',
      'js_find_function',
      'js_trace_request',
      'js_capability_query',
      'js_reverse',
      'js_hook',
      'js_hook_collect',
    ];

    let allFound = true;
    for (const name of expectedTools) {
      if (!tools.includes(name)) {
        console.log(`  [MISS] ${name}`);
        allFound = false;
      }
    }
    assert(allFound, `所有 ${expectedTools.length} 个工具已注册 (实际: ${tools.length})`);

    if (!allFound) {
      console.log('\n  已注册的工具:');
      for (const t of tools.sort()) console.log(`    - ${t}`);
    }
    console.log();

    // ---- Test 2: browser.wait ----
    console.log('[3] 测试 browser.wait (无需 Extension 也能运行)...');
    try {
      const start = Date.now();
      await client.callTool('browser_wait', { ms: 200 });
      const elapsed = Date.now() - start;
      assert(elapsed >= 150, `wait 200ms 实际等待 ${elapsed}ms`);
    } catch (err) {
      assert(false, `browser.wait 调用成功: ${err}`);
    }
    console.log();

    // ---- Test 3: 权限工具 ----
    console.log('[4] 测试 browser.permissions.* (等待 Extension 连接)...');

    // 等待扩展连接，最多 15 秒
    let permissionResult = null;
    let lastError = '';
    for (let i = 0; i < 15; i++) {
      try {
        permissionResult = await client.callTool('browser_permissions_list', {});
        if (permissionResult?.content?.[0]?.text && !permissionResult.isError) {
          console.log(`  尝试 ${i + 1}: 成功`);
          break;
        }
        if (permissionResult?.content?.[0]?.text) {
          lastError = permissionResult.content[0].text.slice(0, 100);
        }
      } catch (err: any) {
        lastError = err.message?.slice(0, 100) ?? String(err);
      }
      process.stdout.write(`.(${lastError})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log();

    if (permissionResult?.content?.[0]?.text && !permissionResult.isError) {
      assert(true, '扩展已连接，browser.permissions.list 返回了结果');
      try {
        console.log(`  返回预览: ${permissionResult.content[0].text.slice(0, 200)}`);
      } catch {}
    } else {
      console.log('  [INFO] 扩展未能连接，跳过测试 (扩展加载了吗?)');
    }
    console.log();

    // ---- 结果汇总 ----
    console.log('='.repeat(50));
    console.log(`  结果: ${passed} 通过, ${failed} 失败`);
    console.log('='.repeat(50));
    console.log();
    console.log('注意:');
    console.log('  - 工具注册测试不依赖 Extension');
    console.log('  - browser.wait 测试不依赖 Extension');
    console.log('  - 权限和其他工具需要 Extension 连接');
    console.log('  - 完整测试请加载 Extension 后重试');

  } catch (err) {
    console.error('测试异常:', err);
  } finally {
    client.stop();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
