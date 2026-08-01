import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildReport, saveReport, type ReportResult } from './report.js';

const results: ReportResult[] = [{
  url: 'https://e.com/u?token=abc&id=1', method: 'GET', parameter: 'id',
  technique: 'error_based', confidence: 'high',
  evidence: { payload: "1'", request: { method: 'GET', url: 'x', headers: {}, body: '' }, response_snippet: 'SQL syntax', elapsed_ms: 50 },
  credentials: { redacted: true },
  suggestion: 'use parameterized query', status: 'found',
}];

test('buildReport: 统计与结果', () => {
  const report = buildReport('example_com', 'https://example.com/u', ['id'], ['https://example.com'], results);
  assert.equal(report.site, 'example_com');
  assert.deepEqual(report.summary, { total: 1, high: 1, medium: 0, failed: 0 });
  assert.equal(report.results.length, 1);
});

test('buildReport: 混合 found/failed 统计', () => {
  const mixed: ReportResult[] = [
    { ...results[0], confidence: 'high', status: 'found' },
    { ...results[0], confidence: 'medium', status: 'found' },
    { ...results[0], confidence: 'low', status: 'failed' },
  ];
  const report = buildReport('example_com', 'https://example.com/u', ['id'], [], mixed);
  assert.deepEqual(report.summary, { total: 3, high: 1, medium: 1, failed: 1 });
});

test('saveReport: 落盘 sqli-report 与 README', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-report-'));
  try {
    const report = buildReport('example_com', 'https://example.com/u', ['id'], [], results);
    const file = await saveReport('example_com', report, dir);
    assert.ok(file.includes('sqli-report-'));
    const readme = await readFile(join(dir, 'example_com', 'security', 'README.md'), 'utf-8');
    assert.ok(readme.includes('error_based'));
    const saved = JSON.parse(await readFile(file, 'utf-8'));
    assert.equal(saved.summary.high, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('saveReport: 恶意 site 被清洗', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-report-'));
  try {
    const report = buildReport('example_com', 'https://example.com/u', ['id'], [], results);
    const file = await saveReport('../../evil', report, dir);
    const base = resolve(dir);
    // 落盘仍在 manualBase 目录内（路径穿越被阻止）
    assert.ok(resolve(file).startsWith(base + '\\') || resolve(file).startsWith(base + '/'), `escaped base: ${file}`);
    // site 中分隔符被清洗，不再形成 '..' 目录段
    assert.ok(!resolve(file).includes('\\..\\') && !resolve(file).includes('/../'));
    // 清洗后的 safeSite 目录与文件存在，且内容可读
    const saved = JSON.parse(await readFile(file, 'utf-8'));
    assert.equal(saved.site, 'example_com');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('saveReport: README 特殊字符转义', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-report-'));
  try {
    const withPipe: ReportResult[] = [{ ...results[0], url: 'https://e.com/a|b?token=abc&id=1' }];
    const report = buildReport('example_com', 'https://example.com/u', ['id'], [], withPipe);
    await saveReport('example_com', report, dir);
    const readme = await readFile(join(dir, 'example_com', 'security', 'README.md'), 'utf-8');
    assert.ok(readme.includes('\\|'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
