/**
 * 关联引擎 -- 请求参数 ↔ JS 生成函数
 *
 * 输入网络请求的 body/query 参数，分析 JS 定位每个参数的生成来源。
 */
import type { JsAnalysis } from './analyzer.js';

export interface ParamSource {
  param: string;
  generator: string;
  evidence: string;
  source: 'function' | 'builtin' | 'user_input';
}

const BUILTIN_PARAMS = ['timestamp', 'time', 'date', 'random', 'nonce', 'uuid', 'ts'];

export function associateRequest(analysis: JsAnalysis, requestBody: Record<string, unknown>): ParamSource[] {
  const out: ParamSource[] = [];
  for (const [param, value] of Object.entries(requestBody)) {
    const sig = analysis.signatures.find((s) => s.param === param.toLowerCase());
    if (sig) {
      out.push({ param, generator: sig.generator, evidence: sig.evidence, source: 'function' });
    } else if (BUILTIN_PARAMS.includes(param.toLowerCase())) {
      out.push({ param, generator: 'builtin', evidence: 'generated at runtime', source: 'builtin' });
    } else if (typeof value === 'number') {
      out.push({ param, generator: 'builtin', evidence: 'numeric value', source: 'builtin' });
    } else {
      out.push({ param, generator: 'user_input', evidence: '', source: 'user_input' });
    }
  }
  return out;
}
