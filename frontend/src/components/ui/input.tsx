import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-1.5 text-body-md text-on-surface shadow-sm transition-colors placeholder:text-outline focus-visible:outline-none focus-visible:border-secondary focus-visible:ring-2 focus-visible:ring-secondary/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[84px] w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface shadow-sm transition-colors placeholder:text-outline focus-visible:outline-none focus-visible:border-secondary focus-visible:ring-2 focus-visible:ring-secondary/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  requiredIndicator?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, requiredIndicator, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-label-md font-medium text-on-surface flex items-center gap-1',
        className,
      )}
      {...props}
    >
      {children}
      {requiredIndicator ? <span className="text-error">*</span> : null}
    </label>
  ),
);
Label.displayName = 'Label';
