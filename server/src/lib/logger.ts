/**
 * 结构化日志系统
 *
 * 所有日志输出到 stderr（避免干扰 MCP stdio 协议）
 * 格式: [timestamp] [level] [module] message {extra}
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_NUM: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLevel: LogLevel = 'INFO';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function log(level: LogLevel, module: string, message: string, extra?: Record<string, unknown>): void {
  if (LEVEL_NUM[level] < LEVEL_NUM[currentLevel]) return;

  const parts = [
    `[${timestamp()}]`,
    `[${level}]`,
    `[${module}]`,
    message,
  ];

  if (extra && Object.keys(extra).length > 0) {
    parts.push(JSON.stringify(extra));
  }

  console.error(parts.join(' '));
}

export const logger = {
  debug: (module: string, msg: string, extra?: Record<string, unknown>) => log('DEBUG', module, msg, extra),
  info: (module: string, msg: string, extra?: Record<string, unknown>) => log('INFO', module, msg, extra),
  warn: (module: string, msg: string, extra?: Record<string, unknown>) => log('WARN', module, msg, extra),
  error: (module: string, msg: string, extra?: Record<string, unknown>) => log('ERROR', module, msg, extra),
};
