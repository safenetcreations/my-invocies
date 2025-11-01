/**
 * Enhanced Authentication Hook
 * Handles multi-tenant authentication, company switching, and RBAC
 */

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebase';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

export interface TenantMembership {
  role: 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';
  permissions: string[];
}

export interface CustomClaims {
  tenantMemberships?: {
    [tenantId: string]: TenantMembership;
  };
  activeTenantId?: string;
}

export interface AuthUser extends User {
  customClaims?: CustomClaims;
}

export interface Tenant {
  id: string;
  name: string;
  legalName: string;
  branding?: {
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
}

export interface TenantContext {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  branding?: Tenant['branding'];
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  activeTenant: TenantContext | null;
  tenants: Tenant[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, tenantData: any) => Promise<void>;
  signOut: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshClaims: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  resetPassword: (email: string) => Promise<void>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTenant, setActiveTenant] = useState<TenantContext | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  // Get API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/my-invocies/us-central1/api';

  /**
   * Load user's custom claims and tenant data
   */
  const loadUserData = async (firebaseUser: User) => {
    try {
      // Get ID token with claims
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      const customClaims = tokenResult.claims as CustomClaims;

      // Create auth user with claims
      const authUser: AuthUser = {
        ...firebaseUser,
        customClaims,
      };

      setUser(authUser);

      // Load tenants
      if (customClaims.tenantMemberships) {
        const tenantIds = Object.keys(customClaims.tenantMemberships);

        // Fetch tenant details
        const token = await firebaseUser.getIdToken();
        const tenantsData = await Promise.all(
          tenantIds.map(async (tenantId) => {
            try {
              const response = await axios.get(`${API_URL}/api/tenants/${tenantId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              return response.data.tenant;
            } catch (error) {
              console.error(`Error fetching tenant ${tenantId}:`, error);
              return null;
            }
          })
        );

        setTenants(tenantsData.filter(Boolean));

        // Set active tenant
        if (customClaims.activeTenantId) {
          const activeTenantData = tenantsData.find(
            (t) => t?.id === customClaims.activeTenantId
          );

          if (activeTenantData) {
            const membership = customClaims.tenantMemberships[customClaims.activeTenantId];
            setActiveTenant({
              id: activeTenantData.id,
              name: activeTenantData.name,
              role: membership.role,
              permissions: membership.permissions,
              branding: activeTenantData.branding,
            });

            // Apply theme
            applyTenantTheme(activeTenantData.branding);
          }
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  /**
   * Apply tenant branding theme
   */
  const applyTenantTheme = (branding?: Tenant['branding']) => {
    if (!branding) return;

    const root = document.documentElement;
    root.style.setProperty('--primary-color', branding.primaryColor);
    root.style.setProperty('--secondary-color', branding.secondaryColor);
    root.style.setProperty('--accent-color', branding.accentColor);
  };

  /**
   * Listen to auth state changes
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await loadUserData(firebaseUser);
      } else {
        setUser(null);
        setActiveTenant(null);
        setTenants([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Sign in with email and password
   */
  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // User data will be loaded by onAuthStateChanged
    } catch (error: any) {
      setLoading(false);
      throw new Error(error.message);
    }
  };

  /**
   * Sign up and create first tenant
   */
  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    tenantData: any
  ) => {
    setLoading(true);
    try {
      // Register via API (creates user and tenant)
      await axios.post(`${API_URL}/api/auth/register`, {
        email,
        password,
        displayName,
        tenantData,
      });

      // Sign in the user
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setLoading(false);
      throw new Error(error.response?.data?.error || error.message);
    }
  };

  /**
   * Sign out
   */
  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setActiveTenant(null);
    setTenants([]);

    // Reset theme
    const root = document.documentElement;
    root.style.removeProperty('--primary-color');
    root.style.removeProperty('--secondary-color');
    root.style.removeProperty('--accent-color');
  };

  /**
   * Switch active tenant
   */
  const switchTenant = async (tenantId: string) => {
    if (!user) throw new Error('Not authenticated');

    try {
      const token = await user.getIdToken();

      // Call API to switch tenant
      await axios.post(
        `${API_URL}/api/auth/switch-tenant`,
        { tenantId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Refresh claims
      await refreshClaims();

      // Reload page to apply new context
      window.location.reload();
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.message);
    }
  };

  /**
   * Refresh user's custom claims
   */
  const refreshClaims = async () => {
    if (!user) return;

    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
      await loadUserData(firebaseUser);
    }
  };

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: string): boolean => {
    if (!activeTenant) return false;

    const permissions = activeTenant.permissions;

    // Owner has all permissions
    if (activeTenant.role === 'owner') return true;

    // Check exact permission
    if (permissions.includes(permission)) return true;

    // Check wildcard permission (e.g., 'invoices:*')
    const [resource] = permission.split(':');
    if (permissions.includes(`${resource}:*`)) return true;

    // Check super permission
    if (permissions.includes('*')) return true;

    return false;
  };

  /**
   * Send password reset email
   */
  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const value: AuthContextType = {
    user,
    loading,
    activeTenant,
    tenants,
    signIn,
    signUp,
    signOut,
    switchTenant,
    refreshClaims,
    hasPermission,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// ============================================================================
// AXIOS INTERCEPTOR (Auto-attach token)
// ============================================================================

export function setupAxiosInterceptor() {
  axios.interceptors.request.use(
    async (config) => {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Token expired or invalid, sign out
        firebaseSignOut(auth);
      }
      return Promise.reject(error);
    }
  );
}
