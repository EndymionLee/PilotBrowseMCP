import type { ScanRequest } from './mutator.js';

export const SENSITIVE_HEADERS = [
  'cookie', 'authorization', 'proxy-authorization', 'x-api-key', 'x-auth-token',
  'x-csrf-token', 'api-key',
];

const SENSITIVE_KEY = /(token|key|secret|password|passwd|passphrase|credential|session|jwt|sid|pwd|auth|\bsign\b|\bcode\b)/i;

export function redactHeaders(headers: Record<string, string>): { headers: Record<string, string>; redacted: string[] } {
  const out: Record<string, string> = {};
  const redacted: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(k.toLowerCase()) || SENSITIVE_KEY.test(k)) {
      out[k] = '[REDACTED]';
      redacted.push(k);
    } else {
      out[k] = v;
    }
  }
  return { headers: out, redacted };
}

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.forEach((_v, k) => { if (SENSITIVE_KEY.test(k)) u.searchParams.set(k, '[REDACTED]'); });
    if (u.hash && u.hash.length > 1) {
      const hp = new URLSearchParams(u.hash.slice(1));
      hp.forEach((_v, k) => { if (SENSITIVE_KEY.test(k)) hp.set(k, '[REDACTED]'); });
      u.hash = hp.toString();
    }
    return u.toString().replace(/%5B/g, '[').replace(/%5D/g, ']');
  } catch {
    return '[REDACTED-URL]';
  }
}

export function redactBody(body?: string): string {
  if (!body) return '';
  try {
    const json = JSON.parse(body);
    return JSON.stringify(redactJson(json));
  } catch {
    try {
      const sp = new URLSearchParams(body);
      const out = new URLSearchParams();
      sp.forEach((v, k) => out.set(k, SENSITIVE_KEY.test(k) ? '[REDACTED]' : v));
      return out.toString();
    } catch { return body; }
  }
}

function redactJson(v: unknown, key = ''): unknown {
  if (key && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(v)) return v.map((x) => redactJson(x));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = redactJson(x, k);
    return out;
  }
  return v;
}

export function redactScanRequest(req: ScanRequest): { method: string; url: string; headers: Record<string, string>; body: string; redactedHeaders: string[] } {
  const { headers, redacted } = redactHeaders(req.headers);
  return { method: req.method, url: redactUrl(req.url), headers, body: redactBody(req.postData), redactedHeaders: redacted };
}
