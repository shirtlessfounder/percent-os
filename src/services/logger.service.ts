import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Logger service - writes to different files based on category
 */
export class LoggerService {
  private logger: winston.Logger;
  private category: string;
  private static instances: Map<string, LoggerService> = new Map();

  constructor(category: string) {
    this.category = category;
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Configure transports
    const transports: winston.transport[] = [];

    // Console transport (only in development)
    if (process.env.NODE_ENV !== 'production' && process.env.LOG_TO_CONSOLE !== 'false') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `[${this.category}] ${level}: ${message}${metaStr}`;
            })
          )
        })
      );
    }

    // File transport - one file per category
    if (process.env.LOG_TO_FILE !== 'false') {
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, `${this.category}.log`),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );

      // Error log file (all errors go here regardless of category)
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'errors.log'),
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    }

    // Create logger instance
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta: { category: this.category },
      transports,
      exitOnError: false
    });
  }

  /**
   * Get or create a logger instance for a specific category
   */
  static getInstance(category: string): LoggerService {
    if (!this.instances.has(category)) {
      this.instances.set(category, new LoggerService(category));
    }
    return this.instances.get(category)!;
  }

  /**
   * Core logging methods
   */
  error(message: string, meta?: any): void {
    this.logger.error(message, this.sanitizeMeta(meta));
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, this.sanitizeMeta(meta));
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, this.sanitizeMeta(meta));
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, this.sanitizeMeta(meta));
  }

  /**
   * Sanitize metadata to ensure all values are serializable
   */
  private sanitizeMeta(meta?: any): any {
    if (!meta) return {};

    const sanitized: any = {};

    for (const [key, value] of Object.entries(meta)) {
      // Skip null/undefined values
      if (value === null || value === undefined) continue;

      // Handle Error objects first
      if (value instanceof Error) {
        sanitized[key] = {
          message: value.message,
          stack: value.stack
        };
      }
      // Handle PublicKey objects (Solana addresses)
      else if (value && typeof value === 'object' && 'toBase58' in value) {
        sanitized[key] = (value as any).toBase58();
      }
      // Convert BigNumber/BN to string
      else if (value && typeof value === 'object' && 'toString' in value && !Array.isArray(value)) {
        sanitized[key] = value.toString();
      }
      // Pass through primitive values and arrays
      else if (typeof value !== 'function') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}