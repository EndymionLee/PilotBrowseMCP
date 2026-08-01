import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeJs } from './analyzer.js';
import { traceParam, traceAllSignatures } from './dataflow.js';
import { associateRequest } from './associate.js';
import { saveJsReport } from './report.js';

const SRC = `
function login() {
  var sign = CryptoJS.MD5("token123").toString();
  return fetch("/api/login", { method: "POST", body: { sign: sign } });
}
`;

const analysis = analyzeJs(SRC, 'app.js');

test('dataflow: traceParam 生成来源链', () => {
  const chain = traceParam(analysis, 'sign');
  assert.ok(chain);
  assert.equal(chain!.param, 'sign');
  assert.ok(chain!.chain.some((s) => s.step === 'login'));
  assert.ok(chain!.chain.some((s) => s.step === 'MD5'));
});

test('dataflow: traceAllSignatures 覆盖全部签名参数', () => {
  const chains = traceAllSignatures(analysis);
  assert.ok(chains.some((c) => c.param === 'sign'));
});

test('associate: 请求参数分类', () => {
  const sources = associateRequest(analysis, { sign: 'x', username: 'u', timestamp: 12345 });
  const byParam = Object.fromEntries(sources.map((s) => [s.param, s]));
  assert.equal(byParam['sign'].source, 'function');
  assert.equal(byParam['sign'].generator, 'login');
  assert.equal(byParam['username'].source, 'user_input');
  assert.equal(byParam['timestamp'].source, 'builtin');
});

test('report: 落盘 js/ + capabilities/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jsrev-'));
  try {
    const chains = traceAllSignatures(analysis);
    const sources = associateRequest(analysis, { sign: 'x' });
    const base = await saveJsReport('example_com', 'https://example.com/api/login', analysis, { chains, sources, manualBase: dir });
    const jsDir = join(base, 'js');
    const capDir = join(base, 'capabilities');
    assert.ok((await readdir(jsDir)).includes('functions.json'));
    assert.ok((await readdir(jsDir)).includes('crypto.json'));

    const capFiles = await readdir(capDir);
    const capFile = capFiles.find((f) => f.endsWith('.md'));
    assert.ok(capFile, 'capability md 存在');
    const md = await readFile(join(capDir, capFile!), 'utf-8');
    assert.ok(md.includes('/api/login'));
    assert.ok(md.includes('sign') && md.includes('MD5'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
