import React from 'react';
import { AlertTriangle, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TimelineStepItem {
  id: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
  status: 'completed' | 'active' | 'pending' | 'warning';
  meta?: React.ReactNode;
}

export function VerticalTimeline({
  items,
  className,
}: {
  items: TimelineStepItem[];
  className?: string;
}) {
  return (
    <div className={cn('relative flex flex-col gap-4', className)}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <div key={item.id} className="relative flex items-start gap-3">
            {!isLast ? (
              <div className="absolute left-[11px] top-6 bottom-[-16px] w-px bg-hairline" />
            ) : null}
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold ring-4 ring-surface-container-lowest z-10',
                item.status === 'completed' &&
                  'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]',
                item.status === 'active' &&
                  'bg-secondary text-on-secondary shadow-sm',
                item.status === 'warning' &&
                  'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
                item.status === 'pending' &&
                  'bg-surface-container text-on-surface-variant border border-outline-variant/40',
              )}
            >
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label-md font-semibold text-on-surface truncate">
                  {item.title}
                </span>
                {item.timestamp ? (
                  <span className="text-caption text-on-surface-variant tabular-nums shrink-0">
                    {item.timestamp}
                  </span>
                ) : null}
              </div>
              {item.subtitle ? (
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  {item.subtitle}
                </p>
              ) : null}
              {item.meta ? <div className="mt-1.5">{item.meta}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-surface-container-lowest border border-hairline p-8 sm:p-12 flex flex-col items-center justify-center text-center',
        className,
      )}
    >
      <div className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface-variant mb-3">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <h3 className="text-headline-sm font-semibold text-on-surface">{title}</h3>
      <p className="text-body-md text-on-surface-variant max-w-md mt-1">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load operational telemetry',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-surface-container-lowest border border-error/30 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-error-container/50 text-error flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-headline-sm font-semibold text-on-surface">
            {title}
          </h3>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {message}
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-surface-container-high" />
          <div className="h-4 w-80 rounded bg-surface-container" />
        </div>
        <div className="h-9 w-36 rounded-lg bg-surface-container-high" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-surface-container-lowest border border-hairline p-4 space-y-3"
          >
            <div className="h-3.5 w-24 rounded bg-surface-container" />
            <div className="h-8 w-20 rounded bg-surface-container-high" />
            <div className="h-2 w-full rounded bg-surface-container" />
          </div>
        ))}
      </div>
      <div className="h-80 rounded-xl bg-surface-container-lowest border border-hairline" />
    </div>
  );
}
