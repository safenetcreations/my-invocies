import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  businessId?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

export const requireBusinessAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = req.params.businessId || req.body.businessId || req.query.businessId;
    
    if (!businessId) {
      return res.status(400).json({ error: 'Business ID required' });
    }

    // Check if user has access to this business
    const businessUser = await prisma.businessUser.findFirst({
      where: {
        businessId,
        userId: req.user!.id,
      },
    });

    if (!businessUser && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

    req.businessId = businessId;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};