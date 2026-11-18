'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { Calendar, Check, Kanban, List, Plus } from 'lucide-react';
import {
  FOLLOW_UP_STATUS,
  PERMISSIONS,
  PRIORITY_LEVEL,
  type FollowUpStatus,
  type PriorityLevel,
} from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AssignableUser, CustomerListItem } from '@/lib/types';
import { SlideDrawer } from '@/components/shared/ConfirmModal';
import { DataTable } from '@/components/shared/DataTable';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import { FilterToolbar } from '@/components/shared/FilterToolbar';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface FollowUpItem {
  id: string;
  taskCode: string;
  title: string;
  description: string | null;
  dueDate: string;
  priority: PriorityLevel;
  status: FollowUpStatus;
  completedAt: string | null;
  customer: { id: string; companyName: string; customerCode: string } | null;
  meeting: { id: string; meetingCode: string; title: string } | null;
  owner: {
    id: string;
    fullName: string;
    email: string;
    employeeCode: string;
  } | null;
  comments: Array<{ authorName: string; body: string; createdAt: string }>;
  createdAt: string;
}

export default function FollowUpsPage() {
  const { user, hasPermission } = useAuth();
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });

  const [viewMode, setViewMode] = useState<'list' | 'board' | 'calendar'>(
    'list',
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Task Drawer
  const [selectedTask, setSelectedTask] = useState<FollowUpItem | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reassignOwnerId, setReassignOwnerId] = useState('');

  // Create Drawer State
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [newDueDate, setNewDueDate] = useState(() =>
    format(addDays(new Date(), 2), 'yyyy-MM-dd'),
  );
  const [newPriority, setNewPriority] = useState<PriorityLevel>(
    PRIORITY_LEVEL.MEDIUM,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadFollowUps = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch<
          { followUps: FollowUpItem[] },
          typeof pagination
        >('/follow-ups', {
          query: {
            page,
            limit: 40,
            search: search || undefined,
            status: statusFilter || undefined,
          },
        });
        setItems(res.data.followUps);
        if (res.meta) setPagination(res.meta);
        if (selectedTask) {
          const updated = res.data.followUps.find(
            (i) => i.id === selectedTask.id,
          );
          if (updated) setSelectedTask(updated);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load follow-ups.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, statusFilter],
  );

  useEffect(() => {
    void loadFollowUps(1);
  }, [loadFollowUps]);

  useEffect(() => {
    void apiFetch<{ customers: CustomerListItem[] }>('/customers', {
      query: { limit: 100 },
    })
      .then((res) => {
        setCustomers(res.data.customers);
        if (res.data.customers[0]) setNewCustomerId(res.data.customers[0].id);
      })
      .catch(() => undefined);

    void apiFetch<{ users: AssignableUser[] }>('/users/assignable')
      .then((res) => {
        setReps(res.data.users);
        if (user) setNewOwnerId(user.id);
      })
      .catch(() => undefined);
  }, [user]);

  const handleMarkComplete = async (id: string) => {
    await apiFetch(`/follow-ups/${id}/complete`, { method: 'POST' });
    await loadFollowUps(pagination.page);
  };

  const handleStatusChange = async (id: string, status: FollowUpStatus) => {
    await apiFetch(`/follow-ups/${id}`, {
      method: 'PATCH',
      body: { status },
    });
    await loadFollowUps(pagination.page);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !commentText.trim()) return;
    await apiFetch(`/follow-ups/${selectedTask.id}/comments`, {
      method: 'POST',
      body: { body: commentText.trim() },
    });
    setCommentText('');
    await loadFollowUps(pagination.page);
  };

  const handleReassign = async () => {
    if (!selectedTask || !reassignOwnerId) return;
    await apiFetch(`/follow-ups/${selectedTask.id}/reassign`, {
      method: 'POST',
      body: {
        newOwnerId: reassignOwnerId,
        reason: 'Manager workload rebalance',
      },
    });
    setReassignOwnerId('');
    await loadFollowUps(pagination.page);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim().length < 3 || !newCustomerId || !newDueDate) {
      setCreateError('Please enter a task title, customer, and due date.');
      return;
    }
    setCreateError(null);
    setIsCreating(true);
    try {
      await apiFetch('/follow-ups', {
        method: 'POST',
        body: {
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          customerId: newCustomerId,
          ownerId: newOwnerId || user?.id,
          dueDate: new Date(`${newDueDate}T17:00:00`).toISOString(),
          priority: newPriority,
        },
      });
      setCreateOpen(false);
      setNewTitle('');
      setNewDesc('');
      await loadFollowUps(1);
    } catch (err) {
      setCreateError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to create follow-up task.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const columns = useMemo<ColumnDef<FollowUpItem>[]>(
    () => [
      {
        header: 'Task',
        accessorKey: 'title',
        cell: ({ row }) => (
          <div className="min-w-[200px]">
            <span className="font-medium text-on-surface block">
              {row.original.title}
            </span>
            {row.original.meeting ? (
              <Link
                href={`/meetings/${row.original.meeting.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-caption text-secondary hover:underline font-mono"
              >
                {row.original.meeting.meetingCode}
              </Link>
            ) : (
              <span className="text-caption text-on-surface-variant font-mono">
                {row.original.taskCode}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Customer',
        id: 'customer',
        cell: ({ row }) => (
          <span className="text-body-sm text-on-surface">
            {row.original.customer?.companyName ?? '—'}
          </span>
        ),
      },
      {
        header: 'Owner',
        id: 'owner',
        cell: ({ row }) => (
          <span className="text-body-sm text-on-surface-variant">
            {row.original.owner?.fullName ?? '—'}
          </span>
        ),
      },
      {
        header: 'Due date',
        accessorKey: 'dueDate',
        cell: ({ row }) => {
          const isOverdue = row.original.status === FOLLOW_UP_STATUS.OVERDUE;
          return (
            <span
              className={cn(
                'text-body-sm tabular-nums',
                isOverdue ? 'text-amber-700 font-medium' : 'text-on-surface',
              )}
            >
              {format(new Date(row.original.dueDate), 'dd MMM yyyy')}
              {isOverdue ? ' · Overdue' : ''}
            </span>
          );
        },
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
        cell: ({ row }) =>
          row.original.status !== FOLLOW_UP_STATUS.COMPLETED ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleMarkComplete(row.original.id);
                }}
              >
                <Check className="w-3.5 h-3.5" />
                Complete
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagination.page],
  );

  const calendarDays = useMemo(() => {
    const now = new Date();
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(now)),
      end: endOfWeek(endOfMonth(now)),
    });
  }, []);

  if (isLoading && items.length === 0 && !search) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Follow-ups"
        description="Post-meeting action items and customer deliverables."
        actions={
          <>
            <div className="inline-flex items-center gap-0.5 p-1 bg-surface-container rounded-lg">
              {[
                { id: 'list', label: 'List', icon: List },
                { id: 'board', label: 'Board', icon: Kanban },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map((v) => {
                const Icon = v.icon;
                const active = viewMode === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewMode(v.id as typeof viewMode)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-label-sm flex items-center gap-1.5 transition-all cursor-pointer',
                      active
                        ? 'bg-surface-container-lowest text-on-surface font-medium shadow-resting'
                        : 'text-on-surface-variant hover:text-on-surface',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{v.label}</span>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="w-4 h-4" />
              New task
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={() => void loadFollowUps(1)} />
      ) : null}

      {viewMode === 'list' ? (
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowId={(r) => r.id}
          onRowClick={(r) => setSelectedTask(r)}
          emptyTitle="No follow-up tasks"
          emptyDescription="Create a follow-up task or record a meeting outcome to track next steps."
          pagination={{
            ...pagination,
            onPageChange: (p) => void loadFollowUps(p),
          }}
          toolbar={
            <FilterToolbar
              searchPlaceholder="Search tasks..."
              searchValue={search}
              onSearchChange={setSearch}
              hasActiveFilters={Boolean(search || statusFilter)}
              onReset={() => {
                setSearch('');
                setStatusFilter('');
              }}
            >
              <SelectField
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value={FOLLOW_UP_STATUS.PENDING}>Pending</option>
                <option value={FOLLOW_UP_STATUS.IN_PROGRESS}>
                  In progress
                </option>
                <option value={FOLLOW_UP_STATUS.OVERDUE}>Overdue</option>
                <option value={FOLLOW_UP_STATUS.COMPLETED}>Completed</option>
              </SelectField>
            </FilterToolbar>
          }
        />
      ) : viewMode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { status: FOLLOW_UP_STATUS.PENDING, title: 'Pending' },
            { status: FOLLOW_UP_STATUS.IN_PROGRESS, title: 'In progress' },
            { status: FOLLOW_UP_STATUS.OVERDUE, title: 'Overdue' },
            { status: FOLLOW_UP_STATUS.COMPLETED, title: 'Completed' },
          ].map((col) => {
            const colTasks = items.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="bg-surface-container-low rounded-xl border border-hairline p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-label-md font-medium text-on-surface">
                    {col.title}
                  </span>
                  <span className="text-caption text-on-surface-variant tabular-nums">
                    {colTasks.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="p-3.5 rounded-lg bg-surface-container-lowest border border-hairline hover:border-secondary/40 cursor-pointer space-y-2 transition-colors"
                    >
                      <p className="text-body-sm font-medium text-on-surface">
                        {task.title}
                      </p>
                      <div className="flex items-center justify-between text-caption text-on-surface-variant tabular-nums">
                        <span className="truncate">
                          {task.customer?.companyName}
                        </span>
                        <span>{format(new Date(task.dueDate), 'dd MMM')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden">
          <div className="grid grid-cols-7 border-b border-hairline bg-surface-container-low text-center py-2 text-caption text-on-surface-variant">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-hairline">
            {calendarDays.map((day) => {
              const dayTasks = items.filter((t) =>
                isSameDay(new Date(t.dueDate), day),
              );
              return (
                <div
                  key={day.toISOString()}
                  className="min-h-[104px] p-2 space-y-1"
                >
                  <span className="text-caption text-on-surface-variant tabular-nums">
                    {format(day, 'd')}
                  </span>
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTask(t)}
                      className="w-full text-left px-1.5 py-0.5 rounded bg-surface-container hover:bg-secondary-fixed text-[11px] text-on-surface truncate cursor-pointer"
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Details & Progress SlideDrawer */}
      <SlideDrawer
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title ?? 'Task details'}
        subtitle={
          selectedTask
            ? `${selectedTask.customer?.companyName ?? 'Account'} · ${selectedTask.taskCode}`
            : undefined
        }
        badge={
          selectedTask ? <StatusBadge status={selectedTask.status} /> : undefined
        }
      >
        {selectedTask ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-body-sm tabular-nums">
              <div>
                <span className="text-caption text-on-surface-variant block">
                  Owner
                </span>
                <span className="font-medium text-on-surface">
                  {selectedTask.owner?.fullName}
                </span>
              </div>
              <div>
                <span className="text-caption text-on-surface-variant block">
                  Due date
                </span>
                <span className="font-medium text-on-surface">
                  {format(new Date(selectedTask.dueDate), 'dd MMM yyyy')}
                </span>
              </div>
            </div>

            {selectedTask.description ? (
              <p className="text-body-sm text-on-surface-variant">
                {selectedTask.description}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              {selectedTask.status !== FOLLOW_UP_STATUS.COMPLETED ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => void handleMarkComplete(selectedTask.id)}
                  >
                    <Check className="w-4 h-4" />
                    Mark complete
                  </Button>
                  {selectedTask.status === FOLLOW_UP_STATUS.PENDING ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleStatusChange(
                          selectedTask.id,
                          FOLLOW_UP_STATUS.IN_PROGRESS,
                        )
                      }
                    >
                      Start progress
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>

            {hasPermission(PERMISSIONS.FOLLOWUPS_REASSIGN) &&
            reps.length > 1 ? (
              <div className="pt-4 border-t border-hairline space-y-2">
                <span className="text-label-md font-medium text-on-surface block">
                  Reassign owner
                </span>
                <div className="flex items-center gap-2">
                  <SelectField
                    value={reassignOwnerId}
                    onChange={(e) => setReassignOwnerId(e.target.value)}
                    className="flex-1"
                  >
                    <option value="">Select team member...</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!reassignOwnerId}
                    onClick={() => void handleReassign()}
                  >
                    Reassign
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="pt-4 border-t border-hairline space-y-3">
              <span className="text-label-md font-medium text-on-surface block">
                Notes ({selectedTask.comments.length})
              </span>
              <div className="space-y-2">
                {selectedTask.comments.map((c, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-surface-container-low text-body-sm space-y-1"
                  >
                    <div className="flex items-center justify-between text-caption text-on-surface-variant">
                      <span className="font-medium text-on-surface">
                        {c.authorName}
                      </span>
                      <span>
                        {format(new Date(c.createdAt), 'dd MMM, h:mm a')}
                      </span>
                    </div>
                    <p className="text-on-surface">{c.body}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a progress note..."
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!commentText.trim()}
                >
                  Post
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </SlideDrawer>

      {/* Create Follow-up Drawer */}
      <SlideDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New follow-up task"
        subtitle="Create a customer deliverable with a clear owner and due date."
      >
        <form onSubmit={handleCreateTask} className="space-y-4" noValidate>
          {createError ? (
            <StatusBanner
              tone="error"
              message={createError}
              onDismiss={() => setCreateError(null)}
            />
          ) : null}

          <FormField label="Task title" htmlFor="new-fup-title" required>
            <Input
              id="new-fup-title"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Send revised MSA draft"
            />
          </FormField>

          <FormField label="Customer" htmlFor="new-fup-cust" required>
            <SelectField
              id="new-fup-cust"
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
              className="w-full"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </SelectField>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Owner" htmlFor="new-fup-owner" required>
              <SelectField
                id="new-fup-owner"
                value={newOwnerId}
                onChange={(e) => setNewOwnerId(e.target.value)}
                disabled={reps.length <= 1}
                className="w-full"
              >
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </SelectField>
            </FormField>

            <FormField label="Due date" htmlFor="new-fup-due" required>
              <Input
                id="new-fup-due"
                type="date"
                required
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Priority" htmlFor="new-fup-prio">
            <SelectField
              id="new-fup-prio"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as PriorityLevel)}
              className="w-full"
            >
              <option value={PRIORITY_LEVEL.LOW}>Low</option>
              <option value={PRIORITY_LEVEL.MEDIUM}>Medium</option>
              <option value={PRIORITY_LEVEL.HIGH}>High</option>
              <option value={PRIORITY_LEVEL.CRITICAL}>Critical</option>
            </SelectField>
          </FormField>

          <FormField label="Description" htmlFor="new-fup-desc" hint="Optional">
            <Textarea
              id="new-fup-desc"
              rows={3}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Context or deliverable details..."
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create task'}
            </Button>
          </div>
        </form>
      </SlideDrawer>
    </div>
  );
}
