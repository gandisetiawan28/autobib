import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`[${statusCode}] ${message}`, { stack: err.stack, code: err.code });

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
    },
  });
}

export function createError(message: string, statusCode = 500, code?: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
