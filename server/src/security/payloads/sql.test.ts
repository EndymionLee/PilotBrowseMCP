import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateErrorPayloads, generateBooleanPayloads, generateTimePayloads, generatePayloads, generateUnionPayloads, generateStackedPayloads, generateMetaPayloads, orderByPayload, unionSelectPayload, type PayloadCategory } from './sql.js';

test('error payloads: 至少包含单引号和注释类 payload，均为 error 类', () => {
  const payloads = generateErrorPayloads();
  assert.ok(payloads.length >= 2);
  for (const p of payloads) {
    assert.equal(p.category, 'error');
    assert.ok(p.value.length > 0);
  }
  assert.ok(payloads.some((p) => p.value.includes("'")));
});

test('boolean payloads: 返回恒真/恒假一对', () => {
  const { truthy, falsy } = generateBooleanPayloads();
  assert.equal(truthy.category, 'boolean');
  assert.equal(falsy.category, 'boolean');
  assert.notEqual(truthy.value, falsy.value);
});

test('time payloads: 覆盖至少 3 种数据库 sleep 变体', () => {
  const payloads = generateTimePayloads();
  assert.ok(payloads.length >= 3);
  const dbs = new Set(payloads.map((p) => p.db));
  assert.ok(dbs.size >= 3);
});

test('generatePayloads: 汇总三类', () => {
  const all = generatePayloads();
  const categories = new Set<PayloadCategory>(all.map((p) => p.category));
  assert.deepEqual([...categories].sort(), ['boolean', 'error', 'time']);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length);
});

test('union payloads: 均为 union 类且含 UNION SELECT', () => {
  const payloads = generateUnionPayloads();
  assert.ok(payloads.length >= 2);
  for (const p of payloads) {
    assert.equal(p.category, 'union');
    assert.match(p.value, /UNION SELECT/i);
  }
});

test('stacked payloads: 均为 stacked 类且含分号', () => {
  const payloads = generateStackedPayloads();
  assert.ok(payloads.length >= 1);
  for (const p of payloads) {
    assert.equal(p.category, 'stacked');
    assert.ok(p.value.includes(';'));
  }
});

test('meta payloads: 覆盖 version/database/user', () => {
  const payloads = generateMetaPayloads();
  assert.equal(payloads.length, 3);
  assert.ok(payloads.every((p) => p.category === 'meta'));
});

test('orderByPayload: 生成 ORDER BY N 探测 payload', () => {
  const p = orderByPayload(5);
  assert.equal(p.category, 'union');
  assert.ok(p.value.includes('ORDER BY 5'));
});

test('unionSelectPayload: 指定列回显标记 0x5641554c4e', () => {
  const p = unionSelectPayload(3, 2);
  assert.equal(p.category, 'union');
  assert.ok(p.value.includes('UNION SELECT 1,0x5641554c4e,1'));
});
