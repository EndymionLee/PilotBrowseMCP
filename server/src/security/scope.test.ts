import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScope, isAllowed } from './scope.js';

test('默认 scope 只含目标 origin', () => {
  const scope = buildScope('https://example.com/path?q=1');
  assert.deepEqual(scope.allowedOrigins, ['https://example.com']);
});

test('显式扩展 allowedOrigins', () => {
  const scope = buildScope('https://example.com', ['https://api.example.com']);
  assert.deepEqual(scope.allowedOrigins.sort(), ['https://api.example.com', 'https://example.com']);
});

test('同源 URL 放行', () => {
  const scope = buildScope('https://example.com');
  assert.equal(isAllowed(scope, 'https://example.com/other'), true);
});

test('跨源 URL 拦截', () => {
  const scope = buildScope('https://example.com');
  assert.equal(isAllowed(scope, 'https://cdn.example.com/x'), false);
});

test('非法 URL 拒绝', () => {
  const scope = buildScope('https://example.com');
  assert.equal(isAllowed(scope, 'not a url'), false);
});

test('显式条目带尾斜杠归一化', () => {
  const scope = buildScope('https://example.com', ['https://api.example.com/']);
  assert.equal(scope.allowedOrigins.includes('https://api.example.com'), true);
});

test('显式条目非法 URL 被忽略', () => {
  const scope = buildScope('https://example.com', ['not a url']);
  assert.equal(scope.allowedOrigins.includes('not a url'), false);
  assert.equal(scope.allowedOrigins.length, 1);
});

test('重复条目去重', () => {
  const scope = buildScope('https://example.com', ['https://example.com']);
  assert.equal(scope.allowedOrigins.length, 1);
});
