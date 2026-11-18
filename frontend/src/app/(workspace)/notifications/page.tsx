'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from '@/components/shared/FeedbackStates';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { refreshSession } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>(
        '/notifications',
      );
      setItems(res.data.notifications);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load notifications.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const handleRealtime = () => {
      void apiFetch<{ notifications: NotificationItem[] }>('/notifications')
        .then((res) => setItems(res.data.notifications))
        .catch(() => undefined);
    };
    window.addEventListener('optronix:realtime', handleRealtime);
    return () => window.removeEventListener('optronix:realtime', handleRealtime);
  }, []);

  const handleMarkOneRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    await refreshSession();
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await refreshSession();
  };

  const resolveEntityLink = (n: NotificationItem): string | null => {
    if (!n.entityId) return null;
    if (n.entityType === 'MEETING') return `/meetings/${n.entityId}`;
    if (n.entityType === 'FOLLOW_UP' || n.entityType === 'FOLLOWUP') {
      return '/follow-ups';
    }
    return null;
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="Notifications unavailable"
        message={error}
        onRetry={() => void loadNotifications()}
      />
    );
  }

  const unreadCount = items.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <PageHeader
        title="Notifications"
        description="Updates on meeting assignments, reopened visits, and follow-up due dates."
        badge={
          unreadCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-caption font-medium tabular-nums">
              {unreadCount} unread
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadNotifications()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleMarkAllRead()}
              >
                <CheckCheck className="w-4 h-4" />
                Mark all read
              </Button>
            ) : null}
          </>
        }
      />

      {items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl border border-hairline">
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            description="New meeting assignments, reminders, and updates will appear here."
          />
        </div>
      ) : (
        <div className="bg-surface-container-lowest divide-y divide-hairline border border-hairline rounded-xl overflow-hidden">
          {items.map((n) => {
            const href = resolveEntityLink(n);
            return (
              <div
                key={n.id}
                className={cn(
                  'p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors',
                  !n.isRead && 'bg-secondary-fixed/25',
                )}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!n.isRead ? (
                      <span
                        aria-label="Unread"
                        className="w-2 h-2 rounded-full bg-secondary shrink-0"
                      />
                    ) : null}
                    <span className="text-label-lg font-medium text-on-surface">
                      {n.title}
                    </span>
                    <span className="text-caption text-on-surface-variant tabular-nums">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant">
                    {n.message}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {href ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={href}>
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </Link>
                    </Button>
                  ) : null}
                  {!n.isRead ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleMarkOneRead(n.id)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
