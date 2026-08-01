import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeJs } from './analyzer.js';

test('普通 JS：提取 endpoint/crypto/signature', () => {
  const src = `
function login() {
  var sign = CryptoJS.MD5("token123").toString();
  return fetch("/api/login", { method: "POST", body: { sign: sign } });
}
axios.get("/api/user?id=1");
`;
  const a = analyzeJs(src, 'app.js');
  assert.ok(a.endpoints.some((e) => e.url === '/api/login'));
  assert.ok(a.endpoints.some((e) => e.url === '/api/user?id=1'));
  assert.ok(a.crypto.some((c) => c.algorithm === 'MD5'));
  assert.ok(a.signatures.some((s) => s.param === 'sign'));
});

test('普通 JS：axios POST 带 method', () => {
  const src = `axios.post("/api/search", { q: "x" });`;
  const a = analyzeJs(src, 'app.js');
  const ep = a.endpoints.find((e) => e.url === '/api/search');
  assert.ok(ep);
  assert.equal(ep.method, 'post');
});

test('十六进制混淆字符串解码为 sign', () => {
  const src = `var _0x4f3a = "\\x73\\x69\\x67\\x6e"; var sign = md5(_0x4f3a + "x");`;
  const a = analyzeJs(src, 'app.js');
  assert.ok(a.signatures.some((s) => s.param === 'sign'));
});

test('webpack 检测', () => {
  const src = `window.webpackJsonp = window.webpackJsonp || [];`;
  const a = analyzeJs(src, 'bundle.js');
  assert.equal(a.webpack.detected, true);
});

test('非法 JS 返回空分析不抛错', () => {
  const a = analyzeJs('var = = = broken(((', 'broken.js');
  assert.ok(Array.isArray(a.endpoints));
  assert.equal(a.endpoints.length, 0);
});

test('网易云风格：提取常量/管线/转换器', () => {
  const src = `
var presetKey = "0CoJUm6Qyw8W8jud";
function asrsea(data) {
  var randomKey = "random16";
  var enc1 = CryptoJS.AES.encrypt(JSON.stringify(data), presetKey, { iv: "0102030405060708" });
  var enc2 = CryptoJS.AES.encrypt(enc1, randomKey);
  return { params: enc2, encSecKey: encryptRSA(randomKey) };
}
function encryptRSA(key) {
  var enc = new JSEncrypt();
  enc.setPublicKey("MIGfMA0GCSqGSIb3D");
  return enc.encrypt(key);
}
`;
  const a = analyzeJs(src, 'core.js');
  assert.ok(a.constants.some((c) => c.name === 'presetKey' && c.value === '0CoJUm6Qyw8W8jud'));
  const asrsea = a.pipelines.find((p) => p.function === 'asrsea');
  assert.ok(asrsea, 'asrsea pipeline 存在');
  assert.ok(asrsea!.steps.some((s) => s.operation === 'AES'));
  assert.ok(a.transformers.some((t) => t.function === 'asrsea'), 'asrsea 识别为 transformer');
  assert.ok(a.transformers.some((t) => t.function === 'encryptRSA'));
});

test('函数调用关系：login 调用 fetch', () => {
  const src = `
function login() {
  return fetch("/api/login");
}
`;
  const a = analyzeJs(src, 'app.js');
  const loginFn = a.functions.find((f) => f.name === 'login');
  assert.ok(loginFn);
  assert.ok(loginFn.calls.includes('fetch'));
});
