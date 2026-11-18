'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';
  const emailHint = searchParams.get('email');

  const [showNew, setShowNew] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      token: initialToken,
      newPassword: '',
      confirmPassword: '',
      invalidateRemoteSessions: true,
    },
  });

  useEffect(() => {
    if (initialToken) {
      setValue('token', initialToken, { shouldValidate: true });
    }
  }, [initialToken, setValue]);

  const newPw = watch('newPassword') ?? '';

  const rules = useMemo(
    () => [
      { label: 'At least 10 characters', ok: newPw.length >= 10 },
      { label: 'One uppercase & lowercase letter', ok: /[A-Z]/.test(newPw) && /[a-z]/.test(newPw) },
      { label: 'At least one number', ok: /[0-9]/.test(newPw) },
      { label: 'At least one symbol', ok: /[^A-Za-z0-9]/.test(newPw) },
    ],
    [newPw],
  );

  const onSubmit = async (values: ResetPasswordInput) => {
    setServerError(null);
    setSuccessMessage(null);
    try {
      const { data } = await apiFetch<{ message: string }>(
        '/auth/reset-password',
        {
          method: 'POST',
          body: values,
          skipAuthRefresh: true,
        },
      );
      setSuccessMessage(data.message);
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setServerError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update password.',
      );
    }
  };

  return (
    <div className="w-full max-w-[420px]">
      <div className="bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-7 space-y-5">
        <div className="space-y-1">
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
            Choose a new password
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            {emailHint
              ? `Updating credentials for ${emailHint}.`
              : 'Enter a strong password to secure your account.'}
          </p>
        </div>

        {serverError ? (
          <StatusBanner
            tone="error"
            message={serverError}
            onDismiss={() => setServerError(null)}
          />
        ) : null}

        {successMessage ? (
          <StatusBanner
            tone="success"
            message={`${successMessage} Redirecting...`}
          />
        ) : null}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          {!initialToken ? (
            <FormField
              label="Recovery token"
              htmlFor="token"
              required
              error={errors.token?.message}
            >
              <Input
                id="token"
                placeholder="Paste recovery token"
                aria-invalid={Boolean(errors.token)}
                {...register('token')}
              />
            </FormField>
          ) : (
            <input type="hidden" {...register('token')} />
          )}

          <FormField
            label="New password"
            htmlFor="new-password"
            required
            error={errors.newPassword?.message}
          >
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                placeholder="Create a strong password"
                aria-invalid={Boolean(errors.newPassword)}
                className="pr-10"
                {...register('newPassword')}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-2 p-0.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                {showNew ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            {rules.map((r) => (
              <div
                key={r.label}
                className={cn(
                  'flex items-center gap-1.5 text-caption',
                  r.ok ? 'text-emerald-700 font-medium' : 'text-on-surface-variant',
                )}
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{r.label}</span>
              </div>
            ))}
          </div>

          <FormField
            label="Confirm password"
            htmlFor="confirm-password"
            required
            error={errors.confirmPassword?.message}
          >
            <Input
              id="confirm-password"
              type={showNew ? 'text' : 'password'}
              placeholder="Repeat your new password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
            />
          </FormField>

          <label className="flex items-center gap-2 text-body-sm text-on-surface-variant cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              {...register('invalidateRemoteSessions')}
              className="w-4 h-4 rounded accent-secondary cursor-pointer"
            />
            <span>Sign out of other active devices</span>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </Button>
        </form>

        <div className="pt-3 border-t border-hairline">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-on-surface"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-80" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
