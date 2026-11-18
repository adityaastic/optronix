import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="text-body-md text-on-surface-variant max-w-2xl">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
