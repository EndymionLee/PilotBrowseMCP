import type { Payload } from './payloads/sql.js';

export interface ScanRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
}

export interface Mutation {
  requestId: string;
  parameter: string;
  payload: Payload;
  source: 'query' | 'body' | 'cookie';
  overrides: { query?: Record<string, string>; body?: unknown; cookie?: Record<string, string> };
}

/** 从 Cookie 头发现注入参数（Cookie: a=1; b=2 → a, b） */
export function discoverCookieParams(req: ScanRequest): string[] {
  const cookie = req.headers['Cookie'] ?? req.headers['cookie'] ?? '';
  if (!cookie) return [];
  const params: string[] = [];
  try {
    new URLSearchParams(cookie.replace(/;\s*/g, '&')).forEach((_v, k) => params.push(k));
  } catch {}
  return params;
}

/** 构造带注入 Cookie 的 mutation（保留其他 cookie） */
export function cookieMutation(req: ScanRequest, param: string, payload: Payload): Mutation {
  const cookie = req.headers['Cookie'] ?? req.headers['cookie'] ?? '';
  const overrides: Record<string, string> = {};
  try {
    new URLSearchParams(cookie.replace(/;\s*/g, '&')).forEach((v, k) => { overrides[k] = v; });
  } catch {}
  overrides[param] = payload.value;
  return { requestId: req.id, parameter: param, payload, source: 'cookie', overrides: { cookie: overrides } };
}

function bodyKind(req: ScanRequest): 'json' | 'form' | 'none' {
  if (!req.postData || req.method === 'GET') return 'none';
  const ct = (req.headers['Content-Type'] ?? req.headers['content-type'] ?? '').toLowerCase();
  if (ct.includes('application/json')) return 'json';
  if (ct.includes('application/x-www-form-urlencoded')) return 'form';
  const t = req.postData.trim();
  return t.startsWith('{') || t.startsWith('[') ? 'json' : 'form';
}

function queryParamNames(req: ScanRequest): Set<string> {
  const s = new Set<string>();
  try { new URL(req.url).searchParams.forEach((_v, k) => s.add(k)); } catch {}
  return s;
}

export function discoverParameters(req: ScanRequest, limit = 10): string[] {
  const params: string[] = [];
  try {
    const u = new URL(req.url);
    u.searchParams.forEach((_v, k) => params.push(k));
  } catch {}
  const kind = bodyKind(req);
  if (req.postData && req.method !== 'GET') {
    if (kind === 'json') {
      try { collectJsonKeys(JSON.parse(req.postData), '', params); } catch {}
    } else if (kind === 'form') {
      try { new URLSearchParams(req.postData).forEach((_v, k) => params.push(k)); } catch {}
    }
  }
  return [...new Set(params)].slice(0, limit);
}

function collectJsonKeys(v: unknown, prefix: string, out: string[]): void {
  if (Array.isArray(v)) return; // 数组元素不支持 v1
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const key = prefix ? `${prefix}.${k}` : k;
      out.push(key);
      if (x && typeof x === 'object' && !Array.isArray(x)) collectJsonKeys(x, key, out);
    }
  }
}

export function generateMutations(req: ScanRequest, payloads: Payload[], fields?: string[]): Mutation[] {
  const kind = bodyKind(req);
  const targets = fields?.length ? fields : discoverParameters(req);
  const queryParams = queryParamNames(req);
  const mutations: Mutation[] = [];

  for (const param of targets) {
    const inQuery = queryParams.has(param);
    for (const payload of payloads) {
      if (kind === 'json' && !inQuery) {
        let bodyObj: any = {};
        try { bodyObj = JSON.parse(req.postData!); } catch {}
        if (!setNested(bodyObj, param, payload.value)) continue; // I-2: 非法路径跳过不崩溃
        mutations.push({ requestId: req.id, parameter: param, payload, source: 'body', overrides: { body: bodyObj } });
      } else if (inQuery) {
        mutations.push({ requestId: req.id, parameter: param, payload, source: 'query', overrides: { query: { [param]: payload.value } } });
      } else if (kind === 'form') {
        const body = replaceFormValue(req.postData ?? '', param, payload.value);
        mutations.push({ requestId: req.id, parameter: param, payload, source: 'body', overrides: { body } });
      }
    }
  }
  return mutations;
}

function setNested(obj: any, path: string, value: string): boolean {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (cur[seg] === undefined) cur[seg] = {};
    if (cur[seg] === null || typeof cur[seg] !== 'object' || Array.isArray(cur[seg])) return false;
    cur = cur[seg];
  }
  cur[parts[parts.length - 1]] = value;
  return true;
}

function replaceFormValue(body: string, key: string, value: string): string {
  try {
    const sp = new URLSearchParams(body);
    sp.set(key, value);
    return sp.toString();
  } catch { return body; }
}
