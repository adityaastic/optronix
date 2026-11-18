'use client';

import React, { useEffect } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  badgeText?: string;
  description?: string;
  tone?: 'danger' | 'warning' | 'governance' | 'info';
  icon?: LucideIcon;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  isSubmitting?: boolean;
  footerLeft?: React.ReactNode;
}

export function ConfirmModal({
  open,
  onClose,
  title,
  badgeText,
  description,
  tone = 'info',
  icon: Icon,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmDisabled = false,
  isSubmitting = false,
  footerLeft,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-dialog-title"
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[520px] bg-surface-container-lowest rounded-xl shadow-overlay border border-hairline overflow-hidden my-auto">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              {Icon ? (
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    tone === 'danger' || tone === 'governance'
                      ? 'bg-red-50 text-error'
                      : tone === 'warning'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-blue-50 text-secondary',
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
              ) : null}
              <div className="min-w-0">
                <h2
                  id="modal-dialog-title"
                  className="text-headline-md font-semibold tracking-tight text-on-surface"
                >
                  {title}
                </h2>
                {badgeText ? (
                  <p className="mt-0.5 text-caption text-on-surface-variant">
                    {badgeText}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {description ? (
            <p className="mt-3 text-body-md text-on-surface-variant leading-relaxed">
              {description}
            </p>
          ) : null}

          {children ? <div className="mt-4">{children}</div> : null}

          <div className="mt-6 pt-4 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-caption text-on-surface-variant">
              {footerLeft}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {cancelLabel}
              </Button>
              {onConfirm ? (
                <Button
                  type="button"
                  variant={
                    tone === 'danger' || tone === 'governance'
                      ? 'destructive'
                      : 'primary'
                  }
                  disabled={confirmDisabled || isSubmitting}
                  onClick={onConfirm}
                >
                  {isSubmitting ? 'Processing...' : confirmLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}

export function SlideDrawer({
  open,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  widthClass = 'max-w-[460px]',
}: SlideDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-dialog-title"
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-full h-full bg-surface-container-lowest border-l border-hairline shadow-overlay flex flex-col justify-between',
          widthClass,
        )}
      >
        <div className="px-5 py-4 border-b border-hairline flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="drawer-dialog-title"
                className="text-headline-md font-semibold text-on-surface truncate"
              >
                {title}
              </h2>
              {badge}
            </div>
            {subtitle ? (
              <p className="text-body-sm text-on-surface-variant mt-0.5">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer ? (
          <div className="px-5 py-4 border-t border-hairline bg-surface-container-low shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
