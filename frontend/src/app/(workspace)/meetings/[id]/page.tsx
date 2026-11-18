'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit3,
  FileText,
  MessageCircle,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  EDITABLE_MEETING_STATUSES,
  MEETING_STATUS,
  PERMISSIONS,
} from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL, apiFetch, ApiClientError } from '@/lib/api-client';
import {
  buildWhatsAppMeetingUrl,
  downloadMeetingCalendarIcs,
  openPrintableMomReport,
} from '@/lib/share-meeting';
import type { MeetingDetailsDto } from '@/lib/types';
import { ActionMenu } from '@/components/shared/ActionMenu';
import { ConfirmModal, SlideDrawer } from '@/components/shared/ConfirmModal';
import {
  ErrorState,
  PageSkeleton,
  VerticalTimeline,
  type TimelineStepItem,
} from '@/components/shared/FeedbackStates';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { GeofenceMap } from '@/components/shared/GeofenceMap';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';

export default function MeetingDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<MeetingDetailsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editAgenda, setEditAgenda] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const [attachName, setAttachName] = useState('');
  const [attachCategory, setAttachCategory] = useState('PROPOSAL');
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const loadMeeting = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}`,
      );
      const m = res.data.meeting;
      setMeeting(m);
      setEditTitle(m.title);
      setEditLocation(m.locationText);
      setEditAgenda(m.agenda ?? '');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        router.replace('/forbidden');
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load meeting details.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, router]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  const handleConfirm = async () => {
    await apiFetch(`/meetings/${meetingId}/confirm`, { method: 'POST' });
    await loadMeeting();
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEdit(true);
    try {
      await apiFetch(`/meetings/${meetingId}`, {
        method: 'PATCH',
        body: {
          title: editTitle.trim(),
          locationText: editLocation.trim(),
          agenda: editAgenda.trim(),
        },
      });
      setEditOpen(false);
      await loadMeeting();
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (cancelReason.trim().length < 5) return;
    setIsCancelling(true);
    try {
      await apiFetch(`/meetings/${meetingId}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason.trim(), notifyCustomer: true },
      });
      setCancelOpen(false);
      setCancelReason('');
      await loadMeeting();
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRegisterAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachName.trim()) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const normalized = attachName.trim().includes('.')
        ? attachName.trim()
        : `${attachName.trim()}.pdf`;
      const lower = normalized.toLowerCase();
      const mimeType = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : 'application/pdf';

      await apiFetch('/attachments', {
        method: 'POST',
        body: {
          originalName: normalized,
          mimeType,
          sizeBytes: 124_800,
          category: attachCategory,
          meetingId,
        },
      });
      setAttachName('');
      await loadMeeting();
    } catch (err) {
      setAttachError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to attach file.',
      );
    } finally {
      setAttachBusy(false);
    }
  };

  const handleUploadRealFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', attachCategory);
      fd.append('meetingId', meetingId);
      await apiFetch('/attachments/upload', {
        method: 'POST',
        body: fd,
      });
      e.target.value = '';
      await loadMeeting();
    } catch (err) {
      setAttachError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to upload attachment.',
      );
    } finally {
      setAttachBusy(false);
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    await apiFetch(`/attachments/${attId}`, { method: 'DELETE' });
    await loadMeeting();
  };

  if (isLoading && !meeting) {
    return <PageSkeleton />;
  }

  if (error || !meeting) {
    return (
      <ErrorState
        message={error ?? 'Meeting not found.'}
        onRetry={() => void loadMeeting()}
      />
    );
  }

  const canEdit = EDITABLE_MEETING_STATUSES.includes(meeting.status);
  const canConfirm =
    meeting.status === MEETING_STATUS.SCHEDULED ||
    meeting.status === MEETING_STATUS.RESCHEDULED;
  const canCancel = [
    MEETING_STATUS.SCHEDULED,
    MEETING_STATUS.CONFIRMED,
    MEETING_STATUS.RESCHEDULED,
  ].includes(meeting.status as typeof MEETING_STATUS.SCHEDULED);
  const canVisit = [
    MEETING_STATUS.CONFIRMED,
    MEETING_STATUS.SCHEDULED,
    MEETING_STATUS.CHECKED_IN,
    MEETING_STATUS.IN_PROGRESS,
    MEETING_STATUS.PAUSED,
    MEETING_STATUS.RESCHEDULED,
    MEETING_STATUS.REOPENED,
  ].includes(meeting.status as typeof MEETING_STATUS.CONFIRMED);
  const canRecordOutcome =
    meeting.status === MEETING_STATUS.AWAITING_OUTCOME ||
    meeting.status === MEETING_STATUS.REOPENED;

  const timelineItems: TimelineStepItem[] = meeting.events.map((ev) => ({
    id: ev.id,
    title: ev.eventType.replace(/_/g, ' '),
    subtitle: `${ev.actorName}${ev.reason ? ` — "${ev.reason}"` : ''}`,
    timestamp: format(new Date(ev.createdAt), 'dd MMM, h:mm a'),
    status:
      ev.toStatus === MEETING_STATUS.COMPLETED
        ? 'completed'
        : ev.toStatus === MEETING_STATUS.CANCELLED ||
            ev.toStatus === MEETING_STATUS.PAUSED
          ? 'warning'
          : 'active',
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="space-y-3">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-on-surface"
        >
          <ArrowLeft className="w-4 h-4" />
          Meetings
        </Link>

        <PageHeader
          title={meeting.title}
          description={`${meeting.customer.companyName} · ${meeting.meetingCode}`}
          badge={<StatusBadge status={meeting.status} />}
          actions={
            <>
              {canConfirm ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleConfirm()}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Slot
                </Button>
              ) : null}

              {canRecordOutcome ? (
                <Button asChild variant="primary">
                  <Link href={`/meetings/${meeting.id}/outcome`}>
                    Record outcome
                  </Link>
                </Button>
              ) : canVisit ? (
                <Button asChild variant="primary">
                  <Link href={`/meetings/${meeting.id}/visit`}>
                    Field Visit Check-In / Out
                  </Link>
                </Button>
              ) : null}

              <ActionMenu
                items={[
                  ...(canEdit
                    ? [
                        {
                          label: 'Edit details',
                          icon: Edit3,
                          onSelect: () => setEditOpen(true),
                        },
                      ]
                    : []),
                  ...(canVisit && canRecordOutcome
                    ? [
                        {
                          label: 'Field Visit Check-In / Out',
                          onSelect: () =>
                            router.push(`/meetings/${meeting.id}/visit`),
                        },
                      ]
                    : []),
                  {
                    label: 'Send WhatsApp confirmation / MOM',
                    icon: MessageCircle,
                    onSelect: () => {
                      window.open(
                        buildWhatsAppMeetingUrl(meeting),
                        '_blank',
                        'noopener,noreferrer',
                      );
                    },
                  },
                  {
                    label: 'Download calendar invite (.ics)',
                    icon: CalendarPlus,
                    onSelect: () => downloadMeetingCalendarIcs(meeting),
                  },
                  {
                    label: 'Export OPTRONIX MOM PDF',
                    icon: FileText,
                    onSelect: () => openPrintableMomReport(meeting),
                  },
                  ...(canCancel
                    ? [
                        {
                          label: 'Cancel meeting',
                          icon: CalendarX2,
                          tone: 'danger' as const,
                          separatorBefore: true,
                          onSelect: () => setCancelOpen(true),
                        },
                      ]
                    : []),
                ]}
              />
            </>
          }
        />
      </div>

      {/* Key Summary Strip */}
      <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 grid grid-cols-2 sm:grid-cols-4 gap-5 tabular-nums">
        <div>
          <span className="text-caption text-on-surface-variant block">
            Scheduled window
          </span>
          <span className="text-body-md font-medium text-on-surface mt-0.5 block">
            {format(new Date(meeting.scheduledStart), 'dd MMM yyyy')}
          </span>
          <span className="text-caption text-on-surface-variant">
            {format(new Date(meeting.scheduledStart), 'h:mm a')} –{' '}
            {format(new Date(meeting.scheduledEnd), 'h:mm a')}
          </span>
        </div>

        <div>
          <span className="text-caption text-on-surface-variant block">
            Actual visit time
          </span>
          <span className="text-body-md font-medium text-on-surface mt-0.5 block">
            {meeting.totalActualDurationMinutes} min
          </span>
          <span className="text-caption text-on-surface-variant">
            {meeting.completedSessionCount} completed session
            {meeting.completedSessionCount === 1 ? '' : 's'}
          </span>
        </div>

        <div>
          <span className="text-caption text-on-surface-variant block">
            Owner &amp; contact
          </span>
          <span className="text-body-md font-medium text-on-surface mt-0.5 block truncate">
            {meeting.assignedRep.fullName}
          </span>
          <span className="text-caption text-on-surface-variant truncate block">
            {meeting.contact
              ? `With ${meeting.contact.fullName}`
              : meeting.customer.companyName}
          </span>
        </div>

        <div>
          <span className="text-caption text-on-surface-variant block">
            Location ({meeting.meetingType.replace('_', ' ').toLowerCase()})
          </span>
          <span className="text-body-md font-medium text-on-surface mt-0.5 block truncate">
            {meeting.locationText}
          </span>
          {meeting.currentScheduleRevision > 1 ? (
            <span className="text-caption text-amber-700">
              Schedule rev #{meeting.currentScheduleRevision}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Main Content (8 cols) */}
        <div className="lg:col-span-8 space-y-8">
          {/* Outcome & Follow-ups */}
          <section className="space-y-3">
            <h2 className="text-headline-md font-semibold text-on-surface">
              Outcome &amp; follow-ups
            </h2>
            <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 space-y-4">
              {meeting.outcome ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge
                      status={meeting.outcome.outcomeType}
                      showDot={false}
                    />
                    <span className="text-caption text-on-surface-variant tabular-nums">
                      Recorded{' '}
                      {format(
                        new Date(meeting.outcome.recordedAt),
                        'dd MMM yyyy, h:mm a',
                      )}
                    </span>
                  </div>
                  <p className="text-body-md text-on-surface leading-relaxed">
                    {meeting.outcome.summary}
                  </p>
                  {meeting.outcome.minutes ? (
                    <p className="text-body-sm text-on-surface-variant whitespace-pre-line pt-1">
                      {meeting.outcome.minutes}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  No outcome recorded yet. Complete your visit check-out to
                  record the final outcome.
                </p>
              )}

              {meeting.followUps.length > 0 ? (
                <div className="pt-3 border-t border-hairline space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-label-md font-medium text-on-surface">
                      Follow-up tasks ({meeting.followUps.length})
                    </span>
                    <Link
                      href="/follow-ups"
                      className="text-caption text-secondary hover:underline font-medium"
                    >
                      View all →
                    </Link>
                  </div>
                  {meeting.followUps.map((f) => (
                    <div
                      key={f.id}
                      className="py-2 flex items-center justify-between gap-3 text-body-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-on-surface truncate">
                          {f.title}
                        </p>
                        <p className="text-caption text-on-surface-variant tabular-nums">
                          {f.owner?.fullName ?? 'Unassigned'} · Due{' '}
                          {format(new Date(f.dueDate), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <StatusBadge status={f.status} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          {/* Visit Sessions & Schedule History */}
          <section className="space-y-3">
            <h2 className="text-headline-md font-semibold text-on-surface">
              Visit sessions &amp; schedule history
            </h2>
            <div className="bg-surface-container-lowest rounded-xl border border-hairline divide-y divide-hairline">
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-label-md font-medium text-on-surface">
                    Visit sessions ({meeting.visitSessions.length})
                  </span>
                  <span className="text-caption text-on-surface-variant tabular-nums">
                    Total net duration: {meeting.totalActualDurationMinutes} min
                  </span>
                </div>
                {meeting.visitSessions.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant">
                    No check-in sessions recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {meeting.visitSessions.map((vs) => (
                      <div
                        key={vs.id}
                        className="p-3 rounded-lg bg-surface-container-low space-y-2 text-body-sm tabular-nums"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-medium text-on-surface">
                              Session #{vs.sessionNumber}
                            </span>
                            <span className="text-on-surface-variant ml-2">
                              {format(new Date(vs.checkInAt), 'h:mm a')} →{' '}
                              {vs.checkOutAt
                                ? format(new Date(vs.checkOutAt), 'h:mm a')
                                : 'Active'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-on-surface">
                              {vs.netDurationMinutes} min
                            </span>
                            <StatusBadge status={vs.status} />
                          </div>
                        </div>
                        {vs.signatureDataUrl ? (
                          <div className="pt-2 border-t border-hairline flex items-center justify-between gap-3">
                            <span className="text-caption text-emerald-700 font-medium">
                              ✓ Verified Client Digital Sign-Off
                            </span>
                            <img
                              src={vs.signatureDataUrl}
                              alt={`Client signature for session #${vs.sessionNumber}`}
                              className="h-10 rounded border border-hairline bg-white px-2 py-0.5 object-contain"
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 space-y-2.5">
                <span className="text-label-md font-medium text-on-surface block">
                  Schedule revisions ({meeting.schedules.length})
                </span>
                <div className="space-y-2 text-body-sm tabular-nums">
                  {meeting.schedules.map((sch) => (
                    <div
                      key={sch.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-on-surface-variant"
                    >
                      <span>
                        <strong className="text-on-surface font-medium">
                          Rev #{sch.revisionNumber}
                          {sch.isOriginal ? ' (Original)' : ''}
                        </strong>{' '}
                        · {format(new Date(sch.scheduledStart), 'dd MMM, h:mm a')}{' '}
                        – {format(new Date(sch.scheduledEnd), 'h:mm a')}
                      </span>
                      {sch.changeReason ? (
                        <span className="text-caption truncate max-w-[260px]">
                          {sch.changeReason}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Agenda & Collateral */}
          <section className="space-y-3">
            <h2 className="text-headline-md font-semibold text-on-surface">
              Notes &amp; attachments
            </h2>
            <div className="bg-surface-container-lowest rounded-xl border border-hairline divide-y divide-hairline">
              <div className="p-5 space-y-2">
                <span className="text-label-md font-medium text-on-surface block">
                  Agenda
                </span>
                <p className="text-body-sm text-on-surface-variant whitespace-pre-line">
                  {meeting.agenda || 'No agenda notes added.'}
                </p>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-label-md font-medium text-on-surface flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-on-surface-variant" />
                    Attachments ({meeting.attachments.length})
                  </span>
                </div>

                {attachError ? (
                  <StatusBanner
                    tone="error"
                    message={attachError}
                    onDismiss={() => setAttachError(null)}
                  />
                ) : null}

                {meeting.attachments.length > 0 ? (
                  <div className="space-y-1.5">
                    {meeting.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="py-1.5 flex items-center justify-between gap-2 text-body-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-on-surface truncate block">
                            {att.originalName}
                          </span>
                          <span className="text-caption text-on-surface-variant">
                            {att.category} ·{' '}
                            {Math.max(1, Math.round(att.sizeBytes / 1024))} KB
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`${API_BASE_URL}/attachments/${att.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Download ${att.originalName}`}
                            className="p-1 text-on-surface-variant hover:text-secondary cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          {hasPermission(PERMISSIONS.MEETINGS_UPDATE) &&
                          meeting.status !== MEETING_STATUS.COMPLETED ? (
                            <button
                              type="button"
                              aria-label="Remove attachment"
                              onClick={() => void handleDeleteAttachment(att.id)}
                              className="p-1 text-on-surface-variant hover:text-error cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {hasPermission(PERMISSIONS.MEETINGS_UPDATE) &&
                meeting.status !== MEETING_STATUS.COMPLETED ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-hairline bg-surface-container-low hover:bg-surface-container text-label-sm font-medium text-on-surface cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5 text-secondary" />
                        <span>
                          {attachBusy ? 'Uploading...' : 'Upload file / photo'}
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,.pptx"
                          disabled={attachBusy}
                          onChange={(e) => void handleUploadRealFile(e)}
                          className="sr-only"
                        />
                      </label>
                      <span className="text-caption text-on-surface-variant">
                        PDF, PNG, JPG, CSV, or Office (up to 15 MB)
                      </span>
                    </div>

                    <form
                      onSubmit={(e) => void handleRegisterAttachment(e)}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                    >
                      <Input
                        placeholder="Document name (e.g. Proposal_v2.pdf)"
                        value={attachName}
                        onChange={(e) => setAttachName(e.target.value)}
                        className="flex-1"
                      />
                      <SelectField
                        value={attachCategory}
                        onChange={(e) => setAttachCategory(e.target.value)}
                      >
                        <option value="PROPOSAL">Proposal</option>
                        <option value="NDA">NDA</option>
                        <option value="SITE_PHOTO">Site photo</option>
                        <option value="CONTRACT">Contract</option>
                        <option value="GENERAL">General</option>
                      </SelectField>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={attachBusy || !attachName.trim()}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Attach
                      </Button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {/* Collapsible Activity & Audit History */}
          <details className="group bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden">
            <summary className="px-5 py-4 flex items-center justify-between cursor-pointer select-none list-none">
              <span className="text-label-md font-medium text-on-surface">
                Activity &amp; audit history ({meeting.events.length})
              </span>
              <ChevronDown className="w-4 h-4 text-on-surface-variant transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-hairline overflow-x-auto">
              <table className="w-full text-left text-body-sm tabular-nums">
                <thead className="bg-surface-container-low text-label-sm text-on-surface-variant border-b border-hairline">
                  <tr>
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5">Event</th>
                    <th className="px-4 py-2.5">Actor</th>
                    <th className="px-4 py-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {meeting.events.map((ev) => (
                    <tr key={ev.id}>
                      <td className="px-4 py-2.5 text-caption text-on-surface-variant">
                        {format(new Date(ev.createdAt), 'dd MMM, HH:mm:ss')}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-on-surface">
                        {ev.eventType.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-2.5 text-on-surface-variant">
                        {ev.actorName}
                      </td>
                      <td className="px-4 py-2.5 text-caption text-on-surface-variant">
                        {ev.fromStatus ? `${ev.fromStatus} → ` : ''}
                        {ev.toStatus}
                        {ev.reason ? ` · "${ev.reason}"` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        {/* Right Lifecycle & Site Map Column (4 cols) */}
        <aside className="lg:col-span-4 space-y-6">
          {(meeting.targetCoordinates ?? meeting.customer.address.coordinates) ? (
            <div className="bg-surface-container-lowest rounded-xl border border-hairline p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-headline-sm font-semibold text-on-surface">
                  Site &amp; geofence map
                </h2>
                <span className="text-caption text-on-surface-variant tabular-nums">
                  {meeting.customer.address.geofenceRadiusMeters}m zone
                </span>
              </div>
              <GeofenceMap
                targetLocation={
                  (meeting.targetCoordinates ??
                    meeting.customer.address.coordinates)!
                }
                targetLabel={meeting.customer.companyName}
                geofenceRadiusMeters={
                  meeting.customer.address.geofenceRadiusMeters
                }
                sessionPins={meeting.visitSessions
                  .filter(
                    (vs) =>
                      Number.isFinite(vs.checkInTelemetry?.latitude) &&
                      Number.isFinite(vs.checkInTelemetry?.longitude),
                  )
                  .map((vs) => ({
                    sessionNumber: vs.sessionNumber,
                    latitude: vs.checkInTelemetry.latitude,
                    longitude: vs.checkInTelemetry.longitude,
                    label: `Session #${vs.sessionNumber} check-in (${vs.netDurationMinutes}m)`,
                  }))}
                height={185}
              />
            </div>
          ) : null}

          {/* Quick Share & Export Card */}
          <div className="bg-surface-container-lowest rounded-xl border border-hairline p-4 space-y-2.5">
            <h2 className="text-headline-sm font-semibold text-on-surface">
              Client share &amp; MOM
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(
                    buildWhatsAppMeetingUrl(meeting),
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
                className="w-full justify-start"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                Send WhatsApp confirmation
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadMeetingCalendarIcs(meeting)}
                className="w-full justify-start"
              >
                <CalendarPlus className="w-4 h-4 text-secondary" />
                Download calendar (.ics)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openPrintableMomReport(meeting)}
                className="w-full justify-start"
              >
                <FileText className="w-4 h-4 text-secondary" />
                Export OPTRONIX MOM PDF
              </Button>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 space-y-4">
            <h2 className="text-headline-sm font-semibold text-on-surface">
              Lifecycle timeline
            </h2>
            <VerticalTimeline items={timelineItems} />
          </div>
        </aside>
      </div>

      {/* Edit Meeting Drawer */}
      <SlideDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit meeting"
        subtitle="Update title, location, or agenda."
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <FormField label="Title" htmlFor="edit-mtg-title" required>
            <Input
              id="edit-mtg-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Location" htmlFor="edit-mtg-loc" required>
            <Input
              id="edit-mtg-loc"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Agenda" htmlFor="edit-mtg-agenda">
            <Textarea
              id="edit-mtg-agenda"
              value={editAgenda}
              onChange={(e) => setEditAgenda(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingEdit}>
              {isSavingEdit ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </SlideDrawer>

      {/* Cancel Meeting Modal */}
      <ConfirmModal
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          setCancelReason('');
        }}
        title="Cancel meeting"
        description="Provide a short reason to cancel this scheduled meeting."
        tone="danger"
        confirmLabel="Cancel meeting"
        cancelLabel="Keep meeting"
        confirmDisabled={cancelReason.trim().length < 5}
        isSubmitting={isCancelling}
        onConfirm={() => void handleCancelMeeting()}
      >
        <FormField
          label="Cancellation reason"
          htmlFor="cancel-detail-reason"
          required
          hint="Min 5 characters"
        >
          <Textarea
            id="cancel-detail-reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation..."
          />
        </FormField>
      </ConfirmModal>
    </div>
  );
}
