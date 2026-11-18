'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Building2,
  Calendar,
  CheckSquare,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS, type PermissionKey } from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export interface NavItemConfig {
  label: string;
  href: string;
  icon: LucideIcon;
  group: 'workspace' | 'management';
  requiredPermission?: PermissionKey;
  badgeKey?: 'meetings' | 'customers' | 'followUps';
}

export const WORKSPACE_NAV_ITEMS: NavItemConfig[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    group: 'workspace',
  },
  {
    label: 'Meetings',
    href: '/meetings',
    icon: Users,
    group: 'workspace',
    requiredPermission: PERMISSIONS.MEETINGS_READ,
    badgeKey: 'meetings',
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: Calendar,
    group: 'workspace',
    requiredPermission: PERMISSIONS.MEETINGS_READ,
  },
  {
    label: 'Follow-ups',
    href: '/follow-ups',
    icon: CheckSquare,
    group: 'workspace',
    requiredPermission: PERMISSIONS.FOLLOWUPS_READ,
    badgeKey: 'followUps',
  },
  {
    label: 'Customers',
    href: '/customers',
    icon: Building2,
    group: 'workspace',
    requiredPermission: PERMISSIONS.CUSTOMERS_READ,
  },
  {
    label: 'Team',
    href: '/team-activity',
    icon: UserCheck,
    group: 'management',
    requiredPermission: PERMISSIONS.TEAM_READ,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: BarChart3,
    group: 'management',
    requiredPermission: PERMISSIONS.REPORTS_PERSONAL,
  },
  {
    label: 'Admin',
    href: '/admin/settings',
    icon: Settings,
    group: 'management',
    requiredPermission: PERMISSIONS.USERS_MANAGE,
  },
];

export interface SidebarCounts {
  meetings?: number;
  customers?: number;
  followUps?: number;
}

export function AppSidebar({
  counts,
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onCloseMobile,
}: {
  counts?: SidebarCounts;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const { user, logout, hasPermission } = useAuth();

  useEffect(() => {
    if (!mobileOpen || !onCloseMobile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const visibleItems = WORKSPACE_NAV_ITEMS.filter(
    (item) => !item.requiredPermission || hasPermission(item.requiredPermission),
  );

  const workspaceItems = visibleItems.filter((i) => i.group === 'workspace');
  const managementItems = visibleItems.filter((i) => i.group === 'management');

  const initials = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : 'OP';

  const renderNavSection = (
    title: string,
    items: NavItemConfig[],
    isCompact: boolean,
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        {!isCompact ? (
          <div className="px-2.5 pb-1 pt-2">
            <span className="text-[11px] font-medium text-on-surface-variant/80">
              {title}
            </span>
          </div>
        ) : null}

        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const badgeCount = item.badgeKey ? counts?.[item.badgeKey] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              title={isCompact ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center rounded-lg text-body-sm transition-colors',
                isCompact
                  ? 'justify-center h-9 w-9 mx-auto'
                  : 'justify-between px-2.5 py-2',
                isActive
                  ? 'bg-surface-container text-on-surface font-medium'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface',
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0',
                    isActive ? 'text-secondary' : 'text-on-surface-variant',
                  )}
                  strokeWidth={1.75}
                />
                {!isCompact ? (
                  <span className="truncate">{item.label}</span>
                ) : null}
              </div>

              {!isCompact && typeof badgeCount === 'number' && badgeCount > 0 ? (
                <span className="text-caption text-on-surface-variant tabular-nums">
                  {badgeCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    );
  };

  const renderSidebar = (isMobile: boolean) => {
    const isCompact = !isMobile && collapsed;

    return (
      <aside
        aria-label="Primary navigation"
        className={cn(
          'h-screen bg-surface-container-lowest border-r border-hairline flex flex-col justify-between select-none transition-[width] duration-150',
          isCompact ? 'w-[64px]' : 'w-[232px]',
        )}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Top Brand Header */}
          <div
            className={cn(
              'h-14 flex items-center border-b border-hairline shrink-0',
              isCompact ? 'justify-center px-2' : 'justify-between px-4',
            )}
          >
            {!isCompact ? (
              <Link
                href="/dashboard"
                onClick={onCloseMobile}
                title={user?.tenantSettings?.organizationName ?? 'Optronix'}
                className="flex items-center gap-2 min-w-0"
              >
                <img
                  src="/optronix-logo.png"
                  alt="Optronix"
                  className="h-6 w-auto object-contain"
                />
              </Link>
            ) : (
              <Link
                href="/dashboard"
                title={user?.tenantSettings?.organizationName ?? 'Optronix'}
                className="mr-0.5 shrink-0"
              >
                <img
                  src="/optronix-mark.png"
                  alt="Optronix"
                  className="w-6 h-6 object-contain"
                />
              </Link>
            )}

            {isMobile && onCloseMobile ? (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : onToggleCollapsed ? (
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                {isCompact ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            ) : null}
          </div>

          {/* Navigation Groups */}
          <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
            {renderNavSection('Workspace', workspaceItems, isCompact)}
            {renderNavSection('Management', managementItems, isCompact)}
          </nav>
        </div>

        {/* Bottom Profile & Sign Out */}
        <div className="p-2.5 border-t border-hairline shrink-0">
          {isCompact ? (
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/profile"
                title={user?.fullName ?? 'Profile'}
                className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center text-label-sm font-semibold hover:bg-surface-container-high transition-colors"
              >
                {initials}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-surface-container-low transition-colors">
              <Link
                href="/profile"
                onClick={onCloseMobile}
                className="flex items-center gap-2.5 min-w-0 flex-1"
              >
                <div className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center text-label-sm font-semibold shrink-0">
                  {initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-label-md text-on-surface font-medium truncate">
                    {user?.fullName ?? 'Account'}
                  </span>
                  <span className="text-caption text-on-surface-variant truncate">
                    {user?.role.name ?? ''}
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          )}
        </div>
      </aside>
    );
  };

  return (
    <>
      <div className="hidden lg:block fixed left-0 top-0 bottom-0 z-40">
        {renderSidebar(false)}
      </div>

      {mobileOpen ? (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex"
          onClick={(e) => {
            if (e.target === e.currentTarget && onCloseMobile) onCloseMobile();
          }}
        >
          {renderSidebar(true)}
        </div>
      ) : null}
    </>
  );
}
