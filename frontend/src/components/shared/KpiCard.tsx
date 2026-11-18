import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconTone?: 'default' | 'blue' | 'success' | 'warning' | 'danger';
  badgeText?: string;
  badgeTone?: 'default' | 'blue' | 'success' | 'warning' | 'danger';
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  progressPercent?: number;
  progressTone?: 'blue' | 'navy' | 'success' | 'warning' | 'danger';
  className?: string;
}

const BADGE_TONES = {
  default: 'text-on-surface-variant bg-surface-container',
  blue: 'text-secondary bg-secondary-fixed',
  success: 'text-emerald-700 bg-emerald-50',
  warning: 'text-amber-700 bg-amber-50',
  danger: 'text-error bg-error-container',
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  badgeText,
  badgeTone = 'default',
  footerLeft,
  footerRight,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'bg-surface-container-lowest rounded-xl border border-hairline p-4 sm:p-5 flex flex-col justify-between gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-md text-on-surface-variant font-medium">
          {label}
        </span>
        {Icon ? (
          <Icon
            className="w-4 h-4 text-on-surface-variant/75 shrink-0"
            strokeWidth={1.75}
          />
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-metric-lg text-on-surface font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {badgeText ? (
          <span
            className={cn(
              'px-2 py-0.5 rounded-md text-caption font-medium tabular-nums',
              BADGE_TONES[badgeTone],
            )}
          >
            {badgeText}
          </span>
        ) : null}
      </div>

      {footerLeft || footerRight ? (
        <div className="flex items-center justify-between gap-2 text-caption text-on-surface-variant tabular-nums">
          {footerLeft ? <span className="truncate">{footerLeft}</span> : <span />}
          {footerRight ? (
            <span className="font-medium text-on-surface shrink-0">
              {footerRight}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
