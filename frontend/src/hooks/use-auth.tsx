'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { LoginInput, PermissionKey, RoleCode } from '@/shared';
import { API_BASE_URL, apiFetch } from '@/lib/api-client';
import { flushOfflineVisitQueue } from '@/lib/offline-visit-queue';

export type TenantCurrency = 'INR' | 'USD' | 'EUR' | 'GBP';

export function formatCurrencyAmount(
  amount: number,
  currency: TenantCurrency = 'INR',
): string {
  const symbols: Record<TenantCurrency, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${symbols[currency] ?? '₹'}${amount.toLocaleString(locale)}`;
}

export interface SessionUser {
  id: string;
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  territory: string | null;
  department: string | null;
  status: string;
  managerId: string | null;
  role: {
    id: string;
    code: RoleCode;
    name: string;
    tier: number;
  };
  permissions: PermissionKey[];
  unreadNotificationsCount: number;
  sidebarCounts?: {
    meetings: number;
    customers: number;
    followUps: number;
  };
  tenantSettings?: {
    organizationName: string;
    defaultTimezone: string;
    defaultCurrency: TenantCurrency;
    defaultGeofenceRadiusMeters: number;
  };
  lastLoginAt: string | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<SessionUser | null>;
  hasPermission: (permission: PermissionKey) => boolean;
  hasRole: (...roles: RoleCode[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshSession = useCallback(async () => {
    try {
      const { data } = await apiFetch<{ user: SessionUser }>('/auth/me');
      setUser(data.user);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          'optronix_last_identity',
          JSON.stringify({
            email: data.user.email,
            fullName: data.user.fullName,
            roleName: data.user.role.name,
            employeeCode: data.user.employeeCode,
          }),
        );
      }
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Automatically sync any offline-queued visit check-ins/check-outs when network returns
  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    void flushOfflineVisitQueue();
    const handleOnline = () => {
      void flushOfflineVisitQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user?.id]);

  // Live SSE Real-Time Event Stream (Notifications, Field Visits & Org Settings)
  useEffect(() => {
    if (!user?.id || typeof window === 'undefined' || !('EventSource' in window)) {
      return;
    }
    const es = new EventSource(`${API_BASE_URL}/notifications/stream`, {
      withCredentials: true,
    });
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as { event?: string };
        if (payload.event && payload.event !== 'CONNECTED') {
          void refreshSession();
          window.dispatchEvent(
            new CustomEvent('optronix:realtime', { detail: payload }),
          );
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };
    return () => {
      es.close();
    };
  }, [user?.id, refreshSession]);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await apiFetch<{ user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: input,
      skipAuthRefresh: true,
    });
    setUser(data.user);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'optronix_last_identity',
        JSON.stringify({
          email: data.user.email,
          fullName: data.user.fullName,
          roleName: data.user.role.name,
          employeeCode: data.user.employeeCode,
        }),
      );
    }
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  const permissionSet = useMemo(
    () => new Set<PermissionKey>(user?.permissions ?? []),
    [user?.permissions],
  );

  const hasPermission = useCallback(
    (permission: PermissionKey) => permissionSet.has(permission),
    [permissionSet],
  );

  const hasRole = useCallback(
    (...roles: RoleCode[]) => (user ? roles.includes(user.role.code) : false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      logout,
      refreshSession,
      hasPermission,
      hasRole,
    }),
    [user, isLoading, login, logout, refreshSession, hasPermission, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
