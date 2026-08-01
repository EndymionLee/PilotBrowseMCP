import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRequest } from './request.js';

test('正常查询参数不命中任何规则', () => {
  const rules = analyzeRequest('https://example.com/search?q=hello&page=2', undefined);
  assert.equal(rules.length, 0);
});

test('URL 参数含单引号命中低置信度', () => {
  const rules = analyzeRequest("https://example.com/user?id=1'", undefined);
  assert.ok(rules.some((r) => r.ruleId === 'req-single-quote'));
});

test('URL 参数含 UNION SELECT 命中', () => {
  const rules = analyzeRequest('https://example.com/user?id=1 UNION SELECT * FROM users', undefined);
  assert.ok(rules.some((r) => r.ruleId === 'req-union-select'));
});

test('表单 body 含 OR 1=1 命中', () => {
  const rules = analyzeRequest('https://example.com/login', 'username=admin&password=x%27+OR+%271%27%3D%271');
  assert.ok(rules.length >= 1);
});

test('JSON body 字符串值含注入特征命中，parameter 被记录', () => {
  const rules = analyzeRequest('https://example.com/api', JSON.stringify({ keyword: "1' OR '1'='1" }));
  assert.ok(rules.some((r) => r.ruleId === 'req-or-1-1'));
  assert.ok(rules.every((r) => r.parameter === 'keyword'));
});

test('恒等常量比较升级为 medium', () => {
  const rules = analyzeRequest('https://example.com/user?id=1%27%20AND%20%271%27%3D%271', undefined);
  assert.ok(rules.some((r) => r.confidence === 'medium'));
});

test('恒等比较: 无引号 1=1 升级 medium', () => {
  const rules = analyzeRequest('https://example.com/user?id=1 OR 1=1', undefined);
  assert.ok(rules.some((r) => r.ruleId === 'req-eq-pair' && r.confidence === 'medium'));
});

test('双重编码引号命中 req-url-encoded-quote', () => {
  const rules = analyzeRequest('https://example.com/user?id=%2527', undefined);
  assert.ok(rules.some((r) => r.ruleId === 'req-url-encoded-quote'));
});

test('多参数同规则都命中', () => {
  const rules = analyzeRequest('https://e.com/u?id=1%27&q=2%27', undefined);
  const hits = rules.filter((r) => r.ruleId === 'req-single-quote');
  assert.equal(hits.length, 2);
  assert.ok(hits.some((r) => r.parameter === 'id'));
  assert.ok(hits.some((r) => r.parameter === 'q'));
});
