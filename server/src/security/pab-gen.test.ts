import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecurityCheckPab } from './pab-gen.js';
import type { Finding } from './finding-store.js';

const findings: Finding[] = [
  {
    id: 'a', status: 'CONFIRMED', url: 'https://example.com/search.php', method: 'GET',
    parameter: 'keyword', confidence: 0.9, matchedRules: [], firstSeen: '', lastSeen: '', validations: [],
  },
  {
    id: 'b', status: 'SUSPECT', url: 'https://example.com/login.php', method: 'POST',
    parameter: 'username', confidence: 0.4, matchedRules: [], firstSeen: '', lastSeen: '', validations: [],
  },
];

test('只包含 CONFIRMED/VALIDATED 项', () => {
  const pab = generateSecurityCheckPab('example_com', findings, 'https://example.com');
  assert.ok(pab.includes('search.php'));
  assert.ok(!pab.includes('login.php'));
});

test('输出 PAB 骨架', () => {
  const pab = generateSecurityCheckPab('example_com', findings, 'https://example.com');
  assert.ok(pab.includes('# security-check.pab'));
  assert.ok(pab.includes('browser_open(site)'));
  assert.ok(pab.includes('browser_evaluate('));
});

test('不使用 or 运算符', () => {
  const pab = generateSecurityCheckPab('example_com', findings, 'https://example.com');
  assert.ok(!pab.includes(' or '));
});

test('每行括号与引号平衡', () => {
  const pab = generateSecurityCheckPab('example_com', findings, 'https://example.com');
  for (const line of pab.split('\n')) {
    if (line.trim() === '') continue;
    const open = (line.match(/\(/g) ?? []).length;
    const close = (line.match(/\)/g) ?? []).length;
    const quotes = (line.match(/"/g) ?? []).length;
    assert.equal(open, close, `paren mismatch: ${line}`);
    assert.equal(quotes % 2, 0, `odd quotes: ${line}`);
  }
});

test('browser_evaluate 参数含完整编码 URL', () => {
  const pab = generateSecurityCheckPab('example_com', findings, 'https://example.com');
  assert.ok(pab.includes('keyword=1%27%20OR%20%271%27%3D%271'));
});
