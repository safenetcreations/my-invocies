/**
 * Authentication Service
 * Handles user authentication, custom claims, and multi-tenant access control
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { db, Collections, TenantUser, tenantService } from './multiTenantFirestore';

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================

export const ROLE_PERMISSIONS = {
  owner: ['*'], // All permissions
  admin: [
    'tenants:read',
    'tenants:update',
    'users:*',
    'clients:*',
    'products:*',
    'invoices:*',
    'payments:*',
    'reports:*',
    'settings:*',
  ],
  accountant: [
    'tenants:read',
    'clients:read',
    'products:read',
    'invoices:*',
    'payments:*',
    'reports:*',
  ],
  sales: [
    'tenants:read',
    'clients:*',
    'products:read',
    'invoices:create',
    'invoices:read',
    'invoices:update',
    'payments:read',
  ],
  viewer: [
    'tenants:read',
    'clients:read',
    'products:read',
    'invoices:read',
    'payments:read',
    'reports:read',
  ],
} as const;

export type Role = keyof typeof ROLE_PERMISSIONS;

// ============================================================================
// CUSTOM CLAIMS INTERFACE
// ============================================================================

export interface CustomClaims {
  tenantMemberships: {
    [tenantId: string]: {
      role: Role;
      permissions: string[];
    };
  };
  activeTenantId?: string;
}

// ============================================================================
// AUTH SERVICE
// ============================================================================

export class AuthService {
  /**
   * Create a new user account
   */
  async createUser(email: string, password: string, displayName: string): Promise<admin.auth.UserRecord> {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    // Create user document in Firestore
    await db.collection(Collections.USERS).doc(userRecord.uid).set({
      id: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL || null,
      mfaEnabled: false,
      createdAt: Timestamp.now(),
      lastLogin: null,
    });

    return userRecord;
  }

  /**
   * Add user to a tenant with a specific role
   */
  async addUserToTenant(
    userId: string,
    tenantId: string,
    role: Role,
    invitedBy: string
  ): Promise<TenantUser> {
    // Verify tenant exists
    const tenant = await tenantService.get(Collections.TENANTS, tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Check if user already exists in tenant
    const existingMemberships = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .where('tenantId', '==', tenantId)
      .get();

    if (!existingMemberships.empty) {
      throw new Error('User already exists in this tenant');
    }

    // Create tenant membership
    const membershipRef = db.collection(Collections.TENANT_USERS).doc();
    const tenantUser: TenantUser = {
      id: membershipRef.id,
      tenantId,
      userId,
      role,
      permissions: ROLE_PERMISSIONS[role],
      invitedBy,
      joinedAt: Timestamp.now(),
      status: 'active',
    };

    await membershipRef.set(tenantUser);

    // Update user's custom claims
    await this.updateUserClaims(userId);

    return tenantUser;
  }

  /**
   * Remove user from a tenant
   */
  async removeUserFromTenant(userId: string, tenantId: string): Promise<void> {
    const memberships = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .where('tenantId', '==', tenantId)
      .get();

    const batch = db.batch();
    memberships.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Update user's custom claims
    await this.updateUserClaims(userId);
  }

  /**
   * Update user's role in a tenant
   */
  async updateUserRole(userId: string, tenantId: string, newRole: Role): Promise<void> {
    const memberships = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .where('tenantId', '==', tenantId)
      .get();

    if (memberships.empty) {
      throw new Error('User is not a member of this tenant');
    }

    const membership = memberships.docs[0];
    await membership.ref.update({
      role: newRole,
      permissions: ROLE_PERMISSIONS[newRole],
    });

    // Update user's custom claims
    await this.updateUserClaims(userId);
  }

  /**
   * Update user's custom claims based on tenant memberships
   */
  async updateUserClaims(userId: string): Promise<void> {
    // Fetch all tenant memberships for this user
    const membershipsSnapshot = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();

    const tenantMemberships: CustomClaims['tenantMemberships'] = {};

    for (const doc of membershipsSnapshot.docs) {
      const membership = doc.data() as TenantUser;
      tenantMemberships[membership.tenantId] = {
        role: membership.role,
        permissions: membership.permissions,
      };
    }

    // Get current user's claims to preserve activeTenantId if it exists
    const user = await admin.auth().getUser(userId);
    const currentClaims = (user.customClaims || {}) as CustomClaims;

    // Set active tenant (prefer current, fallback to first tenant, or undefined)
    let activeTenantId = currentClaims.activeTenantId;
    if (!activeTenantId || !(activeTenantId in tenantMemberships)) {
      activeTenantId = Object.keys(tenantMemberships)[0];
    }

    const customClaims: CustomClaims = {
      tenantMemberships,
      activeTenantId,
    };

    // Set custom claims
    await admin.auth().setCustomUserClaims(userId, customClaims);
  }

  /**
   * Switch user's active tenant
   */
  async switchActiveTenant(userId: string, tenantId: string): Promise<void> {
    // Verify user has access to this tenant
    const membership = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'active')
      .get();

    if (membership.empty) {
      throw new Error('User does not have access to this tenant');
    }

    // Get current claims
    const user = await admin.auth().getUser(userId);
    const currentClaims = (user.customClaims || {}) as CustomClaims;

    // Update active tenant
    const newClaims: CustomClaims = {
      ...currentClaims,
      activeTenantId: tenantId,
    };

    await admin.auth().setCustomUserClaims(userId, newClaims);
  }

  /**
   * Get user's tenant memberships
   */
  async getUserTenantMemberships(userId: string): Promise<TenantUser[]> {
    const snapshot = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();

    return snapshot.docs.map(doc => doc.data() as TenantUser);
  }

  /**
   * Check if user has permission in a tenant
   */
  hasPermission(
    customClaims: CustomClaims,
    tenantId: string,
    permission: string
  ): boolean {
    const membership = customClaims.tenantMemberships?.[tenantId];
    if (!membership) return false;

    const permissions = membership.permissions;

    // Check for owner (has all permissions)
    if (membership.role === 'owner') return true;

    // Check for exact permission
    if (permissions.includes(permission)) return true;

    // Check for wildcard permission (e.g., 'invoices:*')
    const [resource] = permission.split(':');
    if (permissions.includes(`${resource}:*`)) return true;

    // Check for super permission
    if (permissions.includes('*')) return true;

    return false;
  }

  /**
   * Verify Firebase ID token and extract claims
   */
  async verifyToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return await admin.auth().verifyIdToken(idToken);
  }

  /**
   * Create a new tenant and make the user the owner
   */
  async createTenantWithOwner(
    userId: string,
    tenantData: any
  ): Promise<{ tenantId: string; membershipId: string }> {
    // Create tenant
    const tenant = await tenantService.createTenant(tenantData);

    // Add user as owner
    const membership = await this.addUserToTenant(userId, tenant.id, 'owner', userId);

    return {
      tenantId: tenant.id,
      membershipId: membership.id,
    };
  }

  /**
   * Invite user to tenant via email
   */
  async inviteUserToTenant(
    email: string,
    tenantId: string,
    role: Role,
    invitedBy: string
  ): Promise<{ userId: string; membershipId: string }> {
    // Check if user exists
    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      // User doesn't exist, create invitation
      const tempPassword = this.generateTempPassword();
      userRecord = await this.createUser(email, tempPassword, email.split('@')[0]);

      // TODO: Send invitation email with password reset link
    }

    // Add user to tenant
    const membership = await this.addUserToTenant(userRecord.uid, tenantId, role, invitedBy);

    return {
      userId: userRecord.uid,
      membershipId: membership.id,
    };
  }

  /**
   * Generate temporary password for new users
   */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await db.collection(Collections.USERS).doc(userId).update({
      lastLogin: Timestamp.now(),
    });
  }

  /**
   * Delete user account (removes from all tenants and deletes auth account)
   */
  async deleteUser(userId: string): Promise<void> {
    // Remove from all tenants
    const memberships = await db
      .collection(Collections.TENANT_USERS)
      .where('userId', '==', userId)
      .get();

    const batch = db.batch();
    memberships.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete user document
    await db.collection(Collections.USERS).doc(userId).delete();

    // Delete auth account
    await admin.auth().deleteUser(userId);
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const authService = new AuthService();
