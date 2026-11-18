import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  OUTCOME_TYPE,
  PRIORITY_LEVEL,
  type OutcomeType,
  type PriorityLevel,
} from '../lib/domain';
import type { AssignableUser, MeetingDetailsDto } from '../lib/types';
import {
  BannerAlert,
  CardSurface,
  ChipGroup,
  FormInput,
  PrimaryButton,
  StatusPill,
} from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme/tokens';

const OUTCOME_OPTIONS: ReadonlyArray<{
  type: OutcomeType;
  title: string;
  subtitle: string;
}> = [
  {
    type: OUTCOME_TYPE.INTERESTED,
    title: 'Interested',
    subtitle: 'Qualified opportunity advancing',
  },
  {
    type: OUTCOME_TYPE.PROPOSAL_REQUESTED,
    title: 'Proposal requested',
    subtitle: 'Commercial quote or SOW requested',
  },
  {
    type: OUTCOME_TYPE.FOLLOW_UP_REQUIRED,
    title: 'Follow-up required',
    subtitle: 'Requires assigned owner & due date',
  },
  {
    type: OUTCOME_TYPE.NOT_INTERESTED,
    title: 'Not interested',
    subtitle: 'Disqualified or no current fit',
  },
  {
    type: OUTCOME_TYPE.UNABLE_TO_MEET,
    title: 'Unable to meet',
    subtitle: 'Stakeholder unavailable',
  },
];

interface DraftTask {
  id: string;
  title: string;
  ownerId: string;
  dueDate: string;
  priority: PriorityLevel;
}

