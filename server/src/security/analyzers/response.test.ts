import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate, normalize, snippetAround } from './response.js';

test('truncate: 短内容原样返回', () => {
  assert.equal(truncate('abc'), 'abc');
});

test('truncate: 超长内容截断并标记', () => {
  const long = 'x'.repeat(1000);
  const out = truncate(long, 100);
  assert.ok(out.length <= 100);
  assert.ok(out.endsWith('...[truncated]'));
});

test('normalize: 压缩空白', () => {
  assert.equal(normalize('a \n  b\t c'), 'a b c');
});

test('snippetAround: 命中关键词返回上下文片段', () => {
  const body = 'prefix error in sql syntax near "1" suffix';
  const snip = snippetAround(body, 'sql syntax', 5);
  assert.ok(snip.includes('sql syntax'));
  assert.ok(snip.length < body.length);
});

test('snippetAround: 未命中返回截断正文', () => {
  const snip = snippetAround('nothing here', 'nomatch');
  assert.ok(snip.length <= 200);
});

test('snippetAround: 空 keyword 回退截断', () => {
  assert.ok(snippetAround('long body here', '').length <= 200);
});
