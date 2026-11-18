import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  MEETING_STATUS,
  MEETING_TYPE,
  PERMISSIONS,
  PRIORITY_LEVEL,
  formatDateShort,
  formatDateTimeShort,
  formatTimeShort,
} from '../lib/domain';
import type {
  AssignableUser,
  CustomerDossier,
  CustomerListItem,
  MeetingDetailsDto,
  MeetingListItem,
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

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'In progress', value: 'IN_PROGRESS' },
  { label: 'Awaiting outcome', value: 'AWAITING_OUTCOME' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Reopened', value: 'REOPENED' },
] as const;

export function MeetingsDirectoryScreen({
  onOpenSchedule,
  onOpenMeeting,
  onOpenVisit,
}: {
  onOpenSchedule: () => void;
  onOpenMeeting: (id: string) => void;
  onOpenVisit: (id: string) => void;
}) {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeetings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await mobileApiFetch<{ meetings: MeetingListItem[] }>(
          '/meetings',
          {
            query: {
              limit: 40,
              search: search.trim() || undefined,
              status: status || undefined,
            },
          },
        );
        setMeetings(res.data.meetings);
      } catch (err) {
        setError(
          err instanceof MobileApiError
            ? err.message
            : 'Unable to load meetings.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search, status],
  );

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadMeetings(true);
          }}
        />
      }
    >
      <PageHeaderBar
        title="Meetings"
        subtitle="Scheduled visits, active sessions, and completed outcomes."
        rightAction={
          <PrimaryButton
            label="Schedule"
            icon="plus"
            size="sm"
            onPress={onOpenSchedule}
          />
        }
      />

      <FormInput
        label="Search"
        placeholder="Search by customer, code, or title..."
        value={search}
        onChangeText={setSearch}
      />

      <ChipGroup
        options={STATUS_FILTERS}
        value={status}
        onChange={setStatus}
      />

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {loading && meetings.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={COLORS.accent}
          style={{ marginTop: 32 }}
        />
      ) : meetings.length === 0 ? (
        <CardSurface padded={false}>
          <EmptyBlock
            icon="calendar"
            title="No meetings match"
            description="Adjust filters or schedule a new customer visit."
            action={
              <PrimaryButton
                label="Schedule meeting"
                icon="plus"
                size="sm"
                onPress={onOpenSchedule}
              />
            }
          />
        </CardSurface>
      ) : (
        <CardSurface padded={false}>
          {meetings.map((m, idx) => {
            const canVisit =
              m.status !== MEETING_STATUS.COMPLETED &&
              m.status !== MEETING_STATUS.CANCELLED;
            return (
              <Pressable
                key={m.id}
                onPress={() => onOpenMeeting(m.id)}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowCompany} numberOfLines={1}>
                      {m.customer?.companyName ?? m.title}
                    </Text>
                    <StatusPill status={m.status} />
                  </View>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {m.meetingCode} · {m.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {formatDateShort(m.scheduledStart)} ·{' '}
                    {formatTimeShort(m.scheduledStart)} –{' '}
                    {formatTimeShort(m.scheduledEnd)} ·{' '}
                    {m.assignedRep?.fullName ?? 'Rep'}
                  </Text>
                </View>

                {canVisit ? (
                  <PrimaryButton
                    label="Visit"
                    size="sm"
                    variant="outline"
                    icon="map-pin"
                    onPress={() => onOpenVisit(m.id)}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </CardSurface>
      )}
    </ScrollView>
  );
}

export function ScheduleMeetingScreen({
  initialCustomerId,
  onCancel,
  onCreated,
}: {
  initialCustomerId?: string | null;
  onCancel: () => void;
  onCreated: (meetingId: string) => void;
}) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [contacts, setContacts] = useState<CustomerDossier['contacts']>([]);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictCount, setConflictCount] = useState(0);

  const [customerId, setCustomerId] = useState(initialCustomerId ?? '');
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('Solution Discovery');
  const [meetingType, setMeetingType] = useState<string>(MEETING_TYPE.IN_PERSON);
  const [priority, setPriority] = useState<string>(PRIORITY_LEVEL.MEDIUM);
  const [dateStr, setDateStr] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [startStr, setStartStr] = useState('10:00');
  const [endStr, setEndStr] = useState('11:00');
  const [locationText, setLocationText] = useState('');
  const [assignedRepId, setAssignedRepId] = useState('');
  const [agenda, setAgenda] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [cRes, rRes] = await Promise.all([
          mobileApiFetch<{ customers: CustomerListItem[] }>('/customers', {
            query: { limit: 40 },
          }),
          mobileApiFetch<{ users: AssignableUser[] }>('/users/assignable').catch(
            () => ({ data: { users: [] } }),
          ),
        ]);
        setCustomers(cRes.data.customers);
        setReps(rRes.data.users);
        const firstCust =
          cRes.data.customers.find((c) => c.id === initialCustomerId) ??
          cRes.data.customers[0];
        if (firstCust) {
          setCustomerId(firstCust.id);
          setLocationText(
            `${firstCust.address.street}, ${firstCust.address.city}`,
          );
        }
        if (rRes.data.users[0]) {
          setAssignedRepId(rRes.data.users[0].id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [initialCustomerId]);

  useEffect(() => {
    if (!customerId) return;
    void mobileApiFetch<{ customer: CustomerDossier }>(`/customers/${customerId}`)
      .then((res) => {
        setContacts(res.data.customer.contacts);
        const primary =
          res.data.customer.contacts.find((c) => c.isPrimary) ??
          res.data.customer.contacts[0];
        setContactId(primary?.id ?? '');
        setLocationText(
          `${res.data.customer.address.street}, ${res.data.customer.address.city}`,
        );
      })
      .catch(() => undefined);
  }, [customerId]);

  useEffect(() => {
    const startIso = new Date(`${dateStr}T${startStr}:00`);
    const endIso = new Date(`${dateStr}T${endStr}:00`);
    if (
      Number.isNaN(startIso.getTime()) ||
      Number.isNaN(endIso.getTime()) ||
      endIso <= startIso
    ) {
      setConflictCount(0);
      return;
    }
    void mobileApiFetch<{ conflicts: unknown[] }>('/meetings/conflicts', {
      query: {
        scheduledStart: startIso.toISOString(),
        scheduledEnd: endIso.toISOString(),
        assignedRepId: assignedRepId || undefined,
      },
    })
      .then((res) => setConflictCount(res.data.conflicts.length))
      .catch(() => setConflictCount(0));
  }, [dateStr, startStr, endStr, assignedRepId]);

  const handleSchedule = async () => {
    setError(null);
    if (!customerId) {
      setError('Select a customer account.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Enter a meeting title (at least 3 characters).');
      return;
    }
    const startIso = new Date(`${dateStr}T${startStr}:00`);
    const endIso = new Date(`${dateStr}T${endStr}:00`);
    if (
      Number.isNaN(startIso.getTime()) ||
      Number.isNaN(endIso.getTime()) ||
      endIso <= startIso
    ) {
      setError('End time must be after start time.');
      return;
    }
    if (meetingType === MEETING_TYPE.IN_PERSON && locationText.trim().length < 2) {
      setError('Enter the customer site address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await mobileApiFetch<{ meeting: { id: string } }>(
        '/meetings',
        {
          method: 'POST',
          body: {
            title: title.trim(),
            purpose: purpose.trim(),
            customerId,
            contactId: contactId || undefined,
            assignedRepId: assignedRepId || undefined,
            meetingType,
            priority,
            scheduledStart: startIso.toISOString(),
            scheduledEnd: endIso.toISOString(),
            timezone: 'Asia/Kolkata',
            locationText:
              locationText.trim() ||
              (meetingType === MEETING_TYPE.VIRTUAL
                ? 'Virtual video link'
                : 'Phone call'),
            agenda: agenda.trim() || undefined,
          },
        },
      );
      onCreated(res.data.meeting.id);
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Unable to schedule meeting.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={onCancel} style={styles.backLink}>
        <Feather name="arrow-left" size={16} color={COLORS.textMuted} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <PageHeaderBar
        title="Schedule meeting"
        subtitle="Set up a customer meeting in 5 clear steps."
      />

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {conflictCount > 0 ? (
        <BannerAlert
          tone="warning"
          message={`Heads up: ${conflictCount} overlapping meeting(s) found in this time window.`}
        />
      ) : null}

      <CardSurface style={{ gap: SPACING.lg }}>
        {/* 1. Customer & Contact */}
        <View style={{ gap: 8 }}>
          <Text style={styles.stepHeading}>1. Customer &amp; contact</Text>
          <ChipGroup
            options={customers.map((c) => ({
              label: c.companyName,
              value: c.id,
            }))}
            value={customerId}
            onChange={setCustomerId}
          />
          {contacts.length > 0 ? (
            <ChipGroup
              options={contacts.map((ct) => ({
                label: ct.fullName,
                value: ct.id,
              }))}
              value={contactId}
              onChange={setContactId}
            />
          ) : null}
        </View>

        {/* 2. Meeting Details */}
        <View style={{ gap: 10 }}>
          <Text style={styles.stepHeading}>2. Meeting details</Text>
          <FormInput
            label="Meeting title"
            required
            placeholder="e.g. Q4 Enterprise SLA Review"
            value={title}
            onChangeText={setTitle}
          />
          <FormInput
            label="Purpose"
            value={purpose}
            onChangeText={setPurpose}
          />
          <ChipGroup
            options={[
              { label: 'In-Person Visit', value: MEETING_TYPE.IN_PERSON },
              { label: 'Virtual Call', value: MEETING_TYPE.VIRTUAL },
              { label: 'Phone', value: MEETING_TYPE.PHONE },
            ]}
            value={meetingType}
            onChange={setMeetingType}
          />
        </View>

        {/* 3. Date, Time & Location */}
        <View style={{ gap: 10 }}>
          <Text style={styles.stepHeading}>3. Date, time &amp; location</Text>
          <FormInput
            label="Date (YYYY-MM-DD)"
            required
            value={dateStr}
            onChangeText={setDateStr}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <FormInput
              label="Start (HH:MM)"
              required
              style={{ flex: 1 }}
              value={startStr}
              onChangeText={setStartStr}
            />
            <FormInput
              label="End (HH:MM)"
              required
              style={{ flex: 1 }}
              value={endStr}
              onChangeText={setEndStr}
            />
          </View>
          <FormInput
            label="Location / link"
            required={meetingType === MEETING_TYPE.IN_PERSON}
            value={locationText}
            onChangeText={setLocationText}
          />
        </View>

        {/* 4. Assigned Employee */}
        {reps.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.stepHeading}>4. Assigned employee</Text>
            <ChipGroup
              options={reps.map((r) => ({ label: r.fullName, value: r.id }))}
              value={assignedRepId}
              onChange={setAssignedRepId}
            />
          </View>
        ) : null}

        {/* 5. Agenda & Confirm */}
        <View style={{ gap: 10 }}>
          <Text style={styles.stepHeading}>5. Agenda &amp; confirm</Text>
          <FormInput
            label="Agenda notes"
            hint="Optional"
            multiline
            placeholder="Topics to cover..."
            value={agenda}
            onChangeText={setAgenda}
          />
          <ChipGroup
            options={[
              { label: 'Low', value: PRIORITY_LEVEL.LOW },
              { label: 'Medium', value: PRIORITY_LEVEL.MEDIUM },
              { label: 'High', value: PRIORITY_LEVEL.HIGH },
              { label: 'Critical', value: PRIORITY_LEVEL.CRITICAL },
            ]}
            value={priority}
            onChange={setPriority}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton
            label="Cancel"
            variant="outline"
            style={{ flex: 1 }}
            onPress={onCancel}
          />
          <PrimaryButton
            label="Confirm & schedule"
            style={{ flex: 1.5 }}
            loading={submitting}
            onPress={() => void handleSchedule()}
          />
        </View>
      </CardSurface>
    </ScrollView>
  );
}

export function MeetingDetailsScreen({
  meetingId,
  onBack,
  onOpenVisit,
  onOpenOutcome,
}: {
  meetingId: string;
  onBack: () => void;
  onOpenVisit: (id: string) => void;
  onOpenOutcome: (id: string) => void;
}) {
  const { hasPermission } = useMobileAuth();
  const [meeting, setMeeting] = useState<MeetingDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [attachName, setAttachName] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}`,
      );
      setMeeting(res.data.meeting);
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Meeting not found.',
      );
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleConfirmSlot = async () => {
    setBusy(true);
    try {
      await mobileApiFetch(`/meetings/${meetingId}/confirm`, {
        method: 'POST',
        body: {},
      });
      await loadDetails();
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Confirm failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (cancelReason.trim().length < 5) return;
    setBusy(true);
    try {
      await mobileApiFetch(`/meetings/${meetingId}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason.trim(), notifyCustomer: true },
      });
      setCancelOpen(false);
      setCancelReason('');
      await loadDetails();
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Cancel failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAttachDoc = async () => {
    if (!attachName.trim()) return;
    setBusy(true);
    try {
      const normalized = attachName.trim().includes('.')
        ? attachName.trim()
        : `${attachName.trim()}.pdf`;
      await mobileApiFetch('/attachments', {
        method: 'POST',
        body: {
          originalName: normalized,
          mimeType: 'application/pdf',
          sizeBytes: 120_000,
          category: 'PROPOSAL',
          meetingId,
        },
      });
      setAttachName('');
      await loadDetails();
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Attach failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !meeting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!meeting) {
    return (
      <View style={styles.content}>
        <BannerAlert tone="error" message={error ?? 'Meeting not found.'} />
        <PrimaryButton label="Back" variant="outline" onPress={onBack} />
      </View>
    );
  }

  const canConfirm =
    meeting.status === MEETING_STATUS.SCHEDULED ||
    meeting.status === MEETING_STATUS.RESCHEDULED;
  const canVisit =
    meeting.status !== MEETING_STATUS.COMPLETED &&
    meeting.status !== MEETING_STATUS.CANCELLED;
  const canRecordOutcome =
    meeting.status === MEETING_STATUS.AWAITING_OUTCOME ||
    meeting.status === MEETING_STATUS.REOPENED;
  const canCancel = [
    MEETING_STATUS.SCHEDULED,
    MEETING_STATUS.CONFIRMED,
    MEETING_STATUS.RESCHEDULED,
  ].includes(meeting.status as 'SCHEDULED');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
    >
      <Pressable onPress={onBack} style={styles.backLink}>
        <Feather name="arrow-left" size={16} color={COLORS.textMuted} />
        <Text style={styles.backText}>Meetings</Text>
      </Pressable>

      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailsTitle}>{meeting.title}</Text>
          <Text style={styles.rowMeta}>
            {meeting.customer.companyName} · {meeting.meetingCode}
          </Text>
        </View>
        <StatusPill status={meeting.status} />
      </View>

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {/* Primary Action Strip */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {canConfirm ? (
          <PrimaryButton
            label="Confirm slot"
            variant="outline"
            icon="check"
            loading={busy}
            onPress={() => void handleConfirmSlot()}
          />
        ) : null}
        {canRecordOutcome ? (
          <PrimaryButton
            label="Record outcome"
            icon="file-text"
            onPress={() => onOpenOutcome(meeting.id)}
          />
        ) : null}
        {canVisit ? (
          <PrimaryButton
            label="Field Check-In / Out"
            variant={canRecordOutcome ? 'outline' : 'accent'}
            icon="map-pin"
            onPress={() => onOpenVisit(meeting.id)}
          />
        ) : null}
        <PrimaryButton
          label="WhatsApp"
          variant="outline"
          icon="message-circle"
          onPress={() => {
            const digits = (meeting.contact?.phone ?? '').replace(/\D/g, '');
            const phone =
              digits.length === 10
                ? `91${digits}`
                : digits.length >= 11
                  ? digits
                  : '';
            const msg = `Hello ${meeting.contact?.fullName?.split(' ')[0] ?? meeting.customer.companyName}, confirming our OPTRONIX meeting (${meeting.meetingCode}: ${meeting.title}) on ${formatDateShort(meeting.scheduledStart)} at ${formatTimeShort(meeting.scheduledStart)} (${meeting.locationText}). — ${meeting.assignedRep.fullName}`;
            const waUrl = phone
              ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
              : `https://wa.me/?text=${encodeURIComponent(msg)}`;
            void Linking.openURL(waUrl).catch(() => undefined);
          }}
        />
        {canCancel ? (
          <PrimaryButton
            label="Cancel"
            variant="ghost"
            onPress={() => setCancelOpen(true)}
          />
        ) : null}
      </View>

      {/* Summary Grid */}
      <CardSurface style={{ gap: 10 }}>
        <View style={styles.summaryPair}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Scheduled window</Text>
            <Text style={styles.metaValue}>
              {formatDateShort(meeting.scheduledStart)}
            </Text>
            <Text style={styles.rowMeta}>
              {formatTimeShort(meeting.scheduledStart)} –{' '}
              {formatTimeShort(meeting.scheduledEnd)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Actual visit duration</Text>
            <Text style={styles.metaValue}>
              {meeting.totalActualDurationMinutes} min
            </Text>
            <Text style={styles.rowMeta}>
              {meeting.completedSessionCount} completed session(s)
            </Text>
          </View>
        </View>

        <View style={styles.summaryPair}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Assigned employee</Text>
            <Text style={styles.metaValue}>{meeting.assignedRep.fullName}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={styles.rowMeta} numberOfLines={2}>
              {meeting.locationText}
            </Text>
          </View>
        </View>
      </CardSurface>

      {/* Outcome & Follow-ups */}
      {meeting.outcome ? (
        <CardSurface style={{ gap: 8 }}>
          <View style={styles.rowTop}>
            <Text style={styles.stepHeading}>Recorded outcome</Text>
            <StatusPill status={meeting.outcome.outcomeType} />
          </View>
          <Text style={styles.bodyCopy}>{meeting.outcome.summary}</Text>
        </CardSurface>
      ) : null}

      {/* Schedule Revisions & Visit Sessions */}
      <CardSurface style={{ gap: 10 }}>
        <Text style={styles.stepHeading}>
          Schedule &amp; reschedule history ({meeting.schedules.length})
        </Text>
        {meeting.schedules.map((sch) => (
          <View key={sch.id} style={styles.historyItem}>
            <Text style={styles.metaValue}>
              Rev #{sch.revisionNumber}
              {sch.isOriginal ? ' (Original)' : ''} ·{' '}
              {formatDateShort(sch.scheduledStart)},{' '}
              {formatTimeShort(sch.scheduledStart)} –{' '}
              {formatTimeShort(sch.scheduledEnd)}
            </Text>
            {sch.changeReason ? (
              <Text style={styles.rowMeta}>{sch.changeReason}</Text>
            ) : null}
          </View>
        ))}

        {meeting.visitSessions.length > 0 ? (
          <View style={styles.subDivider}>
            <Text style={styles.stepHeading}>
              Visit sessions ({meeting.visitSessions.length})
            </Text>
            {meeting.visitSessions.map((vs) => (
              <View key={vs.id} style={styles.rowTop}>
                <Text style={styles.rowMeta}>
                  Session #{vs.sessionNumber}: {formatTimeShort(vs.checkInAt)} –{' '}
                  {vs.checkOutAt ? formatTimeShort(vs.checkOutAt) : 'Active'}
                </Text>
                <Text style={styles.metaValue}>
                  {vs.status === 'COMPLETED'
                    ? `${vs.netDurationMinutes}m`
                    : vs.status}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </CardSurface>

      {/* Attachments */}
      <CardSurface style={{ gap: 10 }}>
        <Text style={styles.stepHeading}>
          Attachments ({meeting.attachments.length})
        </Text>
        {meeting.attachments.map((att) => (
          <View key={att.id} style={styles.rowTop}>
            <Text style={styles.metaValue}>{att.originalName}</Text>
            <Text style={styles.rowMeta}>{att.category}</Text>
          </View>
        ))}
        {hasPermission(PERMISSIONS.MEETINGS_UPDATE) &&
        meeting.status !== MEETING_STATUS.COMPLETED ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <FormInput
              label="Attach document"
              placeholder="Proposal_v2.pdf"
              style={{ flex: 1 }}
              value={attachName}
              onChangeText={setAttachName}
            />
            <PrimaryButton
              label="Attach"
              size="sm"
              variant="outline"
              disabled={!attachName.trim() || busy}
              onPress={() => void handleAttachDoc()}
            />
          </View>
        ) : null}
      </CardSurface>

      {/* Collapsible Activity History */}
      <CardSurface style={{ gap: 8 }}>
        <Pressable
          onPress={() => setShowAudit((v) => !v)}
          style={styles.rowTop}
        >
          <Text style={styles.stepHeading}>
            Activity history ({meeting.events.length})
          </Text>
          <Feather
            name={showAudit ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.textMuted}
          />
        </Pressable>
        {showAudit
          ? meeting.events.map((ev) => (
              <View key={ev.id} style={styles.historyItem}>
                <Text style={styles.metaValue}>
                  {ev.eventType.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.rowMeta}>
                  {ev.actorName} · {formatDateTimeShort(ev.createdAt)}
                  {ev.reason ? ` — "${ev.reason}"` : ''}
                </Text>
              </View>
            ))
          : null}
      </CardSurface>

      {/* Cancel Modal */}
      <SheetModal
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel meeting"
        subtitle="Provide a reason for cancelling this scheduled meeting."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Keep meeting"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setCancelOpen(false)}
            />
            <PrimaryButton
              label="Confirm cancel"
              variant="danger"
              style={{ flex: 1 }}
              disabled={cancelReason.trim().length < 5}
              loading={busy}
              onPress={() => void handleCancelMeeting()}
            />
          </View>
        }
      >
        <FormInput
          label="Cancellation reason"
          required
          hint="Min 5 chars"
          multiline
          value={cancelReason}
          onChangeText={setCancelReason}
        />
      </SheetModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
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
    justifyContent: 'space-between',
    gap: 8,
  },
  rowCompany: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    color: COLORS.text,
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  stepHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  detailsTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryPair: {
    flexDirection: 'row',
    gap: 14,
  },
  metaLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  bodyCopy: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  historyItem: {
    paddingVertical: 4,
    gap: 2,
  },
  subDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    gap: 6,
  },
});
