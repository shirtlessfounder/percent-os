import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../../app/services/logger.service';

const logger = new LoggerService('api');

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('An Error Occurred:', {
    error: err.message,
    stack: err.stack,
    request: {
      method: req.method,
      url: req.url,
      body: req.body
    }
  });
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
};