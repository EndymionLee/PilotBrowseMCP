import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scanner } from './scanner.js';

class MockConn {
  private requests: Record<string, any>;
  constructor(requests: Record<string, any>) { this.requests = requests; }
  async sendRequest<T = unknown>(method: string, params?: any): Promise<T> {
    if (method === 'network_get') {
      const req = this.requests[params.requestId];
      if (!req) throw new Error('not found');
      return req as T;
    }
    if (method === 'network_replay_browser') {
      const o = params.overrides ?? {};
      const query = o.query ?? {};
      const value = Object.values(query)[0] ?? o.body?.keyword ?? o.body ?? '';
      if (typeof value === 'string' && value.includes("'")) {
        return { status: 500, headers: {}, body: "You have an error in your SQL syntax near '1'" } as T;
      }
      if (typeof value === 'string' && value.includes('SLEEP')) {
        return { status: 200, headers: {}, body: '{"ok":1}' } as T;
      }
      return { status: 200, headers: {}, body: '{"items":[]}' } as T;
    }
    if (method === 'http_request') {
      const query = params.query ?? {};
      const value = Object.values(query)[0] ?? '';
      // union 攻击模拟：ORDER BY N≤3 正常、N≥4 报错（列数 3）；UNION 含 VAULN 回显；单引号报错
      const orderMatch = typeof value === 'string' ? value.match(/ORDER BY (\d+)/) : null;
      if (orderMatch) {
        const n = Number(orderMatch[1]);
        return (n > 3
          ? { status: 500, headers: {}, body: "You have an error in your SQL syntax near 'ORDER BY 4'" }
          : { status: 200, headers: {}, body: '{"items":[]}' }) as T;
      }
      if (typeof value === 'string' && value.includes('0x5641554c4e')) {
        return { status: 200, headers: {}, body: '{"mark":"VAULN"}' } as T;
      }
      if (typeof value === 'string' && value.includes("'")) {
        return { status: 500, headers: {}, body: "You have an error in your SQL syntax near '1'" } as T;
      }
      return { status: 200, headers: {}, body: '{"items":[]}' } as T;
    }
    throw new Error('unexpected ' + method);
  }
}

// 重放总是抛错的连接：用于基线失败场景
class ReplayErrorConn {
  private requests: Record<string, any>;
  constructor(requests: Record<string, any>) { this.requests = requests; }
  async sendRequest<T = unknown>(method: string, params?: any): Promise<T> {
    if (method === 'network_get') {
      const req = this.requests[params.requestId];
      if (!req) throw new Error('not found');
      return req as T;
    }
    if (method === 'network_replay_browser') throw new Error('replay boom');
    throw new Error('unexpected ' + method);
  }
}

const REQ = { id: 'r1', url: 'https://example.com/user?id=1', method: 'GET', headers: {}, postData: undefined };

test('scanner: GET 单引号注入被识别为 error_based', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new MockConn({ 'req:r1': REQ }) as any;
    const scanner = new Scanner(conn);
    const result = await scanner.run({ site: 'example_com', requestId: 'req:r1', fields: ['id'], manualBase: dir });
    assert.ok(result.report.results.some((r) => r.technique === 'error_based' && r.confidence === 'high'));
    const raw = await readFile(join(dir, 'example_com', 'security', 'findings.json'), 'utf-8');
    const saved = JSON.parse(raw);
    assert.equal(saved.findings.length, 1);
    assert.equal(saved.findings[0].status, 'VALIDATED');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scanner: 无参数请求报错', async () => {
  const conn = new MockConn({}) as any;
  const scanner = new Scanner(conn);
  await assert.rejects(() => scanner.run({ site: 'x', requestId: 'req:r1', manualBase: tmpdir() }), /Provide either url or requestId/);
});

test('scanner: URL 直扫识别 error_based', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new MockConn({}) as any;
    const scanner = new Scanner(conn);
    const result = await scanner.run({ site: 'example_com', url: 'https://example.com/user?id=1', fields: ['id'], manualBase: dir, technique: ['error_based'] });
    assert.ok(result.report.results.some((r) => r.technique === 'error_based' && r.confidence === 'high'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scanner: URL 直扫 union 攻击探测', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new MockConn({}) as any;
    const scanner = new Scanner(conn);
    const result = await scanner.run({ site: 'example_com', url: 'https://example.com/user?id=1', fields: ['id'], manualBase: dir, technique: ['union'] });
    assert.ok(result.report.results.some((r) => r.technique === 'union'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scanner: 跨源 mutation 被 scope 拦截', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new MockConn({ 'req:r1': REQ }) as any;
    const scanner = new Scanner(conn);
    const result = await scanner.run({
      site: 'example_com', requestId: 'req:r1', fields: ['id'], manualBase: dir,
      allowedOrigins: ['https://other.example.com'],
    });
    assert.equal(result.report.results.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scanner: 基线重放失败记录 failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new ReplayErrorConn({ 'req:r1': REQ }) as any;
    const scanner = new Scanner(conn);
    const result = await scanner.run({ site: 'example_com', requestId: 'req:r1', fields: ['id'], manualBase: dir });
    assert.ok(result.report.results.some((r) => r.status === 'failed'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scanner: 自定义 payload 探测判定 error_based', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new MockConn({ 'req:r1': REQ }) as any;
    const scanner = new Scanner(conn);
    const result = await scanner.requestProbe({ site: 'example_com', requestId: 'req:r1', param: 'id', payload: `1'`, manualBase: dir });
    assert.equal(result.hit, true);
    assert.equal(result.technique, 'error_based');
    assert.equal(result.confidence, 'high');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scanner: 重复扫描同一请求不抛错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-scan-'));
  try {
    const conn = new MockConn({ 'req:r1': REQ }) as any;
    const scanner = new Scanner(conn);
    const opts = { site: 'example_com', requestId: 'req:r1', fields: ['id'], manualBase: dir };
    await scanner.run(opts);
    const second = await scanner.run(opts); // 第二次不应因 VALIDATED -> VALIDATED 抛错
    assert.ok(second.report.results.some((r) => r.technique === 'error_based' && r.confidence === 'high'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
