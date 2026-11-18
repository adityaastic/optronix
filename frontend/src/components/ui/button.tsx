import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-label-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/30 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99] cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-on-primary shadow-sm hover:bg-primary-container',
        accent:
          'bg-secondary text-on-secondary shadow-sm hover:bg-secondary-container',
        outline:
          'bg-surface-container-lowest text-on-surface border border-outline-variant/50 shadow-sm hover:bg-surface-container-low',
        subtle:
          'bg-surface-container text-on-surface hover:bg-surface-container-high',
        ghost:
          'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
        destructive:
          'bg-error text-on-error shadow-sm hover:bg-error/90',
        destructiveSubtle:
          'bg-error-container/60 text-on-error-container border border-error/20 hover:bg-error-container',
      },
      size: {
        xs: 'h-7 px-2.5 text-label-sm rounded-md',
        sm: 'h-8 px-3 text-label-sm',
        default: 'h-9 px-3.5 text-label-md',
        lg: 'h-10 px-4 text-headline-sm font-semibold',
        xl: 'h-11 px-5 text-headline-sm font-semibold',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
