import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let { statusCode = 500, message } = err;

  // Handle Prisma errors
  if (err.message.includes('P2002')) {
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.message.includes('P2025')) {
    statusCode = 404;
    message = 'Resource not found';
  }

  // Log error
  console.error(`Error ${statusCode}: ${message}`, {
    url: req.url,
    method: req.method,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  // Send error response
  res.status(statusCode).json({
    error: {
      message: process.env.NODE_ENV === 'production' ? 
        (statusCode < 500 ? message : 'Internal server error') : 
        message,
      statusCode,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};