export function OutcomeScreen({
  meetingId,
  onBack,
  onSaved,
}: {
  meetingId: string;
  onBack: () => void;
  onSaved: (id: string) => void;
}) {
  const { user } = useMobileAuth();
  const defaultCurrency = user?.tenantSettings?.defaultCurrency ?? 'INR';
  const [meeting, setMeeting] = useState<MeetingDetailsDto | null>(null);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [outcomeType, setOutcomeType] = useState<OutcomeType>(
    OUTCOME_TYPE.INTERESTED,
  );
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [productsText, setProductsText] = useState('');
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [tasks, setTasks] = useState<DraftTask[]>([]);

  const defaultDue = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, rRes] = await Promise.all([
        mobileApiFetch<{ meeting: MeetingDetailsDto }>(`/meetings/${meetingId}`),
        mobileApiFetch<{ users: AssignableUser[] }>('/users/assignable').catch(
          () => ({ data: { users: [] } }),
        ),
      ]);
      const m = mRes.data.meeting;
      setMeeting(m);
      setReps(rRes.data.users);
      if (m.outcome) {
        setOutcomeType(m.outcome.outcomeType as OutcomeType);
        setSummary(m.outcome.summary);
        setMinutes(m.outcome.minutes ?? '');
      }
      setTasks([
        {
          id: 'task-1',
          title: '',
          ownerId: m.assignedRep.id,
          dueDate: defaultDue(),
          priority: PRIORITY_LEVEL.HIGH,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Unable to load meeting.',
      );
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const validTasks = tasks.filter(
    (t) => t.title.trim().length >= 3 && Boolean(t.ownerId) && Boolean(t.dueDate),
  );

  const submitOutcome = async (completeAndLock: boolean) => {
    setError(null);
    if (summary.trim().length < 5) {
      setError('Enter a concise outcome summary (at least 5 characters).');
      return;
    }
    if (
      outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED &&
      validTasks.length === 0
    ) {
      setError(
        'Follow-up required demands at least one task with title, owner, and due date.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await mobileApiFetch(`/meetings/${meetingId}/outcome`, {
        method: 'POST',
        body: {
          outcomeType,
          summary: summary.trim(),
          minutes: minutes.trim() || undefined,
          commercialSpecs:
            outcomeType === OUTCOME_TYPE.INTERESTED ||
            outcomeType === OUTCOME_TYPE.PROPOSAL_REQUESTED
              ? {
                  estimatedValue: estimatedValue
                    ? Number(estimatedValue)
                    : undefined,
                  currency: defaultCurrency,
                  productsDiscussed: productsText
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : undefined,
          disqualificationReason:
            outcomeType === OUTCOME_TYPE.NOT_INTERESTED
              ? disqualificationReason.trim() || undefined
              : undefined,
          followUpTasks: validTasks.map((t) => ({
            title: t.title.trim(),
            ownerId: t.ownerId,
            dueDate: new Date(`${t.dueDate}T17:00:00`).toISOString(),
            priority: t.priority,
          })),
          completeAndLock,
        },
      });
      onSaved(meetingId);
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Failed to record meeting outcome.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !meeting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const hasCompletedVisit =
    meeting.completedSessionCount > 0 ||
    outcomeType === OUTCOME_TYPE.UNABLE_TO_MEET;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={onBack} style={styles.backLink}>
        <Feather name="arrow-left" size={16} color={COLORS.textMuted} />
        <Text style={styles.backText}>Back to meeting details</Text>
      </Pressable>

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Record outcome</Text>
          <Text style={styles.sub}>
            {meeting.customer.companyName} · {meeting.totalActualDurationMinutes}m
            across {meeting.completedSessionCount} completed session(s)
          </Text>
        </View>
        <StatusPill status={meeting.status} />
      </View>

      {!hasCompletedVisit ? (
        <BannerAlert
          tone="warning"
          message='Complete at least one visit check-in & check-out before locking this meeting (or select "Unable to meet").'
        />
      ) : null}

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      <CardSurface style={{ gap: SPACING.lg }}>
        {/* 1. Five Selectable Outcomes */}
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>1. Select outcome</Text>
          {OUTCOME_OPTIONS.map((opt) => {
            const selected = outcomeType === opt.type;
            return (
              <Pressable
                key={opt.type}
                onPress={() => setOutcomeType(opt.type)}
                style={[
                  styles.optionCard,
                  selected && styles.optionCardSelected,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{opt.title}</Text>
                  <Text style={styles.optionSub}>{opt.subtitle}</Text>
                </View>
                {selected ? (
                  <Feather name="check" size={16} color={COLORS.accent} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* 2. Conditional Fields */}
        {outcomeType === OUTCOME_TYPE.INTERESTED ||
        outcomeType === OUTCOME_TYPE.PROPOSAL_REQUESTED ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Commercial details</Text>
            <FormInput
              label={`Estimated value (${defaultCurrency})`}
              hint="Optional"
              keyboardType="numeric"
              placeholder="45000"
              value={estimatedValue}
              onChangeText={setEstimatedValue}
            />
            <FormInput
              label="Products discussed"
              hint="Comma-separated"
              placeholder="Enterprise Suite, Analytics"
              value={productsText}
              onChangeText={setProductsText}
            />
          </View>
        ) : null}

        {outcomeType === OUTCOME_TYPE.NOT_INTERESTED ? (
          <FormInput
            label="Primary disqualification reason"
            hint="Optional"
            placeholder="Budget timing, incumbent contract..."
            value={disqualificationReason}
            onChangeText={setDisqualificationReason}
          />
        ) : null}

        {/* 3. Summary & Minutes */}
        <FormInput
          label="Outcome summary"
          required
          multiline
          placeholder="Executive summary of decisions and next steps..."
          value={summary}
          onChangeText={setSummary}
        />

        <FormInput
          label="Detailed minutes"
          hint="Optional"
          multiline
          placeholder="Technical notes or stakeholder feedback..."
          value={minutes}
          onChangeText={setMinutes}
        />

        {/* 4. Follow-Up Tasks */}
        <View style={{ gap: 10 }}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>
              Follow-up tasks
              {outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED ? ' *' : ''}
            </Text>
            <PrimaryButton
              label="Add task"
              size="sm"
              variant="outline"
              icon="plus"
              onPress={() =>
                setTasks((prev) => [
                  ...prev,
                  {
                    id: `task-${Date.now()}`,
                    title: '',
                    ownerId: meeting.assignedRep.id,
                    dueDate: defaultDue(),
                    priority: PRIORITY_LEVEL.MEDIUM,
                  },
                ])
              }
            />
          </View>

          {tasks.map((t) => (
            <View key={t.id} style={styles.taskBox}>
              <FormInput
                label="Task title"
                required={outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED}
                placeholder="Send product quotation & SLA..."
                value={t.title}
                onChangeText={(val) =>
                  setTasks((prev) =>
                    prev.map((item) =>
                      item.id === t.id ? { ...item, title: val } : item,
                    ),
                  )
                }
              />
              <FormInput
                label="Due date (YYYY-MM-DD)"
                required
                value={t.dueDate}
                onChangeText={(val) =>
                  setTasks((prev) =>
                    prev.map((item) =>
                      item.id === t.id ? { ...item, dueDate: val } : item,
                    ),
                  )
                }
              />
              {reps.length > 1 ? (
                <View style={{ gap: 4 }}>
                  <Text style={styles.ownerLabel}>Assigned owner *</Text>
                  <ChipGroup
                    options={reps.map((r) => ({
                      label: r.fullName,
                      value: r.id,
                    }))}
                    value={t.ownerId}
                    onChange={(nextId) =>
                      setTasks((prev) =>
                        prev.map((item) =>
                          item.id === t.id ? { ...item, ownerId: nextId } : item,
                        ),
                      )
                    }
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton
            label="Save draft"
            variant="outline"
            style={{ flex: 1 }}
            disabled={submitting}
            onPress={() => void submitOutcome(false)}
          />
          <PrimaryButton
            label="Complete & lock"
            style={{ flex: 1.5 }}
            loading={submitting}
            disabled={!hasCompletedVisit}
            onPress={() => void submitOutcome(true)}
          />
        </View>
      </CardSurface>
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
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 40,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  sub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  optionCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  taskBox: {
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  ownerLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
  },
});
