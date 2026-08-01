export interface MatchedRule {
  ruleId: string;
  type: 'request';
  parameter: string;
  confidence: 'low' | 'medium';
  pattern: string;
}

interface Rule { id: string; confidence: 'low' | 'medium'; pattern: RegExp; }

const RULES: Rule[] = [
  { id: 'req-or-1-1', confidence: 'low', pattern: /\bOR\b\s+('?[^'\s]+'?\s*=\s*'?[^'\s]+'?)/i },
  { id: 'req-union-select', confidence: 'low', pattern: /\bUNION\s+(ALL\s+)?SELECT\b/i },
  { id: 'req-single-quote', confidence: 'low', pattern: /'/ },
  { id: 'req-comment', confidence: 'low', pattern: /(--|\/\*|#)/ },
  { id: 'req-url-encoded-quote', confidence: 'low', pattern: /%27/i }, // 覆盖双重编码 %2527 或 JSON 字面量中的未解码 %27；单次编码 %27 已被解码为 ' 由 req-single-quote 捕获
  { id: 'req-sleep', confidence: 'low', pattern: /\b(sleep|pg_sleep|waitfor)\s*\(/i },
];

export function analyzeRequest(url: string, postData?: string): MatchedRule[] {
  const values: { value: string; parameter: string }[] = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => values.push({ value: v, parameter: k }));
  } catch {}

  if (postData) {
    // JSON body 与表单 body 互斥：JSON 解析成功（对象/数组）则不再按表单解析，
    // 避免把 `{"keyword":"..."}` 误当作 key=value 表单，产生错误 parameter。
    let isJsonBody = false;
    try {
      const json = JSON.parse(postData);
      if (json && typeof json === 'object') {
        isJsonBody = true;
        walkJson(json, '', values);
      }
    } catch {}
    if (!isJsonBody) {
      try {
        new URLSearchParams(postData).forEach((v, k) => values.push({ value: v, parameter: k }));
      } catch {}
    }
  }

  const matched: MatchedRule[] = [];
  const seen = new Set<string>();
  for (const { value, parameter } of values) {
    for (const rule of RULES) {
      const key = rule.id + '|' + parameter;
      if (rule.pattern.test(value) && !seen.has(key)) {
        seen.add(key);
        matched.push({ ruleId: rule.id, type: 'request', parameter, confidence: rule.confidence, pattern: rule.pattern.source });
      }
    }
  }

  // 任一恒等比较模式（数字 1=1 或引号 '1'='1）→ medium
  const allValues = values.map((v) => v.value).join(' ');
  const hasNumberEq = /\d+=\d+/.test(allValues);
  const hasQuoteEq = /'[^']*'\s*=\s*'[^']*'?/.test(allValues);
  if ((hasNumberEq || hasQuoteEq) && !matched.some((r) => r.ruleId === 'req-eq-pair')) {
    const eqParam = values.find((v) => /\d+=\d+/.test(v.value) || /'[^']*'\s*=\s*'[^']*'?/.test(v.value))?.parameter;
    matched.push({ ruleId: 'req-eq-pair', type: 'request', parameter: eqParam ?? 'unknown', confidence: 'medium', pattern: 'constant equality comparison' });
  }
  return matched;
}

function walkJson(v: unknown, prefix: string, out: { value: string; parameter: string }[]): void {
  if (typeof v === 'string') out.push({ value: v, parameter: prefix });
  else if (Array.isArray(v)) v.forEach((x) => walkJson(x, prefix, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) walkJson(x, prefix ? `${prefix}.${k}` : k, out);
  }
}
