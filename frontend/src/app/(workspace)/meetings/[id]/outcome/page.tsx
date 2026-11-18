'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { addDays, format } from 'date-fns';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  OUTCOME_TYPE,
  PRIORITY_LEVEL,
  type OutcomeType,
  type PriorityLevel,
} from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AssignableUser, MeetingDetailsDto } from '@/lib/types';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import {
  FormField,
  StatusBanner,
  focusFirstInvalidField,
  useUnsavedChangesWarning,
} from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { VoiceDictationButton } from '@/components/shared/VoiceDictationButton';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface DeliverableDraft {
  id: string;
  title: string;
  ownerId: string;
  dueDate: string;
  priority: PriorityLevel;
}

const OUTCOME_OPTIONS: Array<{
  type: OutcomeType;
  title: string;
  subtitle: string;
}> = [
  {
    type: OUTCOME_TYPE.INTERESTED,
    title: 'Interested',
    subtitle: 'Positive fit and interest confirmed',
  },
  {
    type: OUTCOME_TYPE.PROPOSAL_REQUESTED,
    title: 'Proposal requested',
    subtitle: 'Customer requested pricing or commercial proposal',
  },
  {
    type: OUTCOME_TYPE.FOLLOW_UP_REQUIRED,
    title: 'Follow-up required',
    subtitle: 'Next action item needed (requires owner & due date)',
  },
  {
    type: OUTCOME_TYPE.NOT_INTERESTED,
    title: 'Not interested',
    subtitle: 'Disqualified or no active requirement',
  },
  {
    type: OUTCOME_TYPE.UNABLE_TO_MEET,
    title: 'Unable to meet',
    subtitle: 'Stakeholder unavailable on arrival',
  },
];

