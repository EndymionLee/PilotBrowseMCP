import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindExtractBoolean, blindExtractTime } from './blind.js';

/** 模拟盲注响应差异：解析条件 SQL，对照目标字符串判定真假 */
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

test('布尔盲注: 提取普通字符串', async () => {
  const out = await blindExtractBoolean(makeProbe('test'), 'database()');
  assert.equal(out, 'test');
});

test('布尔盲注: 提取含大写/下划线的字符串', async () => {
  const out = await blindExtractBoolean(makeProbe('My_DB'), 'database()');
  assert.equal(out, 'My_DB');
});

test('布尔盲注: 空字符串返回空', async () => {
  const out = await blindExtractBoolean(makeProbe(''), 'database()');
  assert.equal(out, '');
});

test('时间盲注: 同样能提取', async () => {
  const out = await blindExtractTime(makeProbe('admin'), 'current_user()');
  assert.equal(out, 'admin');
});

test('布尔盲注: 提取含特殊字符（@ . -）', async () => {
  const out = await blindExtractBoolean(makeProbe('a@b.c-d'), 'version()');
  assert.equal(out, 'a@b.c-d');
});
