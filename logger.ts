/**
 * Logging utility for consistent error and message formatting
 */

// Terminal color codes for prettier console output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  underline: "\x1b[4m",
};

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Logger configuration
 */
export interface LoggerOptions {
  level: LogLevel;
  showTimestamp: boolean;
  colorize: boolean;
}

// Default options
const defaultOptions: LoggerOptions = {
  level: LogLevel.INFO,
  showTimestamp: true,
  colorize: true,
};

// Current options
let options: LoggerOptions = { ...defaultOptions };

/**
 * Set logger options
 */
export function configure(newOptions: Partial<LoggerOptions>): void {
  options = { ...options, ...newOptions };
}

/**
 * Format timestamp
 */
function getTimestamp(): string {
  if (!options.showTimestamp) return "";

  const now = new Date();
  const timestamp = now.toISOString();
  return options.colorize ? `${colors.dim}[${timestamp}]${colors.reset} ` : `[${timestamp}] `;
}

/**
 * Log debug message
 */
export function debug(message: string, ...args: unknown[]): void {
  if (options.level > LogLevel.DEBUG) return;

  const prefix = options.colorize ? `${colors.blue}DEBUG${colors.reset}` : "DEBUG";
  console.log(`${getTimestamp()}${prefix}: ${message}`, ...args);
}

/**
 * Log info message
 */
export function info(message: string, ...args: unknown[]): void {
  if (options.level > LogLevel.INFO) return;

  const prefix = options.colorize ? `${colors.green}INFO${colors.reset}` : "INFO";
  console.log(`${getTimestamp()}${prefix}: ${message}`, ...args);
}

/**
 * Log warning message
 */
export function warn(message: string, ...args: unknown[]): void {
  if (options.level > LogLevel.WARN) return;

  const prefix = options.colorize ? `${colors.yellow}WARN${colors.reset}` : "WARN";
  console.warn(`${getTimestamp()}${prefix}: ${message}`, ...args);
}

/**
 * Log error message
 */
export function error(message: string, ...args: unknown[]): void {
  if (options.level > LogLevel.ERROR) return;

  const prefix = options.colorize ? `${colors.red}ERROR${colors.reset}` : "ERROR";
  console.error(`${getTimestamp()}${prefix}: ${message}`, ...args);
}

/**
 * Pretty print an error with stack trace formatting
 */
export function prettyError(err: Error, context = ""): void {
  if (options.level > LogLevel.ERROR) return;

  const errorType = err.constructor.name;
  const message = err.message;
  const contextStr = context ? `[${context}] ` : "";

  if (options.colorize) {
    console.error(
      `${getTimestamp()}${colors.bold}${colors.red}${contextStr}${errorType}${colors.reset}: ${message}`,
    );
  } else {
    console.error(`${getTimestamp()}${contextStr}${errorType}: ${message}`);
  }

  if (err.stack) {
    // Format each line of the stack trace
    const stackLines = err.stack.split("\n").slice(1);
    for (const line of stackLines) {
      // Parse stack trace line to extract location information
      const match = line.match(/at\s+([^\s]+)\s+\(([^:]+):(\d+):(\d+)\)/);
      if (match) {
        const [, func, file, line, col] = match;
        // Print formatted stack trace line
        if (options.colorize) {
          console.error(
            `  ${colors.dim}at ${colors.cyan}${func}${colors.dim} (${file}:${line}:${col})${colors.reset}`,
          );
        } else {
          console.error(`  at ${func} (${file}:${line}:${col})`);
        }
      } else {
        // For stack lines that don't match the pattern
        if (options.colorize) {
          console.error(`  ${colors.dim}${line}${colors.reset}`);
        } else {
          console.error(`  ${line}`);
        }
      }
    }
  }
}
