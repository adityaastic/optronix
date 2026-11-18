'use client';

import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} requiredIndicator={required}>
          {label}
        </Label>
        {hint ? (
          <span className="text-caption text-on-surface-variant">{hint}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-caption text-error flex items-center gap-1 pt-0.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function StatusBanner({
  tone = 'info',
  message,
  onDismiss,
  className,
}: {
  tone?: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    error: 'bg-error-container border-error/25 text-on-error-container',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-secondary-fixed border-secondary-fixed-dim text-on-secondary-fixed',
  };

  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'error' || tone === 'warning'
        ? AlertCircle
        : Info;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'px-3.5 py-2.5 rounded-lg border text-body-sm flex items-center justify-between gap-3',
        styles[tone],
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-black/5 cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Focuses the first invalid interactive input/select/textarea inside a form element.
 */
export function focusFirstInvalidField(formEl: HTMLFormElement | null): void {
  if (!formEl) return;
  requestAnimationFrame(() => {
    const invalid = formEl.querySelector<HTMLElement>(
      '[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid',
    );
    invalid?.focus();
  });
}

/**
 * Guards against accidental browser tab closure when a form has unsaved edits.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
