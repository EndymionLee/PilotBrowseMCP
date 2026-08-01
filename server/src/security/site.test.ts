import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { inferSite, manualSecurityDir } from './site.js';

test('inferSite: 从 hostname 提取首段站点名', () => {
  assert.equal(inferSite('https://www.example.com/path?q=1'), 'example');
  assert.equal(inferSite('https://api.github.com/'), 'api');
  assert.equal(inferSite('not a url'), null);
});

test('manualSecurityDir: 站点 security 目录', () => {
  assert.equal(manualSecurityDir('example_com', '/base'), path.join('/base', 'example_com', 'security'));
});
