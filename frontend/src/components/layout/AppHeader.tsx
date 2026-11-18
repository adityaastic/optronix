'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  LogOut,
  Menu,
  Search,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface OmniboxResultItem {
  id: string;
  code?: string;
  title: string;
  subtitle: string;
  status?: string;
  href: string;
}

interface OmniboxResponse {
  meetings: OmniboxResultItem[];
  customers: OmniboxResultItem[];
  contacts: OmniboxResultItem[];
  followUps: OmniboxResultItem[];
}

const ROUTE_TITLES: Record<string, { section?: string; title: string }> = {
  '/dashboard': { title: 'Dashboard' },
  '/meetings': { section: 'Workspace', title: 'Meetings' },
  '/meetings/new': { section: 'Meetings', title: 'Schedule meeting' },
  '/calendar': { section: 'Workspace', title: 'Calendar' },
  '/follow-ups': { section: 'Workspace', title: 'Follow-ups' },
  '/customers': { section: 'Workspace', title: 'Customers' },
  '/team-activity': { section: 'Management', title: 'Team activity' },
  '/reports': { section: 'Management', title: 'Reports' },
  '/admin/settings': { section: 'Management', title: 'Admin settings' },
  '/profile': { section: 'Account', title: 'Profile' },
  '/notifications': { section: 'Account', title: 'Notifications' },
};

export function AppHeader({
  sidebarCollapsed = false,
  onOpenMobileSidebar,
}: {
  sidebarCollapsed?: boolean;
  onOpenMobileSidebar: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OmniboxResponse | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const routeMeta = useMemo(() => {
    if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
    if (pathname.includes('/visit')) {
      return { section: 'Meetings', title: 'Visit check-in' };
    }
    if (pathname.includes('/outcome')) {
      return { section: 'Meetings', title: 'Record outcome' };
    }
    if (pathname.startsWith('/meetings/')) {
      return { section: 'Meetings', title: 'Meeting details' };
    }
    return { title: user?.tenantSettings?.organizationName ?? 'Optronix' };
  }, [pathname, user?.tenantSettings?.organizationName]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void apiFetch<OmniboxResponse>('/search', { query: { q } })
        .then((res) => setResults(res.data))
        .catch(() => setResults(null))
        .finally(() => setSearching(false));
    }, 220);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const initials = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : 'OP';

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchOpen(false);
    router.push(`/meetings?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const totalMatches = results
    ? results.meetings.length +
      results.customers.length +
      results.contacts.length +
      results.followUps.length
    : 0;

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 h-14 bg-surface-container-lowest/95 backdrop-blur-sm border-b border-hairline z-30 px-4 sm:px-8 flex items-center justify-between gap-4 transition-[left] duration-150',
        sidebarCollapsed ? 'lg:left-[64px]' : 'lg:left-[232px]',
      )}
    >
      {/* Left: Mobile Menu + Clean Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-body-sm min-w-0"
        >
          {routeMeta.section ? (
            <>
              <span className="text-on-surface-variant hidden sm:inline">
                {routeMeta.section}
              </span>
              <span className="text-outline-variant hidden sm:inline">/</span>
            </>
          ) : null}
          <span className="font-medium text-on-surface truncate">
            {routeMeta.title}
          </span>
        </nav>
      </div>

      {/* Right: Unified Live Omnibox Search + Notifications + User Menu */}
      <div className="flex items-center gap-2.5">
        <div ref={searchWrapRef} className="hidden md:block relative">
          <form onSubmit={handleGlobalSearch}>
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-on-surface-variant pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              placeholder="Search meetings, customers, contacts..."
              aria-label="Global workspace search"
              className="w-56 lg:w-72 h-8 pl-8 pr-3 rounded-lg border border-hairline bg-surface-container-low text-on-surface text-body-sm placeholder:text-outline focus:outline-none focus:border-secondary focus:bg-surface-container-lowest transition-colors"
            />
          </form>

          {searchOpen && searchQuery.trim().length >= 2 ? (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[420px] overflow-y-auto rounded-xl bg-surface-container-lowest border border-hairline shadow-overlay p-2 z-50 space-y-2 text-body-sm">
              {searching ? (
                <p className="px-3 py-4 text-center text-caption text-on-surface-variant">
                  Searching workspace...
                </p>
              ) : totalMatches === 0 ? (
                <p className="px-3 py-4 text-center text-caption text-on-surface-variant">
                  No matching meetings, customers, contacts, or tasks.
                </p>
              ) : (
                <>
                  {results?.meetings.length ? (
                    <div>
                      <span className="px-2.5 py-1 text-[11px] font-medium text-on-surface-variant block">
                        Meetings
                      </span>
                      {results.meetings.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-container transition-colors"
                        >
                          <Calendar className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-medium text-on-surface truncate">
                              {item.title}
                            </p>
                            <p className="text-caption text-on-surface-variant truncate">
                              {item.code} · {item.subtitle}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {results?.customers.length ? (
                    <div>
                      <span className="px-2.5 py-1 text-[11px] font-medium text-on-surface-variant block">
                        Customers
                      </span>
                      {results.customers.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-container transition-colors"
                        >
                          <Building2 className="w-4 h-4 text-on-surface-variant shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-medium text-on-surface truncate">
                              {item.title}
                            </p>
                            <p className="text-caption text-on-surface-variant truncate">
                              {item.subtitle}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {results?.contacts.length ? (
                    <div>
                      <span className="px-2.5 py-1 text-[11px] font-medium text-on-surface-variant block">
                        Contacts
                      </span>
                      {results.contacts.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-container transition-colors"
                        >
                          <Users className="w-4 h-4 text-on-surface-variant shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-medium text-on-surface truncate">
                              {item.title}
                            </p>
                            <p className="text-caption text-on-surface-variant truncate">
                              {item.subtitle}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {results?.followUps.length ? (
                    <div>
                      <span className="px-2.5 py-1 text-[11px] font-medium text-on-surface-variant block">
                        Follow-ups
                      </span>
                      {results.followUps.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-container transition-colors"
                        >
                          <CheckSquare className="w-4 h-4 text-on-surface-variant shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-medium text-on-surface truncate">
                              {item.title}
                            </p>
                            <p className="text-caption text-on-surface-variant truncate">
                              {item.subtitle}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <Bell className="w-4 h-4" strokeWidth={1.75} />
          {(user?.unreadNotificationsCount ?? 0) > 0 ? (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-container-lowest" />
          ) : null}
        </Link>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center text-label-sm font-semibold transition-colors cursor-pointer"
            >
              {initials}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-56 rounded-xl bg-surface-container-lowest border border-hairline shadow-overlay p-1.5 text-body-sm"
            >
              <div className="px-2.5 py-2 border-b border-hairline mb-1">
                <p className="font-medium text-on-surface truncate">
                  {user?.fullName}
                </p>
                <p className="text-caption text-on-surface-variant truncate">
                  {user?.email}
                </p>
                <span className="inline-block mt-1 text-caption text-secondary font-medium">
                  {user?.role.name}
                </span>
              </div>

              <DropdownMenu.Item asChild>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-on-surface hover:bg-surface-container focus:bg-surface-container outline-none cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-on-surface-variant" />
                  <span>Profile &amp; security</span>
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={() => void logout()}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-error hover:bg-error-container focus:bg-error-container outline-none cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
