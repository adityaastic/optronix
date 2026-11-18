'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react';
import { acceptInvitationSchema, type AcceptInvitationInput } from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface VerifiedInviteDto {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  employeeCode: string;
  territory: string | null;
  department: string | null;
  role: { code: string; name: string };
  expiresAt: string | null;
}

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();
  const tokenParam = searchParams.get('token') ?? '';

  const [inviteInfo, setInviteInfo] = useState<VerifiedInviteDto | null>(null);
  const [verifying, setVerifying] = useState(Boolean(tokenParam));
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationInput>({
    resolver: zodResolver(acceptInvitationSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      token: tokenParam,
      password: '',
      confirmPassword: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (!tokenParam) {
      setVerifying(false);
      setVerifyError('No invitation token was provided in the link.');
      return;
    }
    setValue('token', tokenParam, { shouldValidate: true });
    setVerifying(true);
    setVerifyError(null);
    void apiFetch<{ invitation: VerifiedInviteDto }>('/auth/invite/verify', {
      query: { token: tokenParam },
      skipAuthRefresh: true,
    })
      .then((res) => setInviteInfo(res.data.invitation))
      .catch((err) => {
        setVerifyError(
          err instanceof ApiClientError
            ? err.message
            : 'This invitation link is invalid or has expired.',
        );
      })
      .finally(() => setVerifying(false));
  }, [tokenParam, setValue]);

  const pwValue = watch('password') ?? '';

  const rules = useMemo(
    () => [
      { label: '10+ characters', ok: pwValue.length >= 10 },
      {
        label: 'Upper & lowercase',
        ok: /[A-Z]/.test(pwValue) && /[a-z]/.test(pwValue),
      },
      { label: 'One number', ok: /[0-9]/.test(pwValue) },
      { label: 'One symbol', ok: /[^A-Za-z0-9]/.test(pwValue) },
    ],
    [pwValue],
  );

  const onSubmit = async (values: AcceptInvitationInput) => {
    setSubmitError(null);
    try {
      const res = await apiFetch<{ redirectPath: string }>(
        '/auth/invite/accept',
        {
          method: 'POST',
          body: values,
          skipAuthRefresh: true,
        },
      );
      await refreshSession();
      router.push(res.data.redirectPath || '/dashboard');
    } catch (err) {
      setSubmitError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to activate your account.',
      );
    }
  };

  return (
    <div className="w-full max-w-[440px]">
      <div className="bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-7 space-y-5">
        <div className="space-y-1">
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
            Accept workspace invitation
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Verify your assigned profile and set your initial password.
          </p>
        </div>

        {verifying ? (
          <div className="space-y-3 py-4">
            <div className="h-14 rounded-lg bg-surface-container animate-pulse" />
            <div className="h-9 rounded-lg bg-surface-container animate-pulse" />
            <div className="h-9 rounded-lg bg-surface-container animate-pulse" />
          </div>
        ) : verifyError ? (
          <div className="space-y-4">
            <StatusBanner tone="error" message={verifyError} />
            <p className="text-body-sm text-on-surface-variant">
              Ask your workspace administrator to resend your invitation link,
              or sign in if you have already activated your account.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">
                <ArrowLeft className="w-4 h-4" />
                Go to sign in
              </Link>
            </Button>
          </div>
        ) : inviteInfo ? (
          <>
            <div className="p-3.5 rounded-lg bg-surface-container-low border border-hairline space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-md font-semibold text-on-surface">
                  {inviteInfo.fullName}
                </span>
                <StatusBadge
                  status="INFO"
                  labelOverride={inviteInfo.role.name}
                  toneOverride="info"
                  showDot={false}
                />
              </div>
              <p className="text-body-sm text-on-surface-variant">
                {inviteInfo.email} · {inviteInfo.employeeCode}
              </p>
              {inviteInfo.territory ? (
                <p className="text-caption text-on-surface-variant">
                  Territory: {inviteInfo.territory}
                </p>
              ) : null}
            </div>

            {submitError ? (
              <StatusBanner
                tone="error"
                message={submitError}
                onDismiss={() => setSubmitError(null)}
              />
            ) : null}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <input type="hidden" {...register('token')} />

              <FormField
                label="Set password"
                htmlFor="invite-password"
                required
                error={errors.password?.message}
              >
                <div className="relative">
                  <Input
                    id="invite-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    aria-invalid={Boolean(errors.password)}
                    className="pr-10"
                    {...register('password')}
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

              <div className="grid grid-cols-2 gap-1.5">
                {rules.map((r) => (
                  <div
                    key={r.label}
                    className={cn(
                      'flex items-center gap-1.5 text-caption',
                      r.ok
                        ? 'text-emerald-700 font-medium'
                        : 'text-on-surface-variant',
                    )}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{r.label}</span>
                  </div>
                ))}
              </div>

              <FormField
                label="Confirm password"
                htmlFor="invite-confirm-password"
                required
                error={errors.confirmPassword?.message}
              >
                <Input
                  id="invite-confirm-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                  {...register('confirmPassword')}
                />
              </FormField>

              <FormField
                label="Mobile number"
                htmlFor="invite-phone"
                hint="Optional"
                error={errors.phone?.message}
              >
                <Input
                  id="invite-phone"
                  type="tel"
                  placeholder="+91 98100 00000"
                  aria-invalid={Boolean(errors.phone)}
                  {...register('phone')}
                />
              </FormField>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting
                  ? 'Activating account...'
                  : 'Activate account & continue'}
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="h-80" />}>
      <InviteAcceptContent />
    </Suspense>
  );
}
