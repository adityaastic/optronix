'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Calendar,
  CalendarX2,
  CheckCircle2,
  Download,
  Eye,
  Plus,
} from 'lucide-react';
import { MEETING_STATUS } from '@/shared';
import { apiFetch } from '@/lib/api-client';
import type { AssignableUser, MeetingListItem } from '@/lib/types';
import { ActionMenu } from '@/components/shared/ActionMenu';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { DataTable } from '@/components/shared/DataTable';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import { FilterToolbar } from '@/components/shared/FilterToolbar';
import { FormField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';

function MeetingsListingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<MeetingListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const loadMeetings = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch<
          { meetings: MeetingListItem[] },
          typeof pagination
        >('/meetings', {
          query: {
            page,
            limit: 15,
            search: search || undefined,
            status: statusFilter || undefined,
            assignedRepId: repFilter || undefined,
          },
        });
        setMeetings(res.data.meetings);
        if (res.meta) setPagination(res.meta);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load meetings.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [search, statusFilter, repFilter],
  );

  useEffect(() => {
    void loadMeetings(1);
  }, [loadMeetings]);

  useEffect(() => {
    void apiFetch<{ users: AssignableUser[] }>('/users/assignable')
      .then((res) => setReps(res.data.users))
      .catch(() => undefined);
  }, []);

  const handleQuickConfirm = async (id: string) => {
    await apiFetch(`/meetings/${id}/confirm`, { method: 'POST' });
    await loadMeetings(pagination.page);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget || cancelReason.trim().length < 5) return;
    setIsCancelling(true);
    try {
      await apiFetch(`/meetings/${cancelTarget.id}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason.trim(), notifyCustomer: true },
      });
      setCancelTarget(null);
      setCancelReason('');
      await loadMeetings(pagination.page);
    } finally {
      setIsCancelling(false);
    }
  };

  const exportCsv = () => {
    const lines = [
      [
        'Meeting Code',
        'Customer',
        'Title',
        'Scheduled Start',
        'Assigned Rep',
        'Status',
        'Actual Duration (m)',
      ].join(','),
      ...meetings.map((m) =>
        [
          m.meetingCode,
          `"${m.customer?.companyName ?? ''}"`,
          `"${m.title}"`,
          format(new Date(m.scheduledStart), 'yyyy-MM-dd HH:mm'),
          `"${m.assignedRep?.fullName ?? ''}"`,
          m.status,
          m.totalActualDurationMinutes,
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optronix-meetings-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<ColumnDef<MeetingListItem>[]>(
    () => [
      {
        header: 'Customer & meeting',
        accessorKey: 'title',
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="min-w-[220px]">
              <div className="font-medium text-on-surface">
                {m.customer?.companyName ?? 'Unknown account'}
              </div>
              <div className="text-caption text-on-surface-variant truncate max-w-[300px]">
                {m.title} · <span className="font-mono">{m.meetingCode}</span>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Date & time',
        accessorKey: 'scheduledStart',
        cell: ({ row }) => (
          <div className="tabular-nums">
            <div className="text-body-sm font-medium text-on-surface">
              {format(new Date(row.original.scheduledStart), 'dd MMM yyyy')}
            </div>
            <div className="text-caption text-on-surface-variant">
              {format(new Date(row.original.scheduledStart), 'h:mm a')} –{' '}
              {format(new Date(row.original.scheduledEnd), 'h:mm a')}
            </div>
          </div>
        ),
      },
      {
        header: 'Owner',
        id: 'assignedRep',
        cell: ({ row }) => (
          <span className="text-body-sm text-on-surface-variant">
            {row.original.assignedRep?.fullName ?? '—'}
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
          const m = row.original;
          const canCheckIn = [
            MEETING_STATUS.CONFIRMED,
            MEETING_STATUS.CHECKED_IN,
            MEETING_STATUS.IN_PROGRESS,
            MEETING_STATUS.PAUSED,
            MEETING_STATUS.RESCHEDULED,
          ].includes(m.status as typeof MEETING_STATUS.CONFIRMED);
          const canCancel = [
            MEETING_STATUS.SCHEDULED,
            MEETING_STATUS.CONFIRMED,
            MEETING_STATUS.RESCHEDULED,
          ].includes(m.status as typeof MEETING_STATUS.SCHEDULED);

          return (
            <div
              className="flex items-center justify-end gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {canCheckIn ? (
                <Button asChild size="xs" variant="subtle">
                  <Link href={`/meetings/${m.id}/visit`}>Visit</Link>
                </Button>
              ) : m.status === MEETING_STATUS.AWAITING_OUTCOME ? (
                <Button asChild size="xs" variant="subtle">
                  <Link href={`/meetings/${m.id}/outcome`}>Outcome</Link>
                </Button>
              ) : null}

              <ActionMenu
                items={[
                  {
                    label: 'View details',
                    icon: Eye,
                    onSelect: () => router.push(`/meetings/${m.id}`),
                  },
                  ...(m.status === MEETING_STATUS.SCHEDULED
                    ? [
                        {
                          label: 'Confirm slot',
                          icon: CheckCircle2,
                          onSelect: () => void handleQuickConfirm(m.id),
                        },
                      ]
                    : []),
                  ...(canCancel
                    ? [
                        {
                          label: 'Cancel meeting',
                          icon: CalendarX2,
                          tone: 'danger' as const,
                          separatorBefore: true,
                          onSelect: () => {
                            setCancelTarget(m);
                            setCancelReason('');
                          },
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
    [router, pagination.page],
  );

  if (isLoading && meetings.length === 0 && !search && !statusFilter) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Meetings"
        description="View scheduled customer visits, active field sessions, and completed outcomes."
        actions={
          <>
            <ActionMenu
              items={[
                {
                  label: 'Calendar view',
                  icon: Calendar,
                  onSelect: () => router.push('/calendar'),
                },
                {
                  label: 'Export CSV',
                  icon: Download,
                  onSelect: exportCsv,
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

      {error ? (
        <ErrorState message={error} onRetry={() => void loadMeetings(1)} />
      ) : null}

      <DataTable
        columns={columns}
        data={meetings}
        isLoading={isLoading}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/meetings/${r.id}`)}
        emptyTitle="No meetings match your filters"
        emptyDescription="Clear your active filters or schedule a new customer meeting."
        emptyAction={
          <Button asChild size="sm" variant="primary">
            <Link href="/meetings/new">Schedule meeting</Link>
          </Button>
        }
        pagination={{
          ...pagination,
          onPageChange: (p) => void loadMeetings(p),
        }}
        toolbar={
          <FilterToolbar
            searchPlaceholder="Search customer, title, or code..."
            searchValue={search}
            onSearchChange={setSearch}
            hasActiveFilters={Boolean(search || statusFilter || repFilter)}
            onReset={() => {
              setSearch('');
              setStatusFilter('');
              setRepFilter('');
            }}
          >
            <SelectField
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="PAUSED">Paused</option>
              <option value="AWAITING_OUTCOME">Awaiting outcome</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="COMPLETED">Completed</option>
              <option value="REOPENED">Reopened</option>
              <option value="CANCELLED">Cancelled</option>
            </SelectField>

            {reps.length > 1 ? (
              <SelectField
                aria-label="Filter by owner"
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
              >
                <option value="">All owners</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </FilterToolbar>
        }
      />

      <ConfirmModal
        open={Boolean(cancelTarget)}
        onClose={() => {
          setCancelTarget(null);
          setCancelReason('');
        }}
        title="Cancel meeting"
        description={
          cancelTarget
            ? `Cancel "${cancelTarget.title}" with ${cancelTarget.customer?.companyName}?`
            : undefined
        }
        tone="danger"
        confirmLabel="Cancel meeting"
        cancelLabel="Keep meeting"
        confirmDisabled={cancelReason.trim().length < 5}
        isSubmitting={isCancelling}
        onConfirm={() => void handleConfirmCancel()}
      >
        <FormField
          label="Cancellation reason"
          htmlFor="cancel-reason-input"
          required
          hint="Min 5 characters"
        >
          <Textarea
            id="cancel-reason-input"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Briefly explain why this meeting is being cancelled..."
          />
        </FormField>
      </ConfirmModal>
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MeetingsListingContent />
    </Suspense>
  );
}
