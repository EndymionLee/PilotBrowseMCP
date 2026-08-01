import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTamper, tamperVariants, TAMPER_NAMES } from './tamper.js';

test('tamperVariants: 生成全部 5 个变体且值不同', () => {
  const vs = tamperVariants(`1' UNION SELECT 1-- `);
  assert.equal(vs.length, 5);
  const names = vs.map((v) => v.name).sort();
  assert.deepEqual(names, [...TAMPER_NAMES].sort());
  assert.ok(new Set(vs.map((v) => v.value)).size >= 4); // 至少多数变体值不同
});

test('upper-lower: 关键字大小写混合', () => {
  const out = applyTamper(`UNION SELECT`, 'upper-lower');
  assert.match(out, /UnIoN|uNiOn/);
  assert.doesNotMatch(out, /^UNION SELECT$/);
});

test('inline-comment: 关键字插入内联注释', () => {
  const out = applyTamper(`SELECT`, 'inline-comment');
  assert.ok(out.includes('/**/'));
  assert.ok(/SEL\/\*\*\/ECT/i.test(out));
});

test('keyword-split: 前 3 字符后插注释', () => {
  const out = applyTamper(`SELECT`, 'keyword-split');
  assert.ok(out.startsWith('SEL/**/'));
});

test('url-encode: 单引号编码为 %27', () => {
  const out = applyTamper(`1' AND 1=1-- `, 'url-encode');
  assert.ok(out.includes('%27'));
  assert.ok(!out.includes("1'"));
});

test('keyword-repeat: SELECT 变为 SELSELECTECT', () => {
  const out = applyTamper(`SELECT 1`, 'keyword-repeat');
  assert.ok(out.includes('SELSELECTECT'));
});

test('非关键字内容不受 tamper 影响', () => {
  const out = applyTamper(`12345`, 'inline-comment');
  assert.equal(out, '12345');
});
