import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FindingStore, ALLOWED_TRANSITIONS, findingId, type FindingStatus } from './finding-store.js';

async function withTempStore(fn: (store: FindingStore, dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'sqli-findings-'));
  try { await fn(new FindingStore(dir), dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('findingId: 相同输入产生相同 id，不同参数不同 id', () => {
  assert.equal(findingId('https://e.com/u?id=1', 'GET', 'id'), findingId('https://e.com/u?id=1', 'GET', 'id'));
  assert.notEqual(findingId('https://e.com/u?id=1', 'GET', 'id'), findingId('https://e.com/u?id=1', 'GET', 'q'));
});

test('upsert: 新 finding 默认 SUSPECT 并落盘', () => {
  return withTempStore(async (store) => {
    const f = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: ['req-single-quote'] });
    assert.equal(f.status, 'SUSPECT');
    const list = await store.list();
    assert.equal(list.length, 1);
    // 重新加载验证持久化
    const store2 = new FindingStore(store.dir);
    assert.equal((await store2.list()).length, 1);
  });
});

test('upsert: 同 id 再次命中更新 lastSeen 不新增', () => {
  return withTempStore(async (store) => {
    await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    const updated = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.6, matchedRules: [] });
    assert.equal(updated.confidence, 0.6);
    assert.equal((await store.list()).length, 1);
  });
});

test('updateStatus: 合法转换 SUSPECT→VALIDATED', () => {
  return withTempStore(async (store) => {
    const f = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    const updated = await store.updateStatus(f.id, 'VALIDATED');
    assert.equal(updated.status, 'VALIDATED');
  });
});

test('updateStatus: 非法转换被拒绝', () => {
  return withTempStore(async (store) => {
    const f = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    await assert.rejects(() => store.updateStatus(f.id, 'CONFIRMED'), /Illegal transition/);
  });
});

test('ALLOWED_TRANSITIONS: 完整链 SUSPECT→VALIDATED→CONFIRMED→FIXED', () => {
  let s: FindingStatus = 'SUSPECT';
  for (const next of ['VALIDATED', 'CONFIRMED', 'FIXED'] as FindingStatus[]) {
    assert.ok(ALLOWED_TRANSITIONS[s].includes(next), `${s} -> ${next}`);
    s = next;
  }
});

test('get(id) 返回单条', () => {
  return withTempStore(async (store) => {
    const f = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    const got = await store.get(f.id);
    assert.equal(got?.id, f.id);
    assert.equal(await store.get('nonexistent-id'), undefined);
  });
});

test('list(status) 按状态过滤', () => {
  return withTempStore(async (store) => {
    await store.upsert({ url: 'https://a.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [], status: 'VALIDATED' });
    await store.upsert({ url: 'https://b.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    const validated = await store.list('VALIDATED');
    assert.equal(validated.length, 1);
    assert.equal(validated[0].url, 'https://a.com/u');
  });
});

test('upsert: 同 id confidence 取最大', () => {
  return withTempStore(async (store) => {
    await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    const updated = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.6, matchedRules: [] });
    assert.equal(updated.confidence, 0.6);
  });
});

test('upsert 追加 validation 并去重', () => {
  return withTempStore(async (store) => {
    const validation = { technique: 'bool', confidence: 'high', evidence: { payload: "' OR 1=1" }, at: new Date().toISOString() };
    await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [], validation });
    const f = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [], validation });
    assert.equal(f.validations.length, 1);
  });
});

test('FIXED 重开为 SUSPECT', () => {
  return withTempStore(async (store) => {
    const f = await store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] });
    await store.updateStatus(f.id, 'VALIDATED');
    await store.updateStatus(f.id, 'CONFIRMED');
    await store.updateStatus(f.id, 'FIXED');
    const reopened = await store.updateStatus(f.id, 'SUSPECT');
    assert.equal(reopened.status, 'SUSPECT');
  });
});

test('upsert 非法状态字符串被拒绝', () => {
  return withTempStore(async (store) => {
    await assert.rejects(
      () => store.upsert({ url: 'https://e.com/u', method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [], status: 'BOGUS' as FindingStatus }),
      /Invalid status/
    );
  });
});

test('并发 upsert 不丢更新', () => {
  return withTempStore(async (store) => {
    await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
      store.upsert({ url: `https://e.com/u?id=${i}`, method: 'GET', parameter: 'id', confidence: 0.4, matchedRules: [] }),
    ));
    assert.equal((await store.list()).length, 10);
  });
});
