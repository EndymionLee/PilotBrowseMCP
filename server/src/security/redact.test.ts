import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SENSITIVE_HEADERS, redactHeaders, redactUrl, redactBody, redactScanRequest } from './redact.js';
import type { ScanRequest } from './mutator.js';

test('敏感 header 被替换并记录', () => {
  const { headers, redacted } = redactHeaders({ 'Cookie': 'session=abc', 'X-Csrf-Token': 't1', 'Content-Type': 'application/json' });
  assert.equal(headers['Cookie'], '[REDACTED]');
  assert.equal(headers['X-Csrf-Token'], '[REDACTED]');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.ok(redacted.includes('Cookie'));
});

test('SENSITIVE_HEADERS 包含常见认证头', () => {
  for (const h of ['cookie', 'authorization', 'x-api-key', 'x-csrf-token']) {
    assert.ok(SENSITIVE_HEADERS.includes(h));
  }
});

test('URL 中 token 参数值被脱敏', () => {
  const out = redactUrl('https://example.com/api?access_token=secret123&q=hello');
  assert.ok(!out.includes('secret123'));
  assert.ok(out.includes('[REDACTED]'));
  assert.ok(out.includes('q=hello'));
});

test('JSON body 敏感键值脱敏', () => {
  const out = redactBody(JSON.stringify({ username: 'admin', password: 'pw123', note: 'keep' }));
  assert.ok(!out.includes('pw123'));
  assert.ok(out.includes('admin'));
  assert.ok(out.includes('keep'));
});

test('redactScanRequest: 整体脱敏请求', () => {
  const req: ScanRequest = { id: 'r', url: 'https://e.com/api?token=abc', method: 'POST', headers: { Authorization: 'Bearer xyz' }, postData: '{"password":"p"}' };
  const out = redactScanRequest(req);
  assert.ok(!out.url.includes('abc'));
  assert.ok(!out.body.includes('"p"'));
  assert.ok(!out.headers['Authorization'].includes('xyz'));
});

test('自定义认证头被脱敏', () => {
  const { redacted } = redactHeaders({ 'X-Access-Token': 'leak' });
  assert.ok(redacted.includes('X-Access-Token'));
});

test('JSON 嵌套敏感对象整体脱敏', () => {
  const out = redactBody(JSON.stringify({ token: { value: 'SECRETXYZ' } }));
  assert.ok(!out.includes('SECRETXYZ'));
});

test('JSON 敏感数组整体脱敏', () => {
  const out = redactBody(JSON.stringify({ password: ['SECRETXYZ'] }));
  assert.ok(!out.includes('SECRETXYZ'));
});

test('URL hash 中 token 脱敏', () => {
  const out = redactUrl('https://e.com/login#access_token=SECRETXYZ');
  assert.ok(!out.includes('SECRETXYZ'));
});

test('表单 session 键脱敏', () => {
  const out = redactBody('session=SECRETXYZ&q=hello');
  assert.ok(!out.includes('SECRETXYZ'));
});

test('URL 中 sign 参数脱敏', () => {
  const out = redactUrl('https://e.com/api?sign=xyz&q=hi');
  assert.ok(!out.includes('xyz'));
});

test('URL 中 code 参数脱敏', () => {
  const out = redactUrl('https://e.com/oauth?code=abc&q=hi');
  assert.ok(!out.includes('abc'));
});

test('URL 中 country_code 不误伤', () => {
  const out = redactUrl('https://e.com/api?country_code=86');
  assert.ok(out.includes('country_code=86'));
});
