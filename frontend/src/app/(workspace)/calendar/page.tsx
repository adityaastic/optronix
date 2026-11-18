'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
} from 'lucide-react';
import { MEETING_STATUS } from '@/shared';
import { apiFetch } from '@/lib/api-client';
import type { AssignableUser, MeetingListItem } from '@/lib/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from '@/components/shared/FeedbackStates';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type CalendarViewMode = 'month' | 'week' | 'day';

function eventAccentClass(status: string): string {
  if (status === MEETING_STATUS.COMPLETED) {
    return 'border-l-emerald-600 bg-surface-container-low/70 text-on-surface';
  }
  if (status === MEETING_STATUS.CANCELLED) {
    return 'border-l-outline bg-surface-container-low/50 text-on-surface-variant line-through';
  }
  if (status === MEETING_STATUS.IN_PROGRESS) {
    return 'border-l-secondary bg-secondary-fixed/60 text-on-surface';
  }
  return 'border-l-secondary/80 bg-surface-container-lowest text-on-surface';
}

export default function MeetingCalendarPage() {
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [repFilter, setRepFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCalendarMeetings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rangeStart = startOfWeek(startOfMonth(cursorDate));
      const rangeEnd = endOfWeek(endOfMonth(cursorDate));
      const res = await apiFetch<{ meetings: MeetingListItem[] }>('/meetings', {
        query: {
          limit: 100,
          fromDate: rangeStart.toISOString(),
          toDate: rangeEnd.toISOString(),
          assignedRepId: repFilter || undefined,
          status: statusFilter || undefined,
        },
      });
      setMeetings(res.data.meetings);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load calendar events.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [cursorDate, repFilter, statusFilter]);

  useEffect(() => {
    void loadCalendarMeetings();
  }, [loadCalendarMeetings]);

  useEffect(() => {
    void apiFetch<{ users: AssignableUser[] }>('/users/assignable')
      .then((res) => setReps(res.data.users))
      .catch(() => undefined);
  }, []);

  const monthGridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursorDate));
    const end = endOfWeek(endOfMonth(cursorDate));
    return eachDayOfInterval({ start, end });
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  const dayMeetings = useMemo(
    () =>
      meetings
        .filter((m) => isSameDay(new Date(m.scheduledStart), cursorDate))
        .sort(
          (a, b) =>
            new Date(a.scheduledStart).getTime() -
            new Date(b.scheduledStart).getTime(),
        ),
    [meetings, cursorDate],
  );

  const stepCalendar = (direction: -1 | 1) => {
    if (viewMode === 'month') {
      setCursorDate((d) =>
        direction === -1 ? subMonths(d, 1) : addMonths(d, 1),
      );
    } else if (viewMode === 'week') {
      setCursorDate((d) => addDays(d, direction * 7));
    } else {
      setCursorDate((d) => addDays(d, direction));
    }
  };

  const rangeLabel = useMemo(() => {
    if (viewMode === 'month') {
      return format(cursorDate, 'MMMM yyyy');
    }
    if (viewMode === 'week') {
      const start = weekDays[0]!;
      const end = weekDays[6]!;
      return `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`;
    }
    return format(cursorDate, 'EEEE, dd MMM yyyy');
  }, [cursorDate, viewMode, weekDays]);

  if (isLoading && meetings.length === 0) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Calendar"
        description="View scheduled meetings across month, week, and daily timelines."
        actions={
          <Button asChild variant="primary">
            <Link href="/meetings/new">
              <Plus className="w-4 h-4" />
              Schedule meeting
            </Link>
          </Button>
        }
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => void loadCalendarMeetings()}
        />
      ) : null}

      {/* Clean Navigation & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCursorDate(new Date())}
          >
            Today
          </Button>
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous period"
              onClick={() => stepCalendar(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-headline-sm font-semibold text-on-surface min-w-[168px] text-center tabular-nums">
              {rangeLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next period"
              onClick={() => stepCalendar(1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month / Week / Day Switcher */}
          <div
            role="tablist"
            aria-label="Calendar view mode"
            className="inline-flex items-center p-0.5 bg-surface-container rounded-lg border border-hairline"
          >
            {(
              [
                { id: 'month', label: 'Month' },
                { id: 'week', label: 'Week' },
                { id: 'day', label: 'Day' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                role="tab"
                aria-selected={viewMode === mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={cn(
                  'px-3 py-1 rounded-md text-label-md transition-colors cursor-pointer',
                  viewMode === mode.id
                    ? 'bg-surface-container-lowest shadow-resting text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {reps.length > 1 ? (
            <SelectField
              aria-label="Filter by employee"
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
            >
              <option value="">All employees</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </SelectField>
          ) : null}

          <SelectField
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </SelectField>
        </div>
      </div>

      {/* Calendar Surface */}
      <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden">
        {viewMode === 'month' ? (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 bg-surface-container-low border-b border-hairline text-center text-caption font-medium text-on-surface-variant py-2.5">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-hairline">
                {monthGridDays.map((day) => {
                  const items = meetings.filter((m) =>
                    isSameDay(new Date(m.scheduledStart), day),
                  );
                  const isToday = isSameDay(day, new Date());
                  const inMonth = isSameMonth(day, cursorDate);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => {
                        setCursorDate(day);
                        setViewMode('day');
                      }}
                      className={cn(
                        'min-h-[124px] p-2.5 transition-colors cursor-pointer flex flex-col gap-1.5 hover:bg-surface-container-low/50',
                        !inMonth && 'bg-surface-container-low/40 opacity-60',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-label-sm tabular-nums',
                            isToday
                              ? 'bg-secondary text-on-secondary font-semibold'
                              : 'text-on-surface font-medium',
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                        {items.length > 0 ? (
                          <span className="text-caption text-on-surface-variant tabular-nums">
                            {items.length}
                          </span>
                        ) : null}
                      </div>

                      <div className="space-y-1">
                        {items.slice(0, 3).map((m) => (
                          <Link
                            key={m.id}
                            href={`/meetings/${m.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              'block px-2 py-1 rounded-md border border-hairline border-l-2 text-caption truncate hover:bg-surface-container transition-colors',
                              eventAccentClass(m.status),
                            )}
                          >
                            <span className="tabular-nums text-on-surface-variant mr-1">
                              {format(new Date(m.scheduledStart), 'HH:mm')}
                            </span>
                            <span className="font-medium">
                              {m.customer?.companyName ?? m.title}
                            </span>
                          </Link>
                        ))}
                        {items.length > 3 ? (
                          <span className="text-caption text-secondary font-medium pl-1">
                            +{items.length - 3} more
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : viewMode === 'week' ? (
          <div className="p-4 overflow-x-auto">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3 min-w-[700px]">
              {weekDays.map((wd) => {
                const items = meetings
                  .filter((m) => isSameDay(new Date(m.scheduledStart), wd))
                  .sort(
                    (a, b) =>
                      new Date(a.scheduledStart).getTime() -
                      new Date(b.scheduledStart).getTime(),
                  );
                const isToday = isSameDay(wd, new Date());

                return (
                  <div
                    key={wd.toISOString()}
                    className={cn(
                      'rounded-xl border border-hairline p-3 min-h-[300px] flex flex-col gap-2.5',
                      isToday ? 'bg-secondary-fixed/20' : 'bg-surface-container-low/30',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCursorDate(wd);
                        setViewMode('day');
                      }}
                      className="pb-2 border-b border-hairline text-left cursor-pointer"
                    >
                      <div className="text-caption text-on-surface-variant">
                        {format(wd, 'EEE')}
                      </div>
                      <div
                        className={cn(
                          'text-headline-sm font-semibold tabular-nums',
                          isToday ? 'text-secondary' : 'text-on-surface',
                        )}
                      >
                        {format(wd, 'dd MMM')}
                      </div>
                    </button>

                    {items.length === 0 ? (
                      <span className="text-caption text-on-surface-variant pt-1">
                        No meetings
                      </span>
                    ) : (
                      items.map((m) => (
                        <Link
                          key={m.id}
                          href={`/meetings/${m.id}`}
                          className={cn(
                            'p-2.5 rounded-lg border border-hairline border-l-2 space-y-1 hover:bg-surface-container transition-colors',
                            eventAccentClass(m.status),
                          )}
                        >
                          <div className="text-label-md font-medium truncate">
                            {m.customer?.companyName ?? m.title}
                          </div>
                          <div className="text-caption text-on-surface-variant tabular-nums">
                            {format(new Date(m.scheduledStart), 'hh:mm a')}
                          </div>
                          <div className="pt-0.5">
                            <StatusBadge status={m.status} showDot={false} />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            {dayMeetings.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="No meetings scheduled"
                description={`There are no meetings scheduled on ${format(cursorDate, 'dd MMMM yyyy')}.`}
                action={
                  <Button asChild variant="primary" size="sm">
                    <Link href="/meetings/new">
                      <Plus className="w-4 h-4" />
                      Schedule meeting
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-hairline">
                {dayMeetings.map((m) => (
                  <Link
                    key={m.id}
                    href={`/meetings/${m.id}`}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-low/50 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-medium text-on-surface">
                          {m.customer?.companyName ?? 'Customer'}
                        </span>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="text-body-sm text-on-surface-variant truncate">
                        {m.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-caption text-on-surface-variant">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {m.locationText}
                        </span>
                        {m.assignedRep ? (
                          <span>· {m.assignedRep.fullName}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-body-sm font-medium text-on-surface tabular-nums shrink-0">
                      <Clock className="w-4 h-4 text-on-surface-variant" />
                      <span>
                        {format(new Date(m.scheduledStart), 'hh:mm a')} –{' '}
                        {format(new Date(m.scheduledEnd), 'hh:mm a')}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
