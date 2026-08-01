import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverParameters, generateMutations, type ScanRequest } from './mutator.js';
import { generatePayloads } from './payloads/sql.js';

const getReq: ScanRequest = {
  id: 'r1', url: 'https://example.com/search?q=hello&page=2', method: 'GET', headers: {},
};

const postJsonReq: ScanRequest = {
  id: 'r2', url: 'https://example.com/api', method: 'POST', headers: {},
  postData: JSON.stringify({ keyword: 'test', filter: { page: 1 } }),
};

const formReq: ScanRequest = { id: 'r3', url: 'https://example.com/login', method: 'POST', headers: {}, postData: 'username=admin&password=x' };

test('discoverParameters: 从 GET query 发现参数', () => {
  assert.deepEqual(discoverParameters(getReq), ['q', 'page']);
});

test('discoverParameters: 从 JSON body 递归发现参数', () => {
  const params = discoverParameters(postJsonReq);
  assert.ok(params.includes('keyword'));
  assert.ok(params.includes('filter.page'));
});

test('discoverParameters: JSON body 不产生伪键', () => {
  const params = discoverParameters(postJsonReq);
  assert.ok(params.every((p) => !p.includes('{') && !p.includes('"')));
});

test('generateMutations: GET 生成 query overrides', () => {
  const payloads = generatePayloads();
  const mutations = generateMutations(getReq, payloads, ['q']);
  const q = mutations.filter((m) => m.parameter === 'q');
  assert.equal(q.length, payloads.length);
  assert.ok(q.every((m) => m.overrides.query && 'q' in m.overrides.query!));
});

test('generateMutations: JSON body 生成 body overrides 且不改其他字段', () => {
  const payloads = generatePayloads();
  const mutations = generateMutations(postJsonReq, payloads, ['keyword']);
  assert.ok(mutations.length > 0);
  const m = mutations[0];
  assert.ok(m.overrides.body && typeof m.overrides.body === 'object');
  const body = m.overrides.body as Record<string, any>;
  assert.equal(body.keyword, m.payload.value);
  assert.deepEqual(body.filter, { page: 1 }); // 未改动字段保留
});

test('generateMutations: fields 缺省时自动发现', () => {
  const payloads = generatePayloads();
  const mutations = generateMutations(getReq, payloads);
  assert.ok(mutations.some((m) => m.parameter === 'page'));
});

test('generateMutations: 表单 body 生成 body override 字符串', () => {
  const payloads = generatePayloads();
  const ms = generateMutations(formReq, payloads, ['username']);
  assert.ok(ms.length > 0);
  const m = ms[0];
  assert.ok(typeof m.overrides.body === 'string');
  assert.ok((m.overrides.body as string).includes('username='));
});

test('generateMutations: POST 的 query 参数走 query 通道，body 参数走 body 通道', () => {
  const req: ScanRequest = { id: 'r4', url: 'https://example.com/search?term=hello', method: 'POST', headers: { 'Content-Type': 'application/json' }, postData: JSON.stringify({ keyword: 'x' }) };
  const payloads = generatePayloads();
  const ms = generateMutations(req, payloads, ['term', 'keyword']);
  const termMs = ms.filter((m) => m.parameter === 'term');
  const kwMs = ms.filter((m) => m.parameter === 'keyword');
  assert.ok(termMs.every((m) => m.overrides.query));
  assert.ok(kwMs.every((m) => m.overrides.body));
});

test('generateMutations: 非法点路径不崩溃并跳过', () => {
  const req: ScanRequest = { id: 'r5', url: 'https://example.com/api', method: 'POST', headers: {}, postData: JSON.stringify({ config: 'raw' }) };
  const payloads = generatePayloads();
  const ms = generateMutations(req, payloads, ['config.value']); // config 是 string，路径非法
  assert.ok(Array.isArray(ms));
  assert.equal(ms.length, 0);
});

test('discoverParameters: 数组 JSON body 返回空参数', () => {
  const req: ScanRequest = { id: 'r6', url: 'https://example.com/api', method: 'POST', headers: { 'Content-Type': 'application/json' }, postData: '[{"a":1}]' };
  assert.deepEqual(discoverParameters(req), []);
});
