/* eslint-disable no-console */
function shouldLog(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export const logger = {
  log(message: string, context?: unknown) {
    if (shouldLog()) {
      console.log(message, context ?? '');
    }
  },
  error(message: string, error?: unknown, context?: unknown) {
    console.error(message, error ?? '', context ?? '');
  },
  warn(message: string, context?: unknown) {
    if (shouldLog()) {
      console.warn(message, context ?? '');
    }
  },
  debug(message: string, context?: unknown) {
    if (shouldLog()) {
      console.debug(message, context ?? '');
    }
  },
};
