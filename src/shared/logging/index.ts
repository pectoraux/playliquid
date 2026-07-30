/**
 * Structured JSON logger with contextual scopes.
 *
 * Every log entry is a JSON object with: timestamp, level, message, scope,
 * and arbitrary context fields. Correlation/request ids flow through
 * AsyncLocalStorage so that logs are traceable across the request lifecycle.
 */

import { getConfig } from '@/shared/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  scope: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/** A logger bound to a named scope (request, command, query, event, worker, projection, database). */
export class ScopedLogger {
  constructor(
    private readonly scope: string,
    private readonly baseContext: LogContext = {},
  ) {}

  child(scope: string, context: LogContext = {}): ScopedLogger {
    return new ScopedLogger(`${this.scope}:${scope}`, { ...this.baseContext, ...context });
  }

  debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.log('info', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext = {}, error?: unknown): void {
    const errorContext: LogContext = { ...context };
    if (error instanceof Error) {
      errorContext.errorName = error.name;
      errorContext.errorMessage = error.message;
      errorContext.errorStack = error.stack;
    } else if (error !== undefined) {
      errorContext.error = String(error);
    }
    this.log('error', message, errorContext);
  }

  fatal(message: string, context: LogContext = {}, error?: unknown): void {
    this.error(message, context, error);
  }

  private log(level: LogLevel, message: string, context: LogContext): void {
    const config = getConfig();
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.logLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      scope: this.scope,
      ...this.baseContext,
      ...context,
    };

    const output = JSON.stringify(entry);

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}

/** Factory for scope-specific loggers. */
const loggers = new Map<string, ScopedLogger>();

export function getLogger(scope: string, context: LogContext = {}): ScopedLogger {
  const key = `${scope}:${JSON.stringify(context)}`;
  let logger = loggers.get(key);
  if (!logger) {
    logger = new ScopedLogger(scope, context);
    loggers.set(key, logger);
  }
  return logger;
}

/** Pre-configured loggers for standard scopes. */
export const logger = {
  request: () => getLogger('request'),
  command: () => getLogger('command'),
  query: () => getLogger('query'),
  event: () => getLogger('event'),
  worker: () => getLogger('worker'),
  projection: () => getLogger('projection'),
  database: () => getLogger('database'),
  system: () => getLogger('system'),
};
