import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getActiveApiBaseUrl,
  mobileApiFetch,
  setCachedApiBaseUrl,
} from '../lib/api';
import {
  clearTokens,
  getDefaultApiBaseUrl,
  loadTokens,
  saveApiBaseUrl,
  saveTokens,
} from '../lib/storage';
import type { SessionUser } from '../lib/types';

interface AuthContextValue {
  user: SessionUser | null;
  isBootstrapping: boolean;
  apiBaseUrl: string;
  updateApiBaseUrl: (url: string) => Promise<string>;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (payload: {
    token: string;
    password: string;
    confirmPassword: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [apiBaseUrl, setApiBaseUrl] = useState(getDefaultApiBaseUrl());

  const refreshSession = useCallback(async () => {
    const { accessToken } = await loadTokens();
    if (!accessToken) {
      setUser(null);
      return;
    }
    try {
      const res = await mobileApiFetch<{ user: SessionUser }>('/auth/me');
      setUser(res.data.user);
    } catch {
      await clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const activeUrl = await getActiveApiBaseUrl();
        setApiBaseUrl(activeUrl);
        await refreshSession();
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, [refreshSession]);

  const updateApiBaseUrl = useCallback(async (url: string) => {
    const saved = await saveApiBaseUrl(url);
    setCachedApiBaseUrl(saved);
    setApiBaseUrl(saved);
    return saved;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await mobileApiFetch<{
      user: SessionUser;
      tokens?: { accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      body: { email, password, rememberWorkstation: true },
      skipAuthRefresh: true,
    });
    if (res.data.tokens) {
      await saveTokens(
        res.data.tokens.accessToken,
        res.data.tokens.refreshToken,
      );
    }
    setUser(res.data.user);
  }, []);

  const acceptInvitation = useCallback(
    async (payload: {
      token: string;
      password: string;
      confirmPassword: string;
      phone?: string;
    }) => {
      const res = await mobileApiFetch<{
        user: SessionUser;
        tokens?: { accessToken: string; refreshToken: string };
      }>('/auth/invite/accept', {
        method: 'POST',
        body: payload,
        skipAuthRefresh: true,
      });
      if (res.data.tokens) {
        await saveTokens(
          res.data.tokens.accessToken,
          res.data.tokens.refreshToken,
        );
      }
      setUser(res.data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await mobileApiFetch('/auth/logout', {
        method: 'POST',
        skipAuthRefresh: true,
      });
    } catch {
      // Ignore network disconnect on sign out
    } finally {
      await clearTokens();
      setUser(null);
    }
  }, []);

  const hasPermission = useCallback(
    (perm: string) => Boolean(user?.permissions.includes(perm)),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isBootstrapping,
      apiBaseUrl,
      updateApiBaseUrl,
      login,
      acceptInvitation,
      logout,
      refreshSession,
      hasPermission,
    }),
    [
      user,
      isBootstrapping,
      apiBaseUrl,
      updateApiBaseUrl,
      login,
      acceptInvitation,
      logout,
      refreshSession,
      hasPermission,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useMobileAuth must be used inside AuthProvider');
  }
  return ctx;
}
