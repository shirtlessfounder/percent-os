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
  ROUTER = 'router',
  MODERATOR = 'moderator',
  API = 'api',
  WEBSOCKET = 'websocket',
}