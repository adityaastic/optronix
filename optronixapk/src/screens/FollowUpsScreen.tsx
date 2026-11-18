import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  FOLLOW_UP_STATUS,
  PRIORITY_LEVEL,
  formatDateShort,
} from '../lib/domain';
import type {
  AssignableUser,
  CustomerListItem,
  FollowUpItem,
} from '../lib/types';
import {
  BannerAlert,
  CardSurface,
  ChipGroup,
  EmptyBlock,
  FormInput,
  PageHeaderBar,
  PrimaryButton,
  SheetModal,
  StatusPill,
} from '../components/ui';
import { COLORS, SPACING } from '../theme/tokens';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'In progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
] as const;

export function FollowUpsScreen() {
  const { user, refreshSession } = useMobileAuth();
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Create Task Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [newPriority, setNewPriority] = useState<string>(PRIORITY_LEVEL.HIGH);
  const [newDesc, setNewDesc] = useState('');

  const loadTasks = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await mobileApiFetch<{ followUps: FollowUpItem[] }>(
          '/follow-ups',
          {
            query: {
              limit: 40,
              search: search.trim() || undefined,
              status: statusFilter || undefined,
            },
          },
        );
        setItems(res.data.followUps);
      } catch (err) {
        setError(
          err instanceof MobileApiError
            ? err.message
            : 'Unable to load follow-ups.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search, statusFilter],
  );

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void Promise.all([
      mobileApiFetch<{ customers: CustomerListItem[] }>('/customers', {
        query: { limit: 30 },
      }).catch(() => ({ data: { customers: [] } })),
      mobileApiFetch<{ users: AssignableUser[] }>('/users/assignable').catch(
        () => ({ data: { users: [] } }),
      ),
    ]).then(([cRes, rRes]) => {
      setCustomers(cRes.data.customers);
      setReps(rRes.data.users);
      if (cRes.data.customers[0]) setNewCustomerId(cRes.data.customers[0].id);
      setNewOwnerId(rRes.data.users[0]?.id ?? user?.id ?? '');
    });
  }, [user]);

  const handleMarkDone = async (id: string) => {
    try {
      await mobileApiFetch(`/follow-ups/${id}/complete`, { method: 'POST' });
      setBanner('Follow-up marked complete.');
      await loadTasks(true);
      await refreshSession();
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Unable to complete task.',
      );
    }
  };

  const handleCreateTask = async () => {
    if (newTitle.trim().length < 3 || !newCustomerId || !newDueDate) {
      setError('Provide a task title, customer, and due date.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await mobileApiFetch('/follow-ups', {
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
      setBanner('Follow-up task created.');
      await loadTasks(true);
      await refreshSession();
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Unable to create task.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadTasks(true);
          }}
        />
      }
    >
      <PageHeaderBar
        title="Follow-ups"
        subtitle="Action items, owners, and due dates."
        rightAction={
          <PrimaryButton
            label="New task"
            icon="plus"
            size="sm"
            onPress={() => setCreateOpen(true)}
          />
        }
      />

      {banner ? (
        <BannerAlert
          tone="success"
          message={banner}
          onDismiss={() => setBanner(null)}
        />
      ) : null}

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <FormInput
        label="Search tasks"
        placeholder="Search by task title or code..."
        value={search}
        onChangeText={setSearch}
      />

      <ChipGroup
        options={STATUS_TABS}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {loading && items.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: 32 }}
        />
      ) : items.length === 0 ? (
        <CardSurface padded={false}>
          <EmptyBlock
            icon="check-square"
            title="No follow-ups found"
            description="Create a task or adjust your status filter."
            action={
              <PrimaryButton
                label="New task"
                icon="plus"
                size="sm"
                onPress={() => setCreateOpen(true)}
              />
            }
          />
        </CardSurface>
      ) : (
        <CardSurface padded={false}>
          {items.map((f, idx) => {
            const overdue = f.status === FOLLOW_UP_STATUS.OVERDUE;
            const done = f.status === FOLLOW_UP_STATUS.COMPLETED;
            return (
              <View
                key={f.id}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {f.title}
                    </Text>
                    <StatusPill status={f.status} />
                  </View>
                  <Text style={styles.rowMeta}>
                    {f.customer?.companyName ?? 'Account'} ·{' '}
                    {f.owner?.fullName ?? 'Owner'}
                  </Text>
                  <Text
                    style={[
                      styles.rowMeta,
                      overdue && { color: COLORS.warning, fontWeight: '600' },
                    ]}
                  >
                    Due {formatDateShort(f.dueDate)}
                    {overdue ? ' · Overdue' : ''}
                  </Text>
                </View>

                {!done ? (
                  <PrimaryButton
                    label="Complete"
                    size="sm"
                    variant="outline"
                    icon="check"
                    onPress={() => void handleMarkDone(f.id)}
                  />
                ) : null}
              </View>
            );
          })}
        </CardSurface>
      )}

      <SheetModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New follow-up task"
        subtitle="Assign an action item with a clear owner and due date."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setCreateOpen(false)}
            />
            <PrimaryButton
              label="Create task"
              style={{ flex: 1 }}
              loading={creating}
              onPress={() => void handleCreateTask()}
            />
          </View>
        }
      >
        <FormInput
          label="Task title"
          required
          placeholder="Send revised proposal..."
          value={newTitle}
          onChangeText={setNewTitle}
        />
        {customers.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Text style={styles.label}>Customer *</Text>
            <ChipGroup
              options={customers.map((c) => ({
                label: c.companyName,
                value: c.id,
              }))}
              value={newCustomerId}
              onChange={setNewCustomerId}
            />
          </View>
        ) : null}
        {reps.length > 1 ? (
          <View style={{ gap: 4 }}>
            <Text style={styles.label}>Owner *</Text>
            <ChipGroup
              options={reps.map((r) => ({ label: r.fullName, value: r.id }))}
              value={newOwnerId}
              onChange={setNewOwnerId}
            />
          </View>
        ) : null}
        <FormInput
          label="Due date (YYYY-MM-DD)"
          required
          value={newDueDate}
          onChangeText={setNewDueDate}
        />
        <ChipGroup
          options={[
            { label: 'Low', value: PRIORITY_LEVEL.LOW },
            { label: 'Medium', value: PRIORITY_LEVEL.MEDIUM },
            { label: 'High', value: PRIORITY_LEVEL.HIGH },
            { label: 'Critical', value: PRIORITY_LEVEL.CRITICAL },
          ]}
          value={newPriority}
          onChange={setNewPriority}
        />
        <FormInput
          label="Notes"
          hint="Optional"
          multiline
          value={newDesc}
          onChangeText={setNewDesc}
        />
      </SheetModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: SPACING.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
});
