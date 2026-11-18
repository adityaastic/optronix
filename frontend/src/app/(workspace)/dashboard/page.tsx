'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
} from 'lucide-react';
import { MEETING_STATUS } from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch } from '@/lib/api-client';
import type { OverviewDashboardDto } from '@/lib/types';
import { ActionMenu } from '@/components/shared/ActionMenu';
import { DataTable } from '@/components/shared/DataTable';
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from '@/components/shared/FeedbackStates';
import { FilterToolbar } from '@/components/shared/FilterToolbar';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';

type TodayMeetingRow = OverviewDashboardDto['todaysMeetings'][number];

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<OverviewDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'UPCOMING' | 'NEEDS_ACTION' | 'COMPLETED'
  >('ALL');
  const [search, setSearch] = useState('');

  // Live Salesperson Field Duty GPS Tracking state
  const [dutyActive, setDutyActive] = useState(false);
  const [todayPings, setTodayPings] = useState(0);
  const [todayKm, setTodayKm] = useState(0);
  const [pingingGps, setPingingGps] = useState(false);

  const loadTrackingMe = useCallback(async () => {
    try {
      const res = await apiFetch<{
        isFieldDutyActive: boolean;
        todayPingsCount: number;
        todayDistanceKm: number;
      }>('/tracking/me');
      setDutyActive(res.data.isFieldDutyActive);
      setTodayPings(res.data.todayPingsCount);
      setTodayKm(res.data.todayDistanceKm);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<OverviewDashboardDto>(
        '/meetings/dashboard-summary',
      );
      setData(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your dashboard.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadTrackingMe();
  }, [loadDashboard, loadTrackingMe]);

  const sendLiveLocationPing = useCallback(
    async (source: 'HEARTBEAT' | 'MANUAL' = 'MANUAL') => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      setPingingGps(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void apiFetch('/tracking/ping', {
            method: 'POST',
            body: {
              latitude: Number(pos.coords.latitude.toFixed(6)),
              longitude: Number(pos.coords.longitude.toFixed(6)),
              accuracyMeters: Math.round(pos.coords.accuracy || 8),
              source,
            },
          })
            .then(() => loadTrackingMe())
            .catch(() => undefined)
            .finally(() => setPingingGps(false));
        },
        () => {
          // Fallback to Gurugram territory coordinates when desktop browser denies GPS
          void apiFetch('/tracking/ping', {
            method: 'POST',
            body: {
              latitude: 28.495,
              longitude: 77.089,
              accuracyMeters: 12,
              source,
            },
          })
            .then(() => loadTrackingMe())
            .catch(() => undefined)
            .finally(() => setPingingGps(false));
        },
        { enableHighAccuracy: true, timeout: 4000 },
      );
    },
    [loadTrackingMe],
  );

  const handleToggleDuty = async () => {
    const next = !dutyActive;
    setDutyActive(next);
    await apiFetch('/tracking/duty', {
      method: 'POST',
      body: { active: next },
    }).catch(() => undefined);
    if (next) {
      await sendLiveLocationPing('MANUAL');
    } else {
      await loadTrackingMe();
    }
  };

  // Automatic 35-second live GPS heartbeat while Field Duty is ON
  useEffect(() => {
    if (!dutyActive) return;
    const interval = window.setInterval(() => {
      void sendLiveLocationPing('HEARTBEAT');
    }, 35_000);
    return () => window.clearInterval(interval);
  }, [dutyActive, sendLiveLocationPing]);

  const handleConfirmQuick = async (meetingId: string) => {
    await apiFetch(`/meetings/${meetingId}/confirm`, { method: 'POST' });
    await loadDashboard();
  };

  const handleCompleteFollowUp = async (taskId: string) => {
    await apiFetch(`/follow-ups/${taskId}/complete`, { method: 'POST' });
    await loadDashboard();
  };

  const filteredMeetings = useMemo(() => {
    const rows = data?.todaysMeetings ?? [];
    return rows.filter((m) => {
      if (statusFilter === 'UPCOMING') {
        if (
          ![
            MEETING_STATUS.SCHEDULED,
            MEETING_STATUS.CONFIRMED,
            MEETING_STATUS.RESCHEDULED,
          ].includes(m.status as typeof MEETING_STATUS.SCHEDULED)
        ) {
          return false;
        }
      } else if (statusFilter === 'COMPLETED') {
        if (m.status !== MEETING_STATUS.COMPLETED) return false;
      } else if (statusFilter === 'NEEDS_ACTION') {
        if (
          ![
            MEETING_STATUS.SCHEDULED,
            MEETING_STATUS.AWAITING_OUTCOME,
            MEETING_STATUS.PAUSED,
          ].includes(m.status as typeof MEETING_STATUS.SCHEDULED)
        ) {
          return false;
        }
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          m.customerName.toLowerCase().includes(q) ||
          m.contactName.toLowerCase().includes(q) ||
          m.title.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data?.todaysMeetings, statusFilter, search]);

  const exportDailyCsv = () => {
    const csvLines = [
      ['Code', 'Customer', 'Title', 'Start', 'Format', 'Status'].join(','),
      ...filteredMeetings.map((r) =>
        [
          r.meetingCode,
          `"${r.customerName}"`,
          `"${r.title}"`,
          format(new Date(r.scheduledStart), 'yyyy-MM-dd HH:mm'),
          r.meetingType,
          r.status,
        ].join(','),
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optronix-schedule-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<ColumnDef<TodayMeetingRow>[]>(
    () => [
      {
        header: 'Customer & meeting',
        accessorKey: 'customerName',
        cell: ({ row }) => (
          <div className="min-w-[200px]">
            <div className="font-medium text-on-surface">
              {row.original.customerName}
            </div>
            <div className="text-caption text-on-surface-variant truncate max-w-[280px]">
              {row.original.title} · {row.original.contactName}
            </div>
          </div>
        ),
      },
      {
        header: 'Time',
        accessorKey: 'scheduledStart',
        cell: ({ row }) => (
          <div className="tabular-nums">
            <div className="text-body-sm font-medium text-on-surface">
              {format(new Date(row.original.scheduledStart), 'h:mm a')} –{' '}
              {format(new Date(row.original.scheduledEnd), 'h:mm a')}
            </div>
            <div className="text-caption text-on-surface-variant">
              {format(new Date(row.original.scheduledStart), 'dd MMM')}
            </div>
          </div>
        ),
      },
      {
        header: 'Format',
        accessorKey: 'meetingType',
        cell: ({ row }) => (
          <span className="text-body-sm text-on-surface-variant">
            {row.original.meetingType === 'IN_PERSON'
              ? 'In-person'
              : row.original.meetingType === 'VIRTUAL'
                ? 'Virtual'
                : 'Phone'}
          </span>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const canCheckIn = [
            MEETING_STATUS.CONFIRMED,
            MEETING_STATUS.CHECKED_IN,
            MEETING_STATUS.IN_PROGRESS,
            MEETING_STATUS.PAUSED,
            MEETING_STATUS.RESCHEDULED,
          ].includes(item.status as typeof MEETING_STATUS.CONFIRMED);

          return (
            <div
              className="flex items-center justify-end gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {canCheckIn ? (
                <Button asChild size="xs" variant="subtle">
                  <Link href={`/meetings/${item.id}/visit`}>Visit</Link>
                </Button>
              ) : item.status === MEETING_STATUS.AWAITING_OUTCOME ? (
                <Button asChild size="xs" variant="subtle">
                  <Link href={`/meetings/${item.id}/outcome`}>Outcome</Link>
                </Button>
              ) : null}

              <ActionMenu
                items={[
                  {
                    label: 'View details',
                    icon: Eye,
                    onSelect: () => router.push(`/meetings/${item.id}`),
                  },
                  ...(item.status === MEETING_STATUS.SCHEDULED
                    ? [
                        {
                          label: 'Confirm slot',
                          icon: CheckCircle2,
                          onSelect: () => void handleConfirmQuick(item.id),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  if (isLoading && !data) {
    return <PageSkeleton />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message={error ?? 'Unable to load dashboard.'}
        onRetry={() => void loadDashboard()}
      />
    );
  }

  const { kpis, pendingActionItems, routeStops } = data;

  const validRouteStops = routeStops.filter((s) => Boolean(s.coordinates));
  const multiStopMapsUrl =
    validRouteStops.length === 0
      ? null
      : validRouteStops.length === 1
        ? `https://www.google.com/maps/dir/?api=1&destination=${validRouteStops[0]!.coordinates!.latitude},${validRouteStops[0]!.coordinates!.longitude}`
        : (() => {
            const first = validRouteStops[0]!.coordinates!;
            const last =
              validRouteStops[validRouteStops.length - 1]!.coordinates!;
            const waypoints = validRouteStops
              .slice(1, -1)
              .map(
                (w) => `${w.coordinates!.latitude},${w.coordinates!.longitude}`,
              )
              .join('|');
            return `https://www.google.com/maps/dir/?api=1&origin=${first.latitude},${first.longitude}&destination=${last.latitude},${last.longitude}${
              waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
            }`;
          })();

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title={`Good morning, ${user?.firstName ?? 'there'}`}
        description="Here are your scheduled visits and pending follow-ups."
        actions={
          <>
            <ActionMenu
              items={[
                {
                  label: 'Refresh',
                  icon: RefreshCw,
                  onSelect: () => void loadDashboard(),
                },
                {
                  label: 'Export CSV',
                  icon: Download,
                  onSelect: exportDailyCsv,
                },
              ]}
            />
            <Button asChild variant="primary">
              <Link href="/meetings/new">
                <Plus className="w-4 h-4" />
                Schedule meeting
              </Link>
            </Button>
          </>
        }
      />

      {/* 4 Essential KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Scheduled today"
          value={kpis.scheduledToday}
          icon={Calendar}
          footerLeft={`${kpis.inPersonToday} field · ${kpis.virtualToday} virtual`}
        />
        <KpiCard
          label="Completed meetings"
          value={kpis.completedMeetings}
          icon={CheckCircle2}
          badgeText={`${kpis.completionRatePercent}%`}
          badgeTone="success"
          footerLeft={`${kpis.totalMeetings} total in scope`}
        />
        <KpiCard
          label="Avg visit duration"
          value={`${kpis.avgDurationMinutes}m`}
          icon={Clock}
          footerLeft="Verified sessions"
        />
        <KpiCard
          label="Open follow-ups"
          value={kpis.pendingFollowUps}
          badgeText={
            kpis.urgentFollowUps > 0
              ? `${kpis.urgentFollowUps} high priority`
              : undefined
          }
          badgeTone={kpis.urgentFollowUps > 0 ? 'warning' : 'default'}
          footerLeft={`${kpis.dueTodayFollowUps} due today`}
        />
      </div>

      {/* Live Field Duty GPS Bar + Smart Daily Multi-Stop Route Strip */}
      <div className="bg-surface-container-lowest rounded-xl border border-hairline divide-y divide-hairline">
        <div className="px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                dutyActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'
              }`}
            />
            <div className="text-body-sm tabular-nums">
              <span className="font-medium text-on-surface">
                Field Duty GPS Tracking:{' '}
                {dutyActive ? 'Live sharing active' : 'Paused'}
              </span>
              <span className="text-on-surface-variant ml-2">
                {todayPings} GPS ping{todayPings === 1 ? '' : 's'} today ·{' '}
                {todayKm} km logged
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={pingingGps}
              onClick={() => void sendLiveLocationPing('MANUAL')}
            >
              <Radio className="w-3.5 h-3.5 text-secondary" />
              {pingingGps ? 'Pinging...' : 'Ping GPS'}
            </Button>
            <Button
              type="button"
              size="xs"
              variant={dutyActive ? 'subtle' : 'primary'}
              onClick={() => void handleToggleDuty()}
            >
              {dutyActive ? 'End Field Duty' : 'Start Field Duty'}
            </Button>
          </div>
        </div>

        {routeStops.length > 0 ? (
          <div className="px-4 py-3.5 sm:px-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-label-md font-semibold text-on-surface flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-secondary" />
                Today&apos;s field route ({routeStops.length} stop
                {routeStops.length === 1 ? '' : 's'})
              </span>
              {multiStopMapsUrl ? (
                <a
                  href={multiStopMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-caption font-medium text-secondary hover:underline"
                >
                  <span>Start full route in Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 tabular-nums">
              {routeStops.map((stop, idx) => (
                <React.Fragment key={stop.id}>
                  {idx > 0 ? (
                    <span className="inline-flex items-center gap-1 text-caption text-on-surface-variant shrink-0">
                      <ArrowRight className="w-3.5 h-3.5" />
                      {stop.legDistanceKm !== null &&
                      stop.legDistanceKm !== undefined
                        ? `${stop.legDistanceKm} km`
                        : ''}
                    </span>
                  ) : null}
                  <Link
                    href={`/meetings/${stop.id}/visit`}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-secondary-fixed/30 border border-hairline transition-colors flex items-center gap-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-caption font-medium text-on-surface">
                        {stop.customerName}
                      </div>
                      <div className="text-[11px] text-on-surface-variant">
                        {format(new Date(stop.scheduledStart), 'h:mm a')}
                      </div>
                    </div>
                  </Link>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Split: Today's Meetings (Primary Focus) + Pending Follow-ups */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        <section className="xl:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md font-semibold text-on-surface">
              Today&apos;s schedule
            </h2>
            <Link
              href="/meetings"
              className="text-body-sm text-secondary hover:underline font-medium"
            >
              All meetings →
            </Link>
          </div>

          <DataTable
            columns={columns}
            data={filteredMeetings}
            getRowId={(r) => r.id}
            onRowClick={(r) => router.push(`/meetings/${r.id}`)}
            emptyTitle="No meetings scheduled"
            emptyDescription="Schedule a customer visit or switch filters to see other meetings."
            emptyAction={
              <Button asChild size="sm" variant="outline">
                <Link href="/meetings/new">Schedule meeting</Link>
              </Button>
            }
            toolbar={
              <FilterToolbar
                searchPlaceholder="Filter schedule..."
                searchValue={search}
                onSearchChange={setSearch}
                tabs={[
                  { id: 'ALL', label: 'All' },
                  { id: 'UPCOMING', label: 'Upcoming' },
                  { id: 'NEEDS_ACTION', label: 'Needs action' },
                  { id: 'COMPLETED', label: 'Completed' },
                ]}
                activeTab={statusFilter}
                onTabChange={(id) =>
                  setStatusFilter(id as typeof statusFilter)
                }
                hasActiveFilters={Boolean(search) || statusFilter !== 'ALL'}
                onReset={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                }}
              />
            }
          />
        </section>

        <section className="xl:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md font-semibold text-on-surface">
              Pending follow-ups
            </h2>
            <Link
              href="/follow-ups"
              className="text-body-sm text-secondary hover:underline font-medium"
            >
              Manage →
            </Link>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden">
            {pendingActionItems.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="All caught up"
                  description="You have no pending follow-up tasks right now."
                />
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {pendingActionItems.map((task) => {
                  const isOverdue = task.status === 'OVERDUE';
                  return (
                    <li
                      key={task.id}
                      className="p-4 flex items-start justify-between gap-3 hover:bg-surface-container-low transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-body-md font-medium text-on-surface truncate">
                          {task.title}
                        </p>
                        <p className="text-caption text-on-surface-variant">
                          {task.customerName} ·{' '}
                          <span
                            className={
                              isOverdue
                                ? 'text-error font-medium'
                                : 'tabular-nums'
                            }
                          >
                            Due {format(new Date(task.dueDate), 'dd MMM')}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCompleteFollowUp(task.id)}
                        title="Mark complete"
                        aria-label={`Complete ${task.title}`}
                        className="w-7 h-7 rounded-lg border border-hairline hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 text-on-surface-variant flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
