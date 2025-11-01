/**
 * RBAC Middleware
 * Role-Based Access Control for Cloud Functions
 */

import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { authService, CustomClaims } from '../services/authService';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken & { customClaims: CustomClaims };
  tenantId?: string;
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Verify Firebase ID token and attach user to request
 */
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify token
    const decodedToken = await authService.verifyToken(idToken);

    // Attach user to request with custom claims
    req.user = {
      ...decodedToken,
      customClaims: (decodedToken as any) as CustomClaims,
    };

    // Update last login
    await authService.updateLastLogin(decodedToken.uid);

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

// ============================================================================
// AUTHORIZATION MIDDLEWARE
// ============================================================================

/**
 * Require user to be authenticated
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/**
 * Require user to have access to a specific tenant
 * Extracts tenantId from route params, query, or body
 */
export function requireTenantAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Extract tenant ID from various sources
  const tenantId =
    req.params.tenantId ||
    req.query.tenantId ||
    req.body.tenantId ||
    req.user.customClaims?.activeTenantId;

  if (!tenantId) {
    res.status(400).json({ error: 'Tenant ID required' });
    return;
  }

  // Check if user has access to this tenant
  const hasTenantAccess =
    req.user.customClaims?.tenantMemberships &&
    tenantId in req.user.customClaims.tenantMemberships;

  if (!hasTenantAccess) {
    res.status(403).json({ error: 'Access denied to this tenant' });
    return;
  }

  // Attach tenant ID to request
  req.tenantId = tenantId as string;

  next();
}

/**
 * Require user to have a specific permission in the active tenant
 */
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!req.tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    // Check permission
    const hasPermission = authService.hasPermission(
      req.user.customClaims,
      req.tenantId,
      permission
    );

    if (!hasPermission) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
      });
      return;
    }

    next();
  };
}

/**
 * Require user to have a specific role in the active tenant
 */
export function requireRole(role: string | string[]) {
  const roles = Array.isArray(role) ? role : [role];

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!req.tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const membership = req.user.customClaims?.tenantMemberships?.[req.tenantId];
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this tenant' });
      return;
    }

    const hasRole = roles.includes(membership.role);
    if (!hasRole) {
      res.status(403).json({
        error: 'Insufficient role',
        required: roles,
        current: membership.role,
      });
      return;
    }

    next();
  };
}

/**
 * Require user to be owner of the tenant
 */
export function requireOwner(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return;
  }

  const membership = req.user.customClaims?.tenantMemberships?.[req.tenantId];
  if (!membership || membership.role !== 'owner') {
    res.status(403).json({ error: 'Owner access required' });
    return;
  }

  next();
}

/**
 * Require user to be admin or owner
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.tenantId) {
    res.status(400).json({ error: 'Tenant context required' });
    return;
  }

  const membership = req.user.customClaims?.tenantMemberships?.[req.tenantId];
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Ensure tenant ID in request body matches active tenant (prevents cross-tenant writes)
 */
export function validateTenantId(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.body.tenantId && req.body.tenantId !== req.tenantId) {
    res.status(400).json({
      error: 'Tenant ID mismatch',
      message: 'Request data must belong to the active tenant',
    });
    return;
  }

  // Auto-inject tenantId if not present
  if (!req.body.tenantId && req.tenantId) {
    req.body.tenantId = req.tenantId;
  }

  next();
}

// ============================================================================
// UTILITY MIDDLEWARES
// ============================================================================

/**
 * Rate limiting middleware (basic implementation)
 * For production, use Redis-based rate limiting
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const key = req.user?.uid || req.ip;
    const now = Date.now();

    const record = requestCounts.get(key);

    if (!record || now > record.resetTime) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }

    record.count++;
    next();
  };
}

/**
 * Audit logging middleware
 */
export async function auditLog(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  // Capture response
  const originalJson = res.json.bind(res);
  let responseBody: any;

  res.json = function (body: any) {
    responseBody = body;
    return originalJson(body);
  };

  // Continue request
  res.on('finish', async () => {
    if (req.user && req.tenantId) {
      const duration = Date.now() - startTime;

      // Log to Firestore (don't await to avoid blocking)
      admin
        .firestore()
        .collection('auditLogs')
        .add({
          tenantId: req.tenantId,
          userId: req.user.uid,
          action: `${req.method} ${req.path}`,
          resourceType: req.path.split('/')[2], // Extract resource from path
          statusCode: res.statusCode,
          duration,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          timestamp: admin.firestore.Timestamp.now(),
        })
        .catch(err => console.error('Audit log error:', err));
    }
  });

  next();
}

// ============================================================================
// COMPOSITE MIDDLEWARES
// ============================================================================

/**
 * Standard middleware chain for protected routes
 */
export const protectedRoute = [authenticate, requireAuth, requireTenantAccess];

/**
 * Admin-only route
 */
export const adminRoute = [authenticate, requireAuth, requireTenantAccess, requireAdmin];

/**
 * Owner-only route
 */
export const ownerRoute = [authenticate, requireAuth, requireTenantAccess, requireOwner];
