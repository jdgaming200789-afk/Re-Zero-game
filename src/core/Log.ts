/**
 * Tagged logger. Debug-level output is stripped from player builds unless the
 * developer tools are enabled, so gameplay code can log freely.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let minLevel: Level = import.meta.env.DEV ? 'debug' : 'info';

export function setLogLevel(level: Level): void {
  minLevel = level;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  const emit = (level: Level, args: unknown[]) => {
    if (levelOrder[level] < levelOrder[minLevel]) return;
    const fn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
    fn(prefix, ...args);
  };
  return {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
  };
}
