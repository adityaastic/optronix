import * as React from 'react';
import { cn } from '@/lib/utils';

export type NativeSelectProps =
  React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectField = React.forwardRef<
  HTMLSelectElement,
  NativeSelectProps
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        'h-9 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-1.5 text-body-md text-on-surface shadow-sm transition-colors focus-visible:outline-none focus-visible:border-secondary focus-visible:ring-2 focus-visible:ring-secondary/20 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
SelectField.displayName = 'SelectField';
