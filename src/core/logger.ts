// @ts-nocheck

const PREFIX = "L5R5e Combat Helper";

/**
 * Logs an error message with module prefix.
 *
 * @param {string} message - The main message
 * @param {...any} args - Additional arguments to log
 */
export function logError(message, ...args) {
  console.error(`${PREFIX} | ${message}`, ...args);
}

/**
 * Logs a warning message with module prefix.
 *
 * @param {string} message - The main message
 * @param {...any} args - Additional arguments to log
 */
export function logWarn(message, ...args) {
  console.warn(`${PREFIX} | ${message}`, ...args);
}

/**
 * Logs an info message with module prefix.
 *
 * @param {string} message - The main message
 * @param {...any} args - Additional arguments to log
 */
export function logInfo(message, ...args) {
  console.info(`${PREFIX} | ${message}`, ...args);
}
