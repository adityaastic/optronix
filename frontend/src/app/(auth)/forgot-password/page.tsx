'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [dispatchedMessage, setDispatchedMessage] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [emailPreviewUrl, setEmailPreviewUrl] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      email: '',
    },
  });

  const currentEmail = watch('email');

  const onSubmit = async (values: ForgotPasswordInput) => {
    setServerError(null);
    setDispatchedMessage(null);
    setDebugToken(null);
    setEmailPreviewUrl(null);
    try {
      const { data } = await apiFetch<{
        message: string;
        debugResetToken?: string;
        emailPreviewUrl?: string | null;
      }>('/auth/forgot-password', {
        method: 'POST',
        body: values,
        skipAuthRefresh: true,
      });
      setDispatchedMessage(data.message);
      if (data.debugResetToken) {
        setDebugToken(data.debugResetToken);
      }
      if (data.emailPreviewUrl) {
        setEmailPreviewUrl(data.emailPreviewUrl);
      }
    } catch (err) {
      setServerError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to send reset link right now.',
      );
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-surface-container-lowest rounded-xl border border-hairline shadow-resting p-6 sm:p-7 space-y-5">
        <div className="space-y-1">
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
            Reset password
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Enter your work email and we&apos;ll generate a 30-minute recovery
            link.
          </p>
        </div>

        {serverError ? (
          <StatusBanner
            tone="error"
            message={serverError}
            onDismiss={() => setServerError(null)}
          />
        ) : null}

        {dispatchedMessage ? (
          <div className="space-y-2">
            <StatusBanner tone="success" message={dispatchedMessage} />
            <div className="flex flex-col gap-1.5">
              {emailPreviewUrl ? (
                <a
                  href={emailPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-label-sm font-medium text-secondary hover:underline"
                >
                  Preview sent reset email (Ethereal inbox) ↗
                </a>
              ) : null}
              {debugToken ? (
                <Link
                  href={`/reset-password?token=${encodeURIComponent(debugToken)}&email=${encodeURIComponent(currentEmail)}`}
                  className="inline-block text-label-sm font-medium text-secondary hover:underline"
                >
                  Continue to reset password (sandbox link) →
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            label="Work email"
            htmlFor="corporateEmail"
            required
            error={errors.email?.message}
          >
            <Input
              id="corporateEmail"
              type="email"
              placeholder="you@optronix.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Sending link...' : 'Send reset link'}
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
