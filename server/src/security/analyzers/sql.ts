export interface ErrorHit { db: string; pattern: string; }

export const ERROR_RULES: { db: string; patterns: RegExp[] }[] = [
  { db: 'mysql', patterns: [/You have an error in your SQL syntax/i, /mysql_fetch/i, /MySQLSyntaxError/i] },
  { db: 'postgres', patterns: [/pg_query/i, /SQLSTATE/i, /ERROR:\s+syntax error at or near/i] },
  { db: 'mssql', patterns: [/Unclosed quotation mark/i, /Microsoft OLE DB/i, /SQLServerException/i] },
  { db: 'oracle', patterns: [/ORA-\d{4,}/i, /Oracle error/i] },
  { db: 'sqlite', patterns: [/sqlite3\.OperationalError/i, /SQLite.*syntax error/i] },
  { db: 'generic', patterns: [/java\.sql\.SQLException/i, /psycopg2/i, /ProgrammingError/i, /sqlalchemy/i] },
];

export function analyzeErrorResponse(body: string): ErrorHit | null {
  for (const rule of ERROR_RULES) {
    for (const p of rule.patterns) {
      if (p.test(body)) return { db: rule.db, pattern: p.source };
    }
  }
  return null;
}

/** 布尔注入：恒真明显大于恒假（>10 字符），且恒真相对基线明显变大（排除页面被破坏的误报） */
export function analyzeBooleanResponse(baselineBody: string, truthyBody: string, falsyBody: string): boolean {
  const b = baselineBody.trim().length;
  const t = truthyBody.trim().length;
  const f = falsyBody.trim().length;
  return t > f + 10 && t > b + 10;
}

/** 时间盲注：payload 耗时 ≥ 基线 + 2000ms 且绝对时长 ≥ 2500ms */
export function analyzeTimeResponse(baselineMs: number, payloadMs: number): boolean {
  return payloadMs >= baselineMs + 2000 && payloadMs >= 2500;
}

/** UNION 回显标记：0x5641554c4e 解码为 VAULN，用于定位回显列 */
export const UNION_MARK = 'VAULN';

/** 响应是否包含 union 回显标记（该列可回显） */
export function hasUnionMark(body: string): boolean {
  return body.includes(UNION_MARK);
}

/** 堆叠注入判定：响应与基线差异显著（报错或行为副作用） */
export function analyzeStackedResponse(baselineBody: string, body: string): boolean {
  const diff = Math.abs(body.length - baselineBody.length);
  return diff > 100 || /syntax error|query failed|stacked/i.test(body);
}

/** 从响应中提取两个标记之间的内容（union 批量提取） */
export function extractBetweenMarks(body: string, markStart: string, markEnd: string): string | null {
  const startIdx = body.indexOf(markStart);
  if (startIdx < 0) return null;
  const afterStart = startIdx + markStart.length;
  const endIdx = body.indexOf(markEnd, afterStart);
  if (endIdx < 0) return null;
  const value = body.slice(afterStart, endIdx).trim();
  return value === '' ? null : value;
}
