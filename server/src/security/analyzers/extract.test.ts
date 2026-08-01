import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUnionExtractPayload, extractValue, extractDatabases, extractTables, extractColumns, dumpTable, type Injector } from './extract.js';

function makeProbe(target: string): (cond: string) => Promise<boolean> {
  return async (cond: string): Promise<boolean> => {
    const len = cond.match(/LENGTH\(\((.+?)\)\)>=(\d+)/);
    if (len) return target.length >= Number(len[2]);
    const asciiEq = cond.match(/ASCII\(SUBSTRING\(\((.+?)\),(\d+),1\)\)=ASCII\('(.)'\)/);
    if (asciiEq) return target.charCodeAt(Number(asciiEq[2]) - 1) === asciiEq[3].charCodeAt(0);
    const asciiGe = cond.match(/ASCII\(SUBSTRING\(\((.+?)\),(\d+),1\)\)>=(\d+)/);
    if (asciiGe) return target.charCodeAt(Number(asciiGe[2]) - 1) >= Number(asciiGe[3]);
    return false;
  };
}

/** unionVal 为 null 表示 union 不可用（走盲注）；否则 union 回显该值 */
function makeInjector(unionVal: string | null, blindVal = unionVal ?? ''): Injector {
  return {
    async unionQuery(payload) {
      if (!payload.includes('UNION SELECT')) return null;
      if (unionVal === null) return null;
      return `<html><body>prefix START ${unionVal} END suffix</body></html>`;
    },
    async blindBoolean(cond) { return makeProbe(blindVal)(cond); },
    async blindTime(cond) { return makeProbe(blindVal)(cond); },
  };
}

const OPTS = { n: 4, markCol: 2 };

test('buildUnionExtractPayload: 在 markCol 列插入 START/END 包裹表达式', () => {
  const p = buildUnionExtractPayload(4, 2, '(version())');
  assert.ok(p.includes('0x5354415254'));
  assert.ok(p.includes('0x454e44'));
  assert.ok(p.includes('(version())'));
});

test('extractValue: union 批量提取成功', async () => {
  const v = await extractValue(makeInjector('mysql'), '(version())', OPTS);
  assert.equal(v, 'mysql');
});

test('extractValue: union 不可用时盲注兜底', async () => {
  const v = await extractValue(makeInjector(null, 'mysql'), '(version())', OPTS);
  assert.equal(v, 'mysql');
});

test('extractDatabases: 拆分库名', async () => {
  const dbs = await extractDatabases(makeInjector('db1,db2'), OPTS);
  assert.deepEqual(dbs, ['db1', 'db2']);
});

test('extractTables / extractColumns: 拆分表名列名', async () => {
  const tables = await extractTables(makeInjector('users,orders'), 'mydb', OPTS);
  assert.deepEqual(tables, ['users', 'orders']);
  const cols = await extractColumns(makeInjector('id,username'), 'mydb', 'users', OPTS);
  assert.deepEqual(cols, ['id', 'username']);
});

test('dumpTable: 逐行提取为对象数组', async () => {
  const rows = await dumpTable(makeInjector('1,admin,pass'), 'mydb', 'users', ['id', 'username', 'password'], { ...OPTS, dumpLimit: 1 });
  assert.deepEqual(rows, [{ id: '1', username: 'admin', password: 'pass' }]);
});
