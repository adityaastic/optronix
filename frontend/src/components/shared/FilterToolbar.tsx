'use client';

import React from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FilterTabOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterToolbarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  tabs?: FilterTabOption[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children?: React.ReactNode;
  onReset?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export function FilterToolbar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  tabs,
  activeTab,
  onTabChange,
  children,
  onReset,
  hasActiveFilters,
  className,
}: FilterToolbarProps) {
  const showReset =
    onReset &&
    (hasActiveFilters !== undefined
      ? hasActiveFilters
      : Boolean(searchValue.trim()));

  return (
    <div
      className={cn(
        'flex flex-col lg:flex-row lg:items-center justify-between gap-3',
        className,
      )}
    >
      <div className="relative flex-1 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full h-9 pl-9 pr-8 rounded-lg bg-surface-container-lowest border border-hairline text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary transition-colors"
        />
        {searchValue ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs && tabs.length > 0 && onTabChange ? (
          <div className="inline-flex items-center gap-0.5 p-1 bg-surface-container rounded-lg">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-label-sm transition-all cursor-pointer tabular-nums',
                    active
                      ? 'bg-surface-container-lowest text-on-surface font-medium shadow-resting'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {tab.label}
                  {typeof tab.count === 'number' ? ` (${tab.count})` : ''}
                </button>
              );
            })}
          </div>
        ) : null}

        {children}

        {showReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-on-surface-variant"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
