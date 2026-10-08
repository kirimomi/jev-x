export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

let isDebugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  isDebugEnabled = enabled;
}

export const logger: Logger = {
  debug(...args: unknown[]): void {
    if (isDebugEnabled) {
      console.log('[jev-x:debug]', ...args);
    }
  },
  info(...args: unknown[]): void {
    console.log('[jev-x]', ...args);
  },
  warn(...args: unknown[]): void {
    console.warn('[jev-x]', ...args);
  },
  error(...args: unknown[]): void {
    console.error('[jev-x]', ...args);
  },
};
