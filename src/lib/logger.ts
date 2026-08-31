/* eslint-disable no-console */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const MIN_LEVEL: LogLevel = process.env.LOG_LEVEL as LogLevel || 'INFO';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, message: string, context?: unknown): string {
  const ts = timestamp();
  const ctx = context !== undefined && context !== '' ? ` ${JSON.stringify(context)}` : '';
  return `${ts} [${level}] ${message}${ctx}`;
}

export const logger = {
  log(message: string, context?: unknown) {
    if (!shouldLog('INFO')) return;
    console.log(format('INFO', message, context));
  },
  error(message: string, error?: unknown) {
    console.error(format('ERROR', message, error));
  },
  warn(message: string, context?: unknown) {
    if (!shouldLog('WARN')) return;
    console.warn(format('WARN', message, context));
  },
  debug(message: string, context?: unknown) {
    if (!shouldLog('DEBUG')) return;
    console.debug(format('DEBUG', message, context));
  },
};
