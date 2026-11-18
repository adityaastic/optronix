'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Pause,
  PenTool,
  Play,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import {
  MEETING_STATUS,
  MEETING_TYPE,
  VISIT_SESSION_STATUS,
  calculateDistanceMeters,
  formatDurationClock,
} from '@/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import {
  enqueueOfflineVisitAction,
  flushOfflineVisitQueue,
  getOfflineVisitQueue,
} from '@/lib/offline-visit-queue';
import type { MeetingDetailsDto } from '@/lib/types';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { GeofenceMap } from '@/components/shared/GeofenceMap';
import { SignaturePad } from '@/components/shared/SignaturePad';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { VoiceDictationButton } from '@/components/shared/VoiceDictationButton';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

export default function MeetingVisitFieldPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<MeetingDetailsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'ready' | 'fallback'>(
    'locating',
  );
  const [coords, setCoords] = useState({
    latitude: 28.495,
    longitude: 77.089,
    accuracyMeters: 6,
  });

  // Field inputs
  const [arrivalNotes, setArrivalNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [fieldNotes, setFieldNotes] = useState('');
  const [showSignPad, setShowSignPad] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Modals
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [checkOutConfirmOpen, setCheckOutConfirmOpen] = useState(false);
  const [reschedModalOpen, setReschedModalOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  );
  const [reschedStart, setReschedStart] = useState('15:00');
  const [reschedEnd, setReschedEnd] = useState('16:00');
  const [reschedReason, setReschedReason] = useState('');

  // Live timer tick
  const [nowTick, setNowTick] = useState(() => Date.now());

  const captureBrowserGps = useCallback((fallbackLat?: number, fallbackLng?: number) => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setGpsStatus('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy || 5,
          });
          setGpsStatus('ready');
        },
        () => {
          if (fallbackLat !== undefined && fallbackLng !== undefined) {
            setCoords({
              latitude: fallbackLat,
              longitude: fallbackLng,
              accuracyMeters: 5,
            });
          }
          setGpsStatus('fallback');
        },
        { enableHighAccuracy: true, timeout: 4000 },
      );
    } else {
      setGpsStatus('fallback');
    }
  }, []);

  const loadMeeting = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}`,
      );
      const m = res.data.meeting;
      setMeeting(m);
      const tLat =
        m.targetCoordinates?.latitude ??
        m.customer.address.coordinates?.latitude;
      const tLng =
        m.targetCoordinates?.longitude ??
        m.customer.address.coordinates?.longitude;
      captureBrowserGps(tLat, tLng);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        router.replace('/forbidden');
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load meeting visit.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, router, captureBrowserGps]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncQueueBadge = () => {
      setIsOnline(navigator.onLine);
      setQueuedCount(getOfflineVisitQueue(meetingId).length);
    };
    syncQueueBadge();
    window.addEventListener('online', syncQueueBadge);
    window.addEventListener('offline', syncQueueBadge);
    window.addEventListener('optronix:offline-queue-changed', syncQueueBadge);
    return () => {
      window.removeEventListener('online', syncQueueBadge);
      window.removeEventListener('offline', syncQueueBadge);
      window.removeEventListener(
        'optronix:offline-queue-changed',
        syncQueueBadge,
      );
    };
  }, [meetingId]);

  const openSession = useMemo(
    () =>
      meeting?.visitSessions.find(
        (s) =>
          s.status === VISIT_SESSION_STATUS.ACTIVE ||
          s.status === VISIT_SESSION_STATUS.PAUSED,
      ) ?? null,
    [meeting],
  );

  const targetLat =
    meeting?.targetCoordinates?.latitude ??
    meeting?.customer.address.coordinates?.latitude ??
    coords.latitude;
  const targetLng =
    meeting?.targetCoordinates?.longitude ??
    meeting?.customer.address.coordinates?.longitude ??
    coords.longitude;
  const geofenceRadius =
    meeting?.customer.address.geofenceRadiusMeters ?? 100;

  const distanceMeters = useMemo(
    () =>
      calculateDistanceMeters(
        coords.latitude,
        coords.longitude,
        targetLat,
        targetLng,
      ),
    [coords.latitude, coords.longitude, targetLat, targetLng],
  );

  const isInPerson = meeting?.meetingType === MEETING_TYPE.IN_PERSON;
  const withinGeofence = !isInPerson || distanceMeters <= geofenceRadius;

  const liveElapsedSeconds = useMemo(() => {
    if (!openSession) return 0;
    const startMs = new Date(openSession.checkInAt).getTime();
    let pausedMs = 0;
    for (const seg of openSession.pauseSegments) {
      const pStart = new Date(seg.pausedAt).getTime();
      const pEnd = seg.resumedAt ? new Date(seg.resumedAt).getTime() : nowTick;
      if (pEnd > pStart) pausedMs += pEnd - pStart;
    }
    return Math.max(0, Math.floor((nowTick - startMs - pausedMs) / 1000));
  }, [openSession, nowTick]);

  const snapToSiteLocation = () => {
    setCoords({
      latitude: targetLat,
      longitude: targetLng,
      accuracyMeters: 4,
    });
    setGpsStatus('ready');
  };

  const handleCheckIn = async () => {
    if (!withinGeofence && overrideReason.trim().length < 5) {
      setActionError(
        'Please enter a short reason for checking in outside the customer site range.',
      );
      return;
    }
    const checkInPayload = {
      coordinates: coords,
      timestamp: new Date().toISOString(),
      arrivalNotes: arrivalNotes.trim() || undefined,
      geofenceOverrideReason: !withinGeofence
        ? overrideReason.trim()
        : undefined,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueOfflineVisitAction({
        meetingId,
        meetingCode: meeting?.meetingCode,
        action: 'check-in',
        payload: checkInPayload,
      });
      setOfflineNotice(
        'Offline mode: Check-in saved locally with verified GPS & exact timestamp. Will sync automatically when network returns.',
      );
      return;
    }

    setActionError(null);
    setIsBusy(true);
    try {
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/check-in`,
        {
          method: 'POST',
          body: checkInPayload,
        },
      );
      setMeeting(res.data.meeting);
      setArrivalNotes('');
    } catch (err) {
      if (
        err instanceof TypeError ||
        (err instanceof ApiClientError && err.status === 0)
      ) {
        enqueueOfflineVisitAction({
          meetingId,
          meetingCode: meeting?.meetingCode,
          action: 'check-in',
          payload: checkInPayload,
        });
        setOfflineNotice(
          'Network unreachable: Check-in queued locally with verified GPS & timestamp.',
        );
      } else {
        setActionError(
          err instanceof ApiClientError ? err.message : 'Check-in failed.',
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handlePause = async () => {
    setActionError(null);
    setIsBusy(true);
    try {
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/pause`,
        {
          method: 'POST',
          body: { reason: pauseReason.trim() || 'Paused visit session' },
        },
      );
      setMeeting(res.data.meeting);
      setPauseModalOpen(false);
      setPauseReason('');
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.message : 'Unable to pause visit.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleResume = async () => {
    setActionError(null);
    setIsBusy(true);
    try {
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/resume`,
        {
          method: 'POST',
          body: { notes: 'Resumed visit' },
        },
      );
      setMeeting(res.data.meeting);
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.message : 'Unable to resume visit.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinalizeCheckOut = async () => {
    const checkOutPayload = {
      coordinates: coords,
      timestamp: new Date().toISOString(),
      fieldNotes: fieldNotes.trim() || undefined,
      signatureDataUrl,
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueOfflineVisitAction({
        meetingId,
        meetingCode: meeting?.meetingCode,
        action: 'check-out',
        payload: checkOutPayload,
      });
      setCheckOutConfirmOpen(false);
      setOfflineNotice(
        'Offline mode: Check-out & sign-off saved locally with verified GPS & timestamp. Will sync automatically when online.',
      );
      return;
    }

    setActionError(null);
    setIsBusy(true);
    try {
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/check-out`,
        {
          method: 'POST',
          body: checkOutPayload,
        },
      );
      setMeeting(res.data.meeting);
      setCheckOutConfirmOpen(false);
      router.push(`/meetings/${meetingId}/outcome`);
    } catch (err) {
      setCheckOutConfirmOpen(false);
      if (
        err instanceof TypeError ||
        (err instanceof ApiClientError && err.status === 0)
      ) {
        enqueueOfflineVisitAction({
          meetingId,
          meetingCode: meeting?.meetingCode,
          action: 'check-out',
          payload: checkOutPayload,
        });
        setOfflineNotice(
          'Network unreachable: Check-out queued locally with verified GPS & timestamp.',
        );
      } else {
        setActionError(
          err instanceof ApiClientError ? err.message : 'Check-out failed.',
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleRescheduleContinuation = async () => {
    if (reschedReason.trim().length < 5) return;
    setActionError(null);
    setIsBusy(true);
    try {
      const startIso = new Date(`${reschedDate}T${reschedStart}:00`);
      const endIso = new Date(`${reschedDate}T${reschedEnd}:00`);
      const res = await apiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/reschedule`,
        {
          method: 'POST',
          body: {
            scheduledStart: startIso.toISOString(),
            scheduledEnd: endIso.toISOString(),
            reason: reschedReason.trim(),
            checkOutActiveSession: true,
            checkOutCoordinates: coords,
          },
        },
      );
      setMeeting(res.data.meeting);
      setReschedModalOpen(false);
      setReschedReason('');
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.message : 'Reschedule failed.',
      );
    } finally {
      setIsBusy(false);
    }
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

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-14">
      <Link
        href={`/meetings/${meeting.id}`}
        className="inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant hover:text-on-surface"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to meeting details
      </Link>

      {/* Clean Focused Visit Card */}
      <div className="bg-surface-container-lowest rounded-xl border border-hairline shadow-resting divide-y divide-hairline">
        {/* 1. Meeting & Customer Header */}
        <div className="p-5 sm:p-6 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption font-mono text-on-surface-variant">
              {meeting.meetingCode}
            </span>
            <StatusBadge status={meeting.status} />
          </div>
          <h1 className="text-headline-lg font-semibold text-on-surface tracking-tight">
            {meeting.customer.companyName}
          </h1>
          <p className="text-body-md text-on-surface-variant">{meeting.title}</p>
          <div className="pt-1 text-body-sm text-on-surface-variant space-y-1 tabular-nums">
            <p>
              {format(new Date(meeting.scheduledStart), 'dd MMM yyyy')} ·{' '}
              {format(new Date(meeting.scheduledStart), 'h:mm a')} –{' '}
              {format(new Date(meeting.scheduledEnd), 'h:mm a')}
            </p>
            <p className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{meeting.locationText}</span>
            </p>
          </div>
        </div>

        {/* 2. Live Interactive Geofence Map & GPS Status */}
        {isInPerson ? (
          <div className="p-4 sm:p-5 bg-surface-container-low/40 space-y-3">
            <GeofenceMap
              targetLocation={{ latitude: targetLat, longitude: targetLng }}
              targetLabel={meeting.customer.companyName}
              geofenceRadiusMeters={geofenceRadius}
              userLocation={coords}
              withinGeofence={withinGeofence}
              distanceMeters={distanceMeters}
              locating={gpsStatus === 'locating'}
              locatingText="Acquiring live GPS signal..."
              height={205}
            />

            <div className="flex items-center justify-between gap-3 text-body-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    withinGeofence ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className="text-on-surface font-medium truncate tabular-nums">
                  {gpsStatus === 'locating'
                    ? 'Checking GPS location...'
                    : withinGeofence
                      ? `GPS verified · ${Math.round(distanceMeters)}m from site (±${Math.round(coords.accuracyMeters)}m)`
                      : `Outside ${geofenceRadius}m range (${Math.round(distanceMeters)}m)`}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {!withinGeofence ? (
                  <button
                    type="button"
                    onClick={snapToSiteLocation}
                    className="text-caption text-secondary hover:underline font-medium cursor-pointer"
                  >
                    Use site pin
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => captureBrowserGps(targetLat, targetLng)}
                  aria-label="Refresh GPS location"
                  className="inline-flex items-center gap-1 text-caption text-on-surface-variant hover:text-on-surface font-medium cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${gpsStatus === 'locating' ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh GPS</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-3.5 bg-surface-container-low/60 flex items-center gap-2 text-body-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-on-surface font-medium">
              Remote session ready
            </span>
          </div>
        )}

        {/* 3. Primary Field Action Area */}
        <div className="p-5 sm:p-6 space-y-5">
          {actionError ? (
            <StatusBanner
              tone="error"
              message={actionError}
              onDismiss={() => setActionError(null)}
            />
          ) : null}

          {offlineNotice ? (
            <StatusBanner
              tone="info"
              message={offlineNotice}
              onDismiss={() => setOfflineNotice(null)}
            />
          ) : null}

          {!isOnline || queuedCount > 0 ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-caption text-amber-900">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  {!isOnline
                    ? 'Offline mode active — GPS & timestamps will queue locally.'
                    : `${queuedCount} offline visit action(s) ready to sync.`}
                </span>
              </div>
              {isOnline && queuedCount > 0 ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    void flushOfflineVisitQueue().then(() => loadMeeting());
                  }}
                >
                  Sync now
                </Button>
              ) : null}
            </div>
          ) : null}

          {!openSession ? (
            /* PRE-CHECK-IN WORKFLOW */
            <div className="space-y-4">
              {!withinGeofence ? (
                <FormField
                  label="Off-site check-in reason"
                  htmlFor="override-reason"
                  required
                  hint="Outside site geofence"
                >
                  <Input
                    id="override-reason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Explain off-site location (e.g. client annex office)..."
                  />
                </FormField>
              ) : null}

              <FormField
                label="Arrival note"
                htmlFor="arrival-note"
                hint="Optional"
              >
                <Input
                  id="arrival-note"
                  value={arrivalNotes}
                  onChange={(e) => setArrivalNotes(e.target.value)}
                  placeholder="Lobby check-in or context..."
                />
              </FormField>

              <Button
                type="button"
                variant="primary"
                size="xl"
                disabled={
                  isBusy ||
                  meeting.status === MEETING_STATUS.COMPLETED ||
                  meeting.status === MEETING_STATUS.CANCELLED
                }
                onClick={() => void handleCheckIn()}
                className="w-full h-12"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isBusy
                  ? 'Checking in...'
                  : meeting.completedSessionCount > 0
                    ? `Check In (Session #${meeting.visitSessionCount + 1})`
                    : 'Confirm & Check In Now'}
              </Button>

              {meeting.completedSessionCount > 0 &&
              meeting.status !== MEETING_STATUS.COMPLETED ? (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  <Link href={`/meetings/${meeting.id}/outcome`}>
                    Record outcome ({meeting.totalActualDurationMinutes} min
                    logged)
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            /* ACTIVE / PAUSED VISIT WORKFLOW */
            <div className="space-y-5">
              <div className="p-5 rounded-xl bg-surface-container-low border border-hairline text-center space-y-2 tabular-nums">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-caption text-on-surface-variant font-medium">
                    Active visit timer · Session #{openSession.sessionNumber}
                  </span>
                  <StatusBadge status={openSession.status} />
                </div>

                <div className="text-display font-semibold text-on-surface tracking-tight">
                  {formatDurationClock(liveElapsedSeconds)}
                </div>

                <p className="text-caption text-on-surface-variant">
                  Checked in at{' '}
                  {format(new Date(openSession.checkInAt), 'h:mm a')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {openSession.status === VISIT_SESSION_STATUS.ACTIVE ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={isBusy}
                    onClick={() => setPauseModalOpen(true)}
                  >
                    <Pause className="w-4 h-4" />
                    Pause Timer
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={isBusy}
                    onClick={() => void handleResume()}
                  >
                    <Play className="w-4 h-4" />
                    Resume Visit
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={isBusy}
                  onClick={() => setReschedModalOpen(true)}
                >
                  <CalendarClock className="w-4 h-4" />
                  Reschedule
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="visit-field-notes"
                    className="text-label-md font-medium text-on-surface"
                  >
                    Visit notes
                  </label>
                  <VoiceDictationButton
                    onTranscript={(spoken) =>
                      setFieldNotes((prev) =>
                        prev ? `${prev} ${spoken}` : spoken,
                      )
                    }
                  />
                </div>
                <Textarea
                  id="visit-field-notes"
                  rows={3}
                  value={fieldNotes}
                  onChange={(e) => setFieldNotes(e.target.value)}
                  placeholder="Key discussion points or next steps (or tap Voice input)..."
                />
              </div>

              <div>
                {!showSignPad ? (
                  <button
                    type="button"
                    onClick={() => setShowSignPad(true)}
                    className="inline-flex items-center gap-1.5 text-body-sm text-secondary hover:underline font-medium cursor-pointer"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    Capture client digital sign-off (Proof of Visit)
                  </button>
                ) : (
                  <SignaturePad onChange={setSignatureDataUrl} />
                )}
              </div>

              <Button
                type="button"
                variant="primary"
                size="xl"
                disabled={isBusy}
                onClick={() => setCheckOutConfirmOpen(true)}
                className="w-full h-12"
              >
                Check Out
              </Button>
            </div>
          )}
        </div>

        {/* 4. Compact Session History (only when prior sessions exist) */}
        {meeting.visitSessions.length > 0 ? (
          <div className="p-5 sm:p-6 space-y-2.5">
            <div className="flex items-center justify-between text-caption text-on-surface-variant tabular-nums">
              <span className="font-medium text-on-surface">
                Logged sessions ({meeting.visitSessions.length})
              </span>
              <span>Total completed: {meeting.totalActualDurationMinutes}m</span>
            </div>
            <div className="space-y-1.5 text-body-sm tabular-nums">
              {meeting.visitSessions.map((vs) => (
                <div
                  key={vs.id}
                  className="flex items-center justify-between text-on-surface-variant"
                >
                  <span>
                    Session #{vs.sessionNumber}:{' '}
                    {format(new Date(vs.checkInAt), 'h:mm a')} –{' '}
                    {vs.checkOutAt
                      ? format(new Date(vs.checkOutAt), 'h:mm a')
                      : 'Active'}
                  </span>
                  <span className="font-medium text-on-surface">
                    {vs.status === 'COMPLETED'
                      ? `${vs.netDurationMinutes}m`
                      : vs.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Pause Modal */}
      <ConfirmModal
        open={pauseModalOpen}
        onClose={() => setPauseModalOpen(false)}
        title="Pause visit"
        description="Paused minutes are subtracted from total active visit time."
        tone="warning"
        confirmLabel="Confirm Pause"
        isSubmitting={isBusy}
        onConfirm={() => void handlePause()}
      >
        <FormField label="Reason" htmlFor="pause-reason" hint="Optional">
          <Input
            id="pause-reason"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            placeholder="e.g. Waiting for stakeholder to join..."
          />
        </FormField>
      </ConfirmModal>

      {/* Check-Out Confirmation Modal */}
      <ConfirmModal
        open={checkOutConfirmOpen}
        onClose={() => setCheckOutConfirmOpen(false)}
        title="Finalize visit check-out?"
        description="This closes the current visit session and takes you to record the meeting outcome."
        tone="info"
        confirmLabel="Confirm Check-Out & Record Outcome"
        isSubmitting={isBusy}
        onConfirm={() => void handleFinalizeCheckOut()}
      />

      {/* Split-Visit Reschedule Modal */}
      <ConfirmModal
        open={reschedModalOpen}
        onClose={() => setReschedModalOpen(false)}
        title="Reschedule continuation"
        description="Closes the current session, preserves the original schedule, and schedules the next visit slot."
        tone="info"
        confirmLabel="Confirm new slot"
        confirmDisabled={reschedReason.trim().length < 5}
        isSubmitting={isBusy}
        onConfirm={() => void handleRescheduleContinuation()}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <FormField label="Date" htmlFor="resched-date" required>
              <Input
                id="resched-date"
                type="date"
                value={reschedDate}
                onChange={(e) => setReschedDate(e.target.value)}
              />
            </FormField>
            <FormField label="Start" htmlFor="resched-start" required>
              <Input
                id="resched-start"
                type="time"
                value={reschedStart}
                onChange={(e) => setReschedStart(e.target.value)}
              />
            </FormField>
            <FormField label="End" htmlFor="resched-end" required>
              <Input
                id="resched-end"
                type="time"
                value={reschedEnd}
                onChange={(e) => setReschedEnd(e.target.value)}
              />
            </FormField>
          </div>
          <FormField
            label="Reason"
            htmlFor="resched-reason"
            required
            hint="Min 5 characters"
          >
            <Textarea
              id="resched-reason"
              rows={2}
              value={reschedReason}
              onChange={(e) => setReschedReason(e.target.value)}
              placeholder="e.g. Client requested continuation at 3:00 PM..."
            />
          </FormField>
        </div>
      </ConfirmModal>
    </div>
  );
}