export default function RecordOutcomePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<MeetingDetailsDto | null>(null);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [outcomeType, setOutcomeType] = useState<OutcomeType>(
    OUTCOME_TYPE.INTERESTED,
  );
  const [summary, setSummary] = useState('');
  const [showMinutes, setShowMinutes] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [productsText, setProductsText] = useState('');
  const [disqualificationReason, setDisqualificationReason] = useState('');
  const [deliverables, setDeliverables] = useState<DeliverableDraft[]>([]);
  const [touched, setTouched] = useState(false);

  useUnsavedChangesWarning(Boolean(summary.trim()) && !isSubmitting);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [mtgRes, repsRes] = await Promise.all([
        apiFetch<{ meeting: MeetingDetailsDto }>(`/meetings/${meetingId}`),
        apiFetch<{ users: AssignableUser[] }>('/users/assignable'),
      ]);
      const m = mtgRes.data.meeting;
      setMeeting(m);
      setReps(repsRes.data.users);

      if (m.outcome) {
        setOutcomeType(m.outcome.outcomeType);
        setSummary(m.outcome.summary);
        setMinutes(m.outcome.minutes ?? '');
        if (m.outcome.commercialSpecs?.estimatedValue) {
          setEstimatedValue(String(m.outcome.commercialSpecs.estimatedValue));
        }
        if (m.outcome.commercialSpecs?.productsDiscussed?.length) {
          setProductsText(
            m.outcome.commercialSpecs.productsDiscussed.join(', '),
          );
        }
        setDisqualificationReason(m.outcome.disqualificationReason ?? '');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        router.replace('/forbidden');
        return;
      }
      setError(err instanceof Error ? err.message : 'Unable to load meeting.');
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Automatically initialize one deliverable row when FOLLOW_UP_REQUIRED is chosen
  useEffect(() => {
    if (
      outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED &&
      deliverables.length === 0 &&
      user
    ) {
      setDeliverables([
        {
          id: `draft-${Date.now()}`,
          title: '',
          ownerId: user.id,
          dueDate: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
          priority: PRIORITY_LEVEL.HIGH,
        },
      ]);
    }
  }, [outcomeType, deliverables.length, user]);

  const addDeliverable = () => {
    setDeliverables((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${prev.length}`,
        title: '',
        ownerId: user?.id ?? reps[0]?.id ?? '',
        dueDate: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
        priority: PRIORITY_LEVEL.HIGH,
      },
    ]);
  };

  const updateDeliverable = (id: string, patch: Partial<DeliverableDraft>) => {
    setDeliverables((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  };

  const removeDeliverable = (id: string) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const summaryError =
    touched && summary.trim().length < 5
      ? 'Enter a short outcome summary (at least 5 characters).'
      : null;

  const validTasks = deliverables.filter(
    (d) =>
      d.title.trim().length >= 3 && Boolean(d.ownerId) && Boolean(d.dueDate),
  );

  const followUpError =
    touched &&
    outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED &&
    validTasks.length === 0
      ? 'Add at least one follow-up task with a title, owner, and due date.'
      : null;

  const submitOutcome = async (completeAndLock: boolean) => {
    setTouched(true);
    setSubmitError(null);

    if (
      summary.trim().length < 5 ||
      (outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED &&
        validTasks.length === 0)
    ) {
      focusFirstInvalidField(formRef.current);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch(`/meetings/${meetingId}/outcome`, {
        method: 'POST',
        body: {
          outcomeType,
          summary: summary.trim(),
          minutes: minutes.trim() || undefined,
          commercialSpecs:
            outcomeType === OUTCOME_TYPE.PROPOSAL_REQUESTED ||
            outcomeType === OUTCOME_TYPE.INTERESTED
              ? {
                  estimatedValue: estimatedValue
                    ? Number(estimatedValue)
                    : undefined,
                  currency: user?.tenantSettings?.defaultCurrency ?? 'INR',
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
      router.push(`/meetings/${meetingId}`);
    } catch (err) {
      setSubmitError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to save meeting outcome.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !meeting) {
    return <PageSkeleton />;
  }

  if (error || !meeting) {
    return (
      <ErrorState
        message={error ?? 'Meeting not found.'}
        onRetry={() => void loadData()}
      />
    );
  }

  const hasCompletedVisit =
    meeting.completedSessionCount > 0 ||
    outcomeType === OUTCOME_TYPE.UNABLE_TO_MEET;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-14">
      <div className="space-y-3">
        <Link
          href={`/meetings/${meeting.id}`}
          className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-on-surface"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to meeting details
        </Link>

        <PageHeader
          title="Record outcome"
          description={`${meeting.customer.companyName} · ${meeting.totalActualDurationMinutes} min across ${meeting.completedSessionCount} completed session${meeting.completedSessionCount === 1 ? '' : 's'}`}
          badge={<StatusBadge status={meeting.status} />}
        />
      </div>

      {!hasCompletedVisit ? (
        <StatusBanner
          tone="warning"
          message='Complete at least one visit check-in & check-out before locking this meeting (or choose "Unable to meet").'
        />
      ) : null}

      {submitError ? (
        <StatusBanner
          tone="error"
          message={submitError}
          onDismiss={() => setSubmitError(null)}
        />
      ) : null}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          void submitOutcome(true);
        }}
        noValidate
        className="bg-surface-container-lowest rounded-xl border border-hairline divide-y divide-hairline"
      >
        {/* 1. Five Selectable Outcomes */}
        <section className="p-5 sm:p-6 space-y-3">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            1. Outcome
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {OUTCOME_OPTIONS.map((opt) => {
              const selected = outcomeType === opt.type;
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setOutcomeType(opt.type)}
                  className={cn(
                    'p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start justify-between gap-2',
                    selected
                      ? 'border-secondary bg-secondary-fixed/70'
                      : 'border-hairline hover:bg-surface-container-low',
                  )}
                >
                  <div>
                    <span className="text-label-md font-semibold text-on-surface block">
                      {opt.title}
                    </span>
                    <span className="text-caption text-on-surface-variant mt-0.5 block">
                      {opt.subtitle}
                    </span>
                  </div>
                  {selected ? (
                    <Check className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Conditional Fields Based on Selected Outcome */}
        {(outcomeType === OUTCOME_TYPE.INTERESTED ||
          outcomeType === OUTCOME_TYPE.PROPOSAL_REQUESTED) && (
          <section className="p-5 sm:p-6 space-y-4">
            <h2 className="text-headline-sm font-semibold text-on-surface">
              Commercial details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label={`Estimated value (${user?.tenantSettings?.defaultCurrency ?? 'INR'})`}
                htmlFor="outcome-value"
                hint="Optional"
              >
                <Input
                  id="outcome-value"
                  type="number"
                  min={0}
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="e.g. 45000"
                />
              </FormField>
              <FormField
                label="Products discussed"
                htmlFor="outcome-products"
                hint="Comma-separated"
              >
                <Input
                  id="outcome-products"
                  value={productsText}
                  onChange={(e) => setProductsText(e.target.value)}
                  placeholder="Enterprise Suite, Analytics"
                />
              </FormField>
            </div>
          </section>
        )}

        {outcomeType === OUTCOME_TYPE.NOT_INTERESTED && (
          <section className="p-5 sm:p-6">
            <FormField
              label="Primary reason"
              htmlFor="outcome-disq"
              hint="Optional"
            >
              <Input
                id="outcome-disq"
                value={disqualificationReason}
                onChange={(e) => setDisqualificationReason(e.target.value)}
                placeholder="Budget timing, incumbent contract, etc."
              />
            </FormField>
          </section>
        )}

        {/* 3. Summary & Optional Minutes */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="outcome-summary"
                className="text-label-md font-medium text-on-surface"
              >
                Summary <span className="text-error">*</span>
              </label>
              <VoiceDictationButton
                onTranscript={(spoken) =>
                  setSummary((prev) => (prev ? `${prev} ${spoken}` : spoken))
                }
              />
            </div>
            <Textarea
              id="outcome-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={Boolean(summaryError)}
              placeholder="Concise executive summary of decisions, commitments, and next steps (or tap Voice input)..."
              required
            />
            {summaryError ? (
              <p className="text-caption text-error font-medium">
                {summaryError}
              </p>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowMinutes((v) => !v)}
              className="inline-flex items-center gap-1 text-body-sm text-secondary hover:underline font-medium cursor-pointer"
            >
              {showMinutes ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Hide detailed minutes
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Add detailed discussion minutes (optional)
                </>
              )}
            </button>
            {showMinutes ? (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-end">
                  <VoiceDictationButton
                    onTranscript={(spoken) =>
                      setMinutes((prev) =>
                        prev ? `${prev} ${spoken}` : spoken,
                      )
                    }
                  />
                </div>
                <Textarea
                  rows={4}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Detailed technical notes or stakeholder feedback..."
                />
              </div>
            ) : null}
          </div>
        </section>

        {/* 4. Follow-Up Tasks (Required for FOLLOW_UP_REQUIRED, optional otherwise) */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Follow-up tasks
                {outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED ? ' *' : ''}
              </h2>
              <p className="text-caption text-on-surface-variant">
                {outcomeType === OUTCOME_TYPE.FOLLOW_UP_REQUIRED
                  ? 'Required: assign an owner and due date before completing.'
                  : 'Optional next steps for this account.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDeliverable}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Deliverable
            </Button>
          </div>

          {followUpError ? (
            <StatusBanner tone="error" message={followUpError} />
          ) : null}

          {deliverables.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-surface-container-low border border-hairline space-y-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={item.title}
                  onChange={(e) =>
                    updateDeliverable(item.id, { title: e.target.value })
                  }
                  placeholder="e.g. Send product quotation & SLA addendum"
                  aria-invalid={Boolean(followUpError && item.title.trim().length < 3)}
                  className="flex-1"
                />
                {deliverables.length > 1 ||
                outcomeType !== OUTCOME_TYPE.FOLLOW_UP_REQUIRED ? (
                  <button
                    type="button"
                    aria-label="Remove task"
                    onClick={() => removeDeliverable(item.id)}
                    className="p-1.5 text-on-surface-variant hover:text-error cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField label="Owner" required>
                  <SelectField
                    value={item.ownerId}
                    onChange={(e) =>
                      updateDeliverable(item.id, { ownerId: e.target.value })
                    }
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

                <FormField label="Due date" required>
                  <Input
                    type="date"
                    value={item.dueDate}
                    onChange={(e) =>
                      updateDeliverable(item.id, { dueDate: e.target.value })
                    }
                  />
                </FormField>

                <FormField label="Priority">
                  <SelectField
                    value={item.priority}
                    onChange={(e) =>
                      updateDeliverable(item.id, {
                        priority: e.target.value as PriorityLevel,
                      })
                    }
                    className="w-full"
                  >
                    <option value={PRIORITY_LEVEL.LOW}>Low</option>
                    <option value={PRIORITY_LEVEL.MEDIUM}>Medium</option>
                    <option value={PRIORITY_LEVEL.HIGH}>High</option>
                    <option value={PRIORITY_LEVEL.CRITICAL}>Critical</option>
                  </SelectField>
                </FormField>
              </div>
            </div>
          ))}
        </section>

        {/* 5. Footer Actions */}
        <section className="p-5 sm:p-6 bg-surface-container-low/60 rounded-b-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-caption text-on-surface-variant">
            Completing locks this meeting against edits unless reopened by a
            manager.
          </span>

          <div className="flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => void submitOutcome(false)}
            >
              Save draft
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !hasCompletedVisit}
            >
              {isSubmitting ? 'Completing...' : 'Complete & Lock Meeting'}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
