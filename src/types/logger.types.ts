/**
 * Logger type definitions for the Percent Protocol
 */

/**
 * Log levels enum - controls verbosity
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * Log categories enum - organizes logs by component
 */
export enum LogCategory {
  SYSTEM = 'system',
  MODERATOR = 'moderator',
  PROPOSAL = 'proposal',
  API = 'api',
  AMM = 'amm',
  VAULT = 'vault',
  TWAP = 'twap',
  SCHEDULER = 'scheduler',
  WEBSOCKET = 'websocket',
}