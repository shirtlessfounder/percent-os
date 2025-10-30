import { LoggerService } from '@app/services/logger.service';
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  isAuthenticated?: boolean;
}

const logger = new LoggerService('api').createChild('auth');

export const requireApiKey = (req: AuthRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    logger.error('API_KEY not configured in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  if (apiKey !== validApiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  req.isAuthenticated = true;
  next();
};