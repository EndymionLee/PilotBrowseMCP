/**
 * Data Flow -- 参数来源链（后向切片）
 *
 * 从参数名倒推生成链：sign → md5() → concat() → timestamp / localStorage.token
 * v1 基于 analysis（signatures/crypto/functions）构建；v2 接入 AST 级数据流。
 */
import type { JsAnalysis } from './analyzer.js';

export interface SourceStep { step: string; detail?: string; }
export interface SourceChain { param: string; chain: SourceStep[]; }

export function traceParam(analysis: JsAnalysis, paramName: string): SourceChain | null {
  const p = paramName.toLowerCase();
  const sig = analysis.signatures.find((s) => s.param === p);
  if (!sig) return null;

  const chain: SourceStep[] = [];
  if (sig.generator && sig.generator !== 'unknown') chain.push({ step: sig.generator, detail: 'generator function' });

  const genCrypto = analysis.crypto.filter((c) => c.location === sig.generator);
  if (genCrypto.length > 0) {
    for (const c of genCrypto) chain.push({ step: c.algorithm, detail: 'crypto' });
  } else if (sig.evidence && sig.evidence !== 'param assignment') {
    chain.push({ step: sig.evidence, detail: 'evidence' });
  } else {
    chain.push({ step: 'unknown', detail: 'param assignment' });
  }

  return { param: paramName, chain };
}

export function traceAllSignatures(analysis: JsAnalysis): SourceChain[] {
  return analysis.signatures
    .map((s) => traceParam(analysis, s.param))
    .filter(Boolean) as SourceChain[];
}
