'use client';

import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  triggerLabel?: string;
  align?: 'start' | 'center' | 'end';
  ariaLabel?: string;
}

export function ActionMenu({
  items,
  triggerLabel,
  align = 'end',
  ariaLabel = 'More actions',
}: ActionMenuProps) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-lg text-label-md font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/30',
            triggerLabel
              ? 'h-9 px-3 border border-hairline bg-surface-container-lowest shadow-resting'
              : 'h-8 w-8',
          )}
        >
          {triggerLabel ? <span>{triggerLabel}</span> : null}
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-[184px] rounded-xl bg-surface-container-lowest border border-hairline shadow-overlay p-1.5 text-body-sm text-on-surface focus:outline-none"
        >
          {visibleItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={`${item.label}-${idx}`}>
                {item.separatorBefore ? (
                  <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
                ) : null}
                <DropdownMenu.Item
                  disabled={item.disabled}
                  onSelect={(e) => {
                    e.stopPropagation();
                    item.onSelect();
                  }}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer select-none outline-none transition-colors data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
                    item.tone === 'danger'
                      ? 'text-error focus:bg-error-container'
                      : 'text-on-surface focus:bg-surface-container',
                  )}
                >
                  {Icon ? <Icon className="w-4 h-4 shrink-0" /> : null}
                  <span>{item.label}</span>
                </DropdownMenu.Item>
              </React.Fragment>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
