import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeErrorResponse, analyzeBooleanResponse, analyzeTimeResponse } from './sql.js';

test('识别 MySQL 报错特征', () => {
  const hit = analyzeErrorResponse("You have an error in your SQL syntax near '1' at line 1");
  assert.ok(hit);
  assert.equal(hit!.db, 'mysql');
});

test('识别 Oracle 报错特征', () => {
  const hit = analyzeErrorResponse('ORA-00933: SQL command not properly ended');
  assert.ok(hit);
  assert.equal(hit!.db, 'oracle');
});

test('识别 PostgreSQL 报错特征', () => {
  const hit = analyzeErrorResponse('ERROR: syntax error at or near "1"\nLINE 1: SELECT ...');
  assert.ok(hit);
  assert.equal(hit!.db, 'postgres');
});

test('识别 SQL Server 报错特征', () => {
  const hit = analyzeErrorResponse('com.microsoft.sqlserver.jdbc.SQLServerException: Invalid object name');
  assert.ok(hit);
  assert.equal(hit!.db, 'mssql');
});

test('识别 SQLite 报错特征', () => {
  const hit = analyzeErrorResponse('sqlite3.OperationalError: near "1": syntax error');
  assert.ok(hit);
  assert.equal(hit!.db, 'sqlite');
});

test('识别通用 JDBC 报错特征', () => {
  const hit = analyzeErrorResponse('java.sql.SQLException: ...');
  assert.ok(hit);
  assert.equal(hit!.db, 'generic');
});

test('正常响应不命中', () => {
  assert.equal(analyzeErrorResponse('<html>Welcome to our site</html>'), null);
});

test('布尔注入: 恒真明显大于恒假', () => {
  const baseline = '{"items":[]}';
  const truthy = '{"items":[{"id":1},{"id":2},{"id":3},{"id":4}]}';
  const falsy = '{"items":[]}';
  assert.equal(analyzeBooleanResponse(baseline, truthy, falsy), true);
});

test('布尔注入: 无差异返回 false', () => {
  assert.equal(analyzeBooleanResponse('{"items":[]}', '{"items":[]}', '{"items":[]}'), false);
});

test('布尔注入: 恒假大于恒真返回 false', () => {
  assert.equal(
    analyzeBooleanResponse('{"items":[]}', '{"items":[]}', '{"items":[{"id":1},{"id":2},{"id":3},{"id":4}]}'),
    false,
  );
});

test('布尔注入: 恒真未明显大于基线返回 false', () => {
  const baseline = '{"items":[1,2,3,4,5]}';
  assert.equal(analyzeBooleanResponse(baseline, baseline, '{"items":[]}'), false);
});

test('时间盲注: 明显高于基线', () => {
  assert.equal(analyzeTimeResponse(200, 3200), true);
});

test('时间盲注: 无明显差异返回 false', () => {
  assert.equal(analyzeTimeResponse(300, 350), false);
});
