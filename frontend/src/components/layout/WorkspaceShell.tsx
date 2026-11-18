'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { PageSkeleton } from '@/components/shared/FeedbackStates';

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('optronix_sidebar_collapsed');
      if (saved === 'true') setSidebarCollapsed(true);
    } catch {
      // Ignore storage error
    }
  }, []);

  const toggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('optronix_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-surface p-6 lg:p-10 max-w-6xl mx-auto">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <AppSidebar
        counts={user.sidebarCounts}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div
        className={cn(
          'transition-[padding] duration-150',
          sidebarCollapsed ? 'lg:pl-[64px]' : 'lg:pl-[232px]',
        )}
      >
        <AppHeader
          sidebarCollapsed={sidebarCollapsed}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <main className="w-full pt-14 min-h-screen">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
