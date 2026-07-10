import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../utils/database';
import { createError } from './error.middleware';

export interface AuthRequest extends Request {
  userId?: string;
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(createError('No token provided', 401, 'UNAUTHORIZED'));
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, secret) as { userId: string };

    // Verify user exists in DB
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return next(createError('User not found', 401, 'UNAUTHORIZED'));

    req.userId = decoded.userId;
    next();
  } catch {
    next(createError('Invalid or expired token', 401, 'INVALID_TOKEN'));
  }
}

export function generateToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
}
