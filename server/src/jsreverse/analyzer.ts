/**
 * JS 静态分析引擎 -- Website Capability Intelligence
 *
 * AST 解析（acorn）→ 遍历（acorn-walk ancestor）→ Rule Engine
 * 输出：endpoints / functions / crypto / signatures / webpack
 */
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

export interface Endpoint { url: string; method?: string; source: string; }
export interface JsFunction { name: string; calls: string[]; confidence: number; }
export interface CryptoUsage { algorithm: string; location: string; }
export interface Signature { param: string; generator: string; evidence: string; }
export interface JsConstant { name: string; value: string; source: string; }

export interface PipelineStep { operation: string; keySource: 'constant' | 'random' | 'unknown'; }
export interface CryptoPipeline { function: string; steps: PipelineStep[]; output: Record<string, string>; }

export interface RequestTransformer {
  name: string;
  function: string;
  output: Record<string, string>;
}

export interface JsAnalysis {
  url: string;
  endpoints: Endpoint[];
  functions: JsFunction[];
  crypto: CryptoUsage[];
  signatures: Signature[];
  webpack: { detected: boolean; modules: number };
  constants: JsConstant[];
  pipelines: CryptoPipeline[];
  transformers: RequestTransformer[];
}

const CRYPTO_PATTERNS: { algorithm: string; re: RegExp }[] = [
  { algorithm: 'MD5', re: /CryptoJS\.MD5|\.md5\(|md5\(/i },
  { algorithm: 'SHA1', re: /CryptoJS\.SHA1|sha1\(/i },
  { algorithm: 'SHA256', re: /CryptoJS\.SHA256|sha256\(/i },
  { algorithm: 'AES', re: /CryptoJS\.AES|\.AES\./i },
  { algorithm: 'HmacMD5', re: /CryptoJS\.HmacMD5/i },
  { algorithm: 'RSA', re: /JSEncrypt|setPublicKey/i },
  { algorithm: 'Base64', re: /btoa\(|atob\(|enc\.Base64/i },
];

const ENDPOINT_RE = /\/api\/|\/v\d+\/|https?:\/\/|^\/(user|login|search|list|detail|config|upload|download)/i;

function decodeHexString(s: string): string {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function calleeName(callee: any): string {
  if (!callee) return '';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') {
    const obj = calleeName(callee.object);
    return obj ? `${obj}.${callee.property?.name ?? callee.property?.value ?? ''}` : '';
  }
  return '';
}

function detectCrypto(callName: string): string | null {
  for (const p of CRYPTO_PATTERNS) if (p.re.test(callName)) return p.algorithm;
  return null;
}

/** 从 ancestors 找最近的函数（函数声明或箭头/函数表达式赋值） */
function nearestFunction(ancestors: any[]): string {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const n = ancestors[i];
    if (n.type === 'FunctionDeclaration' && n.id) return n.id.name;
    if (n.type === 'VariableDeclarator' && n.id?.name) {
      const init = n.init;
      if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) return n.id.name;
    }
  }
  return 'global';
}

function extractStringArg(node: any, argIndex: number): string | null {
  const arg = node.arguments?.[argIndex];
  if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value;
  if (arg?.type === 'TemplateLiteral') {
    return arg.quasis.map((q: any) => q.value.cooked ?? '').join('');
  }
  return null;
}

/** 合并多个 JS 文件的分析结果（去重） */
export function mergeAnalyses(analyses: JsAnalysis[]): JsAnalysis {
  const endpoints: Endpoint[] = [];
  const functions: JsFunction[] = [];
  const crypto: CryptoUsage[] = [];
  const signatures: Signature[] = [];
  const webpack = { detected: false, modules: 0 };
  const constants: JsConstant[] = [];
  const pipelines: CryptoPipeline[] = [];
  const transformers: RequestTransformer[] = [];
  for (const a of analyses) {
    for (const e of a.endpoints) if (!endpoints.some((x) => x.url === e.url)) endpoints.push(e);
    for (const f of a.functions) if (!functions.some((x) => x.name === f.name)) functions.push(f);
    for (const c of a.crypto) if (!crypto.some((x) => x.algorithm === c.algorithm && x.location === c.location)) crypto.push(c);
    for (const s of a.signatures) if (!signatures.some((x) => x.param === s.param)) signatures.push(s);
    for (const k of a.constants) if (!constants.some((x) => x.name === k.name && x.value === k.value)) constants.push(k);
    for (const p of a.pipelines) if (!pipelines.some((x) => x.function === p.function)) pipelines.push(p);
    for (const t of a.transformers) if (!transformers.some((x) => x.function === t.function)) transformers.push(t);
    webpack.detected = webpack.detected || a.webpack.detected;
    webpack.modules = Math.max(webpack.modules, a.webpack.modules);
  }
  return { url: analyses[0]?.url ?? '', endpoints, functions, crypto, signatures, webpack, constants, pipelines, transformers };
}

export function analyzeJs(source: string, url: string): JsAnalysis {
  const empty: JsAnalysis = { url, endpoints: [], functions: [], crypto: [], signatures: [], webpack: { detected: false, modules: 0 }, constants: [], pipelines: [], transformers: [] };

  let ast: any;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  } catch {
    try {
      ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
    } catch {
      return empty;
    }
  }

  const endpoints: Endpoint[] = [];
  const crypto: CryptoUsage[] = [];
  const cryptoCalls: { algorithm: string; location: string }[] = [];
  const callMap = new Map<string, Set<string>>();
  const signatureParams = new Set<string>();
  const constants: JsConstant[] = [];
  const webpack = { detected: false, modules: 0 };

  /** 合并端点：同 URL 已存在时补全缺失的 method，避免 Literal 分支（无 method）先占位 */
  const addEndpoint = (url: string, method: string | undefined, source: string) => {
    const existing = endpoints.find((e) => e.url === url);
    if (existing) {
      if (!existing.method && method) existing.method = method;
      return;
    }
    endpoints.push({ url, method, source });
  };

  walk.ancestor(ast, {
    CallExpression(node: any, _state: any, ancestors: any[]) {
      const currentFn = nearestFunction(ancestors);
      const name = calleeName(node.callee);

      if (name.includes('webpackJsonp') || name.includes('__webpack_require__')) webpack.detected = true;
      if (name.includes('webpackJsonp') && Array.isArray(node.arguments?.[1])) {
        webpack.modules = node.arguments[1].length;
      }

      const algo = detectCrypto(name);
      if (algo) {
        cryptoCalls.push({ algorithm: algo, location: currentFn });
        if (!crypto.some((c) => c.algorithm === algo && c.location === currentFn)) {
          crypto.push({ algorithm: algo, location: currentFn });
        }
      }
      if (currentFn !== 'global' && name && !name.includes('.')) {
        if (!callMap.has(currentFn)) callMap.set(currentFn, new Set());
        callMap.get(currentFn)!.add(name);
      }

      // fetch/axios 端点
      if (/fetch|axios|XMLHttpRequest/i.test(name)) {
        const method = /axios\.(get|post|put|delete|patch)/i.test(name)
          ? name.toLowerCase().split('.')[1]
          : name.toLowerCase().includes('fetch') ? 'GET' : undefined;
        const arg0 = extractStringArg(node, 0);
        if (arg0 && ENDPOINT_RE.test(arg0)) addEndpoint(arg0, method, currentFn);
      }
      // XHR.open(method, url)
      if (name.includes('XMLHttpRequest') && node.arguments?.length >= 2) {
        const u = node.arguments[1];
        if (u?.value && typeof u.value === 'string' && ENDPOINT_RE.test(u.value)) {
          addEndpoint(u.value, node.arguments[0]?.value ?? undefined, currentFn);
        }
      }
    },

    Literal(node: any, _state: any, ancestors: any[]) {
      if (typeof node.value !== 'string') return;
      const currentFn = nearestFunction(ancestors);
      const decoded = decodeHexString(node.value);
      if (ENDPOINT_RE.test(decoded) && /^(https?:|\/)/.test(decoded)) addEndpoint(decoded, undefined, currentFn);
      if (/^(sign|token|signature)$/i.test(decoded)) signatureParams.add(decoded.toLowerCase());
    },

    VariableDeclarator(node: any, _state: any, ancestors: any[]) {
      if (node.id?.name && /^(sign|token|signature|_sign|_token)$/i.test(node.id.name)) {
        signatureParams.add(node.id.name.toLowerCase());
      }
      // 关键常量提取（key/iv/secret/preset/token 等）
      if (node.id?.name && node.init?.type === 'Literal' && typeof node.init.value === 'string'
        && /(key|iv|secret|preset|token|encrypt|modulus|exponent)/i.test(node.id.name)
        && node.init.value.length < 1000) {
        if (!constants.some((c) => c.name === node.id.name && c.value === node.init.value)) {
          constants.push({ name: node.id.name, value: node.init.value, source: nearestFunction(ancestors) });
        }
      }
    },

    AssignmentExpression(node: any, _state: any, ancestors: any[]) {
      if (node.left?.name && /^(sign|token|signature)$/i.test(node.left.name)) {
        signatureParams.add(node.left.name.toLowerCase());
      }
      if (node.left?.name === 'webpackJsonp' || node.right?.name === 'webpackJsonp') webpack.detected = true;
    },

    Identifier(node: any) {
      if (node.name === 'webpackJsonp' || node.name === '__webpack_require__') webpack.detected = true;
    },

    MemberExpression(node: any) {
      if (node.property?.name === 'webpackJsonp' || node.property?.name === '__webpack_require__') webpack.detected = true;
    },
  });

  // signatures：签名参数 → 生成函数
  const signatures: Signature[] = [];
  for (const param of signatureParams) {
    const generator = crypto.find((c) => c.location !== 'global')?.location ?? 'unknown';
    const evidence = crypto.map((c) => c.algorithm).join('+') || 'param assignment';
    if (!signatures.some((s) => s.param === param)) {
      signatures.push({ param, generator, evidence });
    }
  }

  const functions: JsFunction[] = Array.from(callMap.entries()).map(([name, calls]) => ({
    name,
    calls: Array.from(calls),
    confidence: crypto.some((c) => c.location === name) ? 0.9 : 0.6,
  }));

  // 算法管线：按函数聚合 crypto 调用序列
  const pipelineMap = new Map<string, PipelineStep[]>();
  for (const c of cryptoCalls) {
    if (c.location === 'global') continue;
    if (!pipelineMap.has(c.location)) pipelineMap.set(c.location, []);
    const steps = pipelineMap.get(c.location)!;
    if (!steps.some((s) => s.operation === c.algorithm)) {
      steps.push({ operation: c.algorithm, keySource: constants.some((k) => /key|iv/.test(k.name)) ? 'constant' : 'unknown' });
    }
  }
  const pipelines: CryptoPipeline[] = Array.from(pipelineMap.entries()).map(([fn, steps]) => ({ function: fn, steps, output: {} }));

  // 请求转换器：函数名含 encrypt/asrsea/sign，或 crypto 调用 ≥2 次（如 asrsea 双层 AES）
  const cryptoCount = new Map<string, number>();
  for (const c of cryptoCalls) cryptoCount.set(c.location, (cryptoCount.get(c.location) ?? 0) + 1);
  const transformerFns = [
    ...new Set(cryptoCalls.filter((c) => c.location !== 'global' && (/encrypt|asrsea|sign/i.test(c.location) || (cryptoCount.get(c.location) ?? 0) >= 2)).map((c) => c.location)),
  ];
  const transformers: RequestTransformer[] = transformerFns.map((fn) => ({ name: `${fn}_transform`, function: fn, output: {} }));

  return { url, endpoints, functions, crypto, signatures, webpack, constants, pipelines, transformers };
}
