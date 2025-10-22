/**
 * Logger factory utilities for creating pre-configured loggers
 */

import { LoggerService } from '../services/logger.service';
import { LogCategory } from '../types/logger.types';

/**
 * Create a logger for a specific category
 * @param category - The log category (system, api, transaction, etc.) or custom string
 *
 * @example
 * // Using enum
 * const logger = createLogger(LogCategory.SYSTEM);
 *
 * // Using custom string for moderator
 * const modLogger = createLogger(`${LogCategory.MODERATOR}-${moderatorId}`);
 *
 * // Using custom string for proposal
 * const propLogger = createLogger(`${LogCategory.PROPOSAL}-${proposalId}`);
 */
export function createLogger(category: LogCategory | string): LoggerService {
  return LoggerService.getInstance(category);
}

// Export all category enums for convenience
export { LogCategory, LogLevel } from '../types/logger.types';