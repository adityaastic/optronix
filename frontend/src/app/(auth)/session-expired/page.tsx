'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CachedIdentity {
  email: string;
  fullName: string;
  roleName: string;
  employeeCode: string;
}

export default function SessionExpiredPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const [identity, setIdentity] = useState<CachedIdentity | null>(null);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('optronix_last_identity');
      if (raw) {
        const parsed = JSON.parse(raw) as CachedIdentity;
        if (parsed.email) setIdentity(parsed);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity?.email || !password.trim()) return;
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await login({
        email: identity.email,
        password,
        rememberWorkstation: true,
      });
      router.push('/dashboard');
    } catch (err) {
      setErrorMsg(
        err instanceof ApiClientError
          ? err.message
          : 'Incorrect password. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-7 space-y-5">
        <div className="space-y-1">
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
            Session expired
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Please re-enter your password to continue working.
          </p>
        </div>

        {identity ? (
          <div className="p-3 rounded-lg bg-surface-container-low border border-hairline flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-on-surface truncate">
                {identity.fullName}
              </p>
              <p className="text-caption text-on-surface-variant truncate">
                {identity.email}
              </p>
            </div>
            <span className="text-caption text-on-surface-variant shrink-0">
              {identity.roleName}
            </span>
          </div>
        ) : null}

        {errorMsg ? (
          <StatusBanner
            tone="error"
            message={errorMsg}
            onDismiss={() => setErrorMsg(null)}
          />
        ) : null}

        {identity ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <FormField label="Password" htmlFor="unlock-pw" required>
              <div className="relative">
                <Input
                  id="unlock-pw"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-2 p-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  {showPw ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </FormField>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting || !password.trim()}
              className="w-full"
            >
              {isSubmitting ? 'Signing in...' : 'Continue session'}
            </Button>
          </form>
        ) : (
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        )}

        <div className="pt-3 border-t border-hairline flex items-center justify-between text-body-sm">
          <Link
            href="/login"
            className="text-on-surface-variant hover:text-on-surface"
          >
            Switch account
          </Link>
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem('optronix_last_identity');
              void logout();
            }}
            className="text-error hover:underline cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
