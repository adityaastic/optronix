'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import {
  BrandSplashIntro,
  TypewriterText,
} from '@/components/shared/BrandSplashIntro';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEMO_ACCOUNTS = [
  { role: 'Sales Rep', email: 'aditya.sharma@optronix.com' },
  { role: 'Manager', email: 'priya.mehta@optronix.com' },
  { role: 'Admin', email: 'vikramaditya.roy@optronix.com' },
] as const;

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [introReady, setIntroReady] = useState(false);

  const showDemoAccounts =
    process.env.NEXT_PUBLIC_ENABLE_DEMO_PERSONAS !== 'false';
  const demoPresetPass =
    process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? 'Optronix@2026!';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      email: '',
      password: '',
      rememberWorkstation: true,
    },
  });

  const fillDemo = (email: string) => {
    setServerError(null);
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', demoPresetPass, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await login(values);
      const redirectTo = searchParams.get('redirect') || '/dashboard';
      router.push(redirectTo);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to reach the server. Please try again.');
      }
    }
  };

  return (
    <>
      <BrandSplashIntro onTransitionStart={() => setIntroReady(true)} />

      <div
        className={`w-full max-w-[400px] space-y-6 transition-all duration-500 ease-out ${
          introReady
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2.5'
        }`}
      >
        <div className="bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-7 space-y-5">
          <div className="space-y-1.5">
            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary min-h-[15px]">
              <TypewriterText
                text="Field Sales Workspace"
                active={introReady}
                startDelayMs={60}
                speedMs={24}
              />
            </span>
            <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
              Sign in
            </h1>
            <p className="text-body-sm text-on-surface-variant min-h-[20px]">
              <TypewriterText
                text="Schedule meetings, verify GPS visits & close follow-ups."
                active={introReady}
                startDelayMs={520}
                speedMs={18}
              />
            </p>
          </div>

        {serverError ? (
          <StatusBanner
            tone="error"
            message={serverError}
            onDismiss={() => setServerError(null)}
          />
        ) : null}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            label="Work email"
            htmlFor="email"
            required
            error={errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@optronix.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </FormField>

          <FormField
            label="Password"
            htmlFor="password"
            required
            error={errors.password?.message}
          >
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                aria-invalid={Boolean(errors.password)}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-2 p-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </FormField>

          <div className="flex items-center justify-between text-body-sm pt-0.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-on-surface-variant">
              <input
                type="checkbox"
                {...register('rememberWorkstation')}
                className="w-4 h-4 rounded accent-secondary cursor-pointer"
              />
              <span>Remember for 30 days</span>
            </label>

            <Link
              href="/forgot-password"
              className="text-secondary hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        {showDemoAccounts ? (
          <div className="pt-4 border-t border-hairline space-y-2">
            <span className="text-caption text-on-surface-variant block">
              Quick demo sign-in
            </span>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => fillDemo(acct.email)}
                  className="px-2.5 py-1.5 rounded-lg border border-hairline bg-surface-container-low hover:bg-surface-container text-label-sm text-on-surface font-medium transition-colors cursor-pointer text-center"
                >
                  {acct.role}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-center text-caption text-on-surface-variant">
        Invitation-only workspace. Ask your administrator for an onboarding
        invite if you don&apos;t have an account yet.
      </p>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-80" />}>
      <LoginFormContent />
    </Suspense>
  );
}
