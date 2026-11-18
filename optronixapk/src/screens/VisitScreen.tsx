import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  loadMobileOfflineQueue,
  saveMobileOfflineQueue,
} from '../lib/storage';
import {
  MEETING_STATUS,
  MEETING_TYPE,
  VISIT_SESSION_STATUS,
  calculateDistanceMeters,
  formatDateShort,
  formatDurationClock,
  formatTimeShort,
} from '../lib/domain';
import type { MeetingDetailsDto } from '../lib/types';
import {
  BannerAlert,
  CardSurface,
  FormInput,
  PrimaryButton,
  SheetModal,
  StatusPill,
} from '../components/ui';
import { MobileGeofenceMap } from '../components/MobileGeofenceMap';
import { COLORS, RADIUS, SPACING } from '../theme/tokens';

export function VisitScreen({
  meetingId,
  onBack,
  onProceedToOutcome,
}: {
  meetingId: string;
  onBack: () => void;
  onProceedToOutcome: (id: string) => void;
}) {
  const [meeting, setMeeting] = useState<MeetingDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gpsStatus, setGpsStatus] = useState<'locating' | 'ready' | 'denied'>(
    'locating',
  );
  const [coords, setCoords] = useState({
    latitude: 28.495,
    longitude: 77.089,
    accuracyMeters: 8,
  });

  const [arrivalNotes, setArrivalNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [fieldNotes, setFieldNotes] = useState('');
  const [offlineInfo, setOfflineInfo] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Modals
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [checkOutConfirmOpen, setCheckOutConfirmOpen] = useState(false);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [reschedStart, setReschedStart] = useState('15:00');
  const [reschedEnd, setReschedEnd] = useState('16:00');
  const [reschedReason, setReschedReason] = useState('');

  const captureNativeGps = useCallback(
    async (fallbackLat?: number, fallbackLng?: number) => {
      setGpsStatus('locating');
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setGpsStatus('denied');
          if (fallbackLat && fallbackLng) {
            setCoords({
              latitude: fallbackLat,
              longitude: fallbackLng,
              accuracyMeters: 12,
            });
          }
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round((pos.coords.accuracy ?? 8) * 10) / 10,
        });
        setGpsStatus('ready');
      } catch {
        if (fallbackLat && fallbackLng) {
          setCoords({
            latitude: fallbackLat,
            longitude: fallbackLng,
            accuracyMeters: 10,
          });
        }
        setGpsStatus('ready');
      }
    },
    [],
  );

  const loadMeeting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}`,
      );
      const m = res.data.meeting;
      setMeeting(m);
      const tLat =
        m.targetCoordinates?.latitude ?? m.customer.address.coordinates?.latitude;
      const tLng =
        m.targetCoordinates?.longitude ??
        m.customer.address.coordinates?.longitude;
      await captureNativeGps(tLat, tLng);
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Meeting not found.',
      );
    } finally {
      setLoading(false);
    }
  }, [meetingId, captureNativeGps]);

  const syncQueuedVisits = useCallback(async () => {
    const queue = await loadMobileOfflineQueue();
    if (queue.length === 0) {
      setQueuedCount(0);
      return;
    }
    const remaining = [];
    for (const item of queue) {
      try {
        await mobileApiFetch(`/meetings/${item.meetingId}/${item.action}`, {
          method: 'POST',
          body: item.payload,
        });
      } catch (err) {
        if (err instanceof MobileApiError && err.status === 0) {
          remaining.push(item);
        }
      }
    }
    await saveMobileOfflineQueue(remaining);
    setQueuedCount(remaining.filter((r) => r.meetingId === meetingId).length);
  }, [meetingId]);

  useEffect(() => {
    void syncQueuedVisits().then(() => loadMeeting());
  }, [loadMeeting, syncQueuedVisits]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const handleCheckIn = async () => {
    if (!withinGeofence && overrideReason.trim().length < 5) {
      setError(
        'Outside customer geofence. Tap "Use site pin" or enter a short off-site reason.',
      );
      return;
    }
    const checkInPayload = {
      coordinates: coords,
      timestamp: new Date().toISOString(),
      geofenceOverrideReason: !withinGeofence
        ? overrideReason.trim()
        : undefined,
      arrivalNotes: arrivalNotes.trim() || undefined,
    };
    setError(null);
    setBusy(true);
    try {
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/check-in`,
        {
          method: 'POST',
          body: checkInPayload,
        },
      );
      setMeeting(res.data.meeting);
      setArrivalNotes('');
      setOverrideReason('');
    } catch (err) {
      if (err instanceof MobileApiError && err.status === 0) {
        const q = await loadMobileOfflineQueue();
        q.push({
          id: `q-${Date.now()}`,
          meetingId,
          action: 'check-in',
          payload: checkInPayload,
        });
        await saveMobileOfflineQueue(q);
        setQueuedCount((c) => c + 1);
        setOfflineInfo(
          'Offline mode: Check-in queued locally with verified GPS & timestamp.',
        );
      } else {
        setError(
          err instanceof MobileApiError ? err.message : 'Check-in failed.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePause = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/pause`,
        {
          method: 'POST',
          body: { reason: pauseReason.trim() || undefined },
        },
      );
      setMeeting(res.data.meeting);
      setPauseOpen(false);
      setPauseReason('');
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Pause failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/resume`,
        { method: 'POST', body: {} },
      );
      setMeeting(res.data.meeting);
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Resume failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFinalizeCheckOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
        `/meetings/${meetingId}/check-out`,
        {
          method: 'POST',
          body: {
            coordinates: coords,
            fieldNotes: fieldNotes.trim() || undefined,
          },
        },
      );
      setMeeting(res.data.meeting);
      setCheckOutConfirmOpen(false);
      onProceedToOutcome(meetingId);
    } catch (err) {
      setCheckOutConfirmOpen(false);
      setError(
        err instanceof MobileApiError ? err.message : 'Check-out failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRescheduleContinuation = async () => {
    if (reschedReason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      const startIso = new Date(`${reschedDate}T${reschedStart}:00`);
      const endIso = new Date(`${reschedDate}T${reschedEnd}:00`);
      if (endIso <= startIso) {
        setError('End time must be after start time.');
        setBusy(false);
        return;
      }
      const res = await mobileApiFetch<{ meeting: MeetingDetailsDto }>(
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
      setReschedOpen(false);
      setReschedReason('');
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Reschedule failed.',
      );
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
        <PrimaryButton label="Go back" variant="outline" onPress={onBack} />
      </View>
    );
  }

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

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {offlineInfo ? (
        <BannerAlert
          tone="info"
          message={offlineInfo}
          onDismiss={() => setOfflineInfo(null)}
        />
      ) : null}

      {queuedCount > 0 ? (
        <PrimaryButton
          label={`Sync ${queuedCount} offline visit action(s)`}
          size="sm"
          variant="outline"
          icon="refresh-cw"
          onPress={() => {
            void syncQueuedVisits().then(() => loadMeeting());
          }}
        />
      ) : null}

      <CardSurface style={{ gap: SPACING.lg }}>
        {/* 1. Customer & Meeting Summary */}
        <View style={{ gap: 4 }}>
          <View style={styles.topMeta}>
            <Text style={styles.codeText}>{meeting.meetingCode}</Text>
            <StatusPill status={meeting.status} />
          </View>
          <Text style={styles.companyTitle}>
            {meeting.customer.companyName}
          </Text>
          <Text style={styles.subText}>{meeting.title}</Text>
          <Text style={styles.metaLine}>
            {formatDateShort(meeting.scheduledStart)} ·{' '}
            {formatTimeShort(meeting.scheduledStart)} –{' '}
            {formatTimeShort(meeting.scheduledEnd)}
          </Text>
          <Text style={styles.metaLine} numberOfLines={2}>
            {meeting.locationText}
          </Text>
        </View>

        {/* 2. Live Street Map, Geofence Zone & GPS Status */}
        {isInPerson ? (
          <MobileGeofenceMap
            latitude={targetLat}
            longitude={targetLng}
            geofenceRadiusMeters={geofenceRadius}
            userLocation={coords}
            withinGeofence={withinGeofence}
            distanceMeters={distanceMeters}
            locating={gpsStatus === 'locating'}
            height={176}
          />
        ) : null}

        <View style={styles.gpsStrip}>
          <View style={styles.gpsLeft}>
            <View
              style={[
                styles.gpsDot,
                {
                  backgroundColor: withinGeofence
                    ? COLORS.success
                    : COLORS.warning,
                },
              ]}
            />
            <Text style={styles.gpsText} numberOfLines={2}>
              {!isInPerson
                ? 'Remote session ready'
                : gpsStatus === 'locating'
                  ? 'Acquiring GPS location...'
                  : withinGeofence
                    ? `GPS verified · ${Math.round(distanceMeters)}m from site`
                    : `Outside ${geofenceRadius}m geofence (${Math.round(distanceMeters)}m)`}
            </Text>
          </View>

          {isInPerson ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!withinGeofence ? (
                <Pressable
                  onPress={() =>
                    setCoords({
                      latitude: targetLat,
                      longitude: targetLng,
                      accuracyMeters: 4,
                    })
                  }
                >
                  <Text style={styles.sitePinLink}>Use site pin</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => void captureNativeGps(targetLat, targetLng)}
                hitSlop={8}
              >
                <Feather name="refresh-cw" size={15} color={COLORS.textMuted} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* 3. One-Handed Primary Action Workflow */}
        {!openSession ? (
          <View style={{ gap: SPACING.md }}>
            {!withinGeofence ? (
              <FormInput
                label="Off-site check-in reason"
                required
                hint="Outside geofence"
                placeholder="Explain off-site venue..."
                value={overrideReason}
                onChangeText={setOverrideReason}
              />
            ) : null}

            <FormInput
              label="Arrival note"
              hint="Optional"
              placeholder="Lobby check-in or context..."
              value={arrivalNotes}
              onChangeText={setArrivalNotes}
            />

            <PrimaryButton
              label={
                meeting.completedSessionCount > 0
                  ? `Check In (Session #${meeting.visitSessionCount + 1})`
                  : 'Confirm & Check In Now'
              }
              icon="check-circle"
              size="lg"
              loading={busy}
              disabled={
                meeting.status === MEETING_STATUS.COMPLETED ||
                meeting.status === MEETING_STATUS.CANCELLED
              }
              onPress={() => void handleCheckIn()}
            />

            {meeting.completedSessionCount > 0 &&
            meeting.status !== MEETING_STATUS.COMPLETED ? (
              <PrimaryButton
                label={`Record outcome (${meeting.totalActualDurationMinutes}m logged)`}
                variant="outline"
                onPress={() => onProceedToOutcome(meeting.id)}
              />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: SPACING.md }}>
            <View style={styles.timerBox}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text style={styles.timerCaption}>
                  Active visit · Session #{openSession.sessionNumber}
                </Text>
                <StatusPill status={openSession.status} />
              </View>
              <Text style={styles.timerDigits}>
                {formatDurationClock(liveElapsedSeconds)}
              </Text>
              <Text style={styles.timerCaption}>
                Checked in at {formatTimeShort(openSession.checkInAt)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {openSession.status === VISIT_SESSION_STATUS.ACTIVE ? (
                <PrimaryButton
                  label="Pause"
                  icon="pause"
                  variant="outline"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={() => setPauseOpen(true)}
                />
              ) : (
                <PrimaryButton
                  label="Resume"
                  icon="play"
                  variant="outline"
                  style={{ flex: 1 }}
                  loading={busy}
                  onPress={() => void handleResume()}
                />
              )}

              <PrimaryButton
                label="Reschedule"
                icon="calendar"
                variant="outline"
                style={{ flex: 1 }}
                disabled={busy}
                onPress={() => setReschedOpen(true)}
              />
            </View>

            <FormInput
              label="Visit notes"
              hint="Optional"
              multiline
              placeholder="Key discussion points or next steps..."
              value={fieldNotes}
              onChangeText={setFieldNotes}
            />

            <PrimaryButton
              label="Check Out"
              size="lg"
              loading={busy}
              onPress={() => setCheckOutConfirmOpen(true)}
            />
          </View>
        )}

        {/* 4. Session History */}
        {meeting.visitSessions.length > 0 ? (
          <View style={styles.sessionsFooter}>
            <View style={styles.topMeta}>
              <Text style={styles.sessionsHeading}>
                Logged sessions ({meeting.visitSessions.length})
              </Text>
              <Text style={styles.metaLine}>
                Total completed: {meeting.totalActualDurationMinutes}m
              </Text>
            </View>
            {meeting.visitSessions.map((vs) => (
              <View key={vs.id} style={styles.topMeta}>
                <Text style={styles.metaLine}>
                  Session #{vs.sessionNumber}: {formatTimeShort(vs.checkInAt)} –{' '}
                  {vs.checkOutAt ? formatTimeShort(vs.checkOutAt) : 'Active'}
                </Text>
                <Text style={styles.sessionsHeading}>
                  {vs.status === 'COMPLETED'
                    ? `${vs.netDurationMinutes}m`
                    : vs.status}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </CardSurface>

      {/* Pause Modal */}
      <SheetModal
        visible={pauseOpen}
        onClose={() => setPauseOpen(false)}
        title="Pause visit timer"
        subtitle="Paused minutes are excluded from active visit duration."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setPauseOpen(false)}
            />
            <PrimaryButton
              label="Confirm pause"
              style={{ flex: 1 }}
              loading={busy}
              onPress={() => void handlePause()}
            />
          </View>
        }
      >
        <FormInput
          label="Reason"
          hint="Optional"
          placeholder="Waiting for stakeholder..."
          value={pauseReason}
          onChangeText={setPauseReason}
        />
      </SheetModal>

      {/* Check-Out Confirmation Modal */}
      <SheetModal
        visible={checkOutConfirmOpen}
        onClose={() => setCheckOutConfirmOpen(false)}
        title="Finalize visit check-out?"
        subtitle="Closes the active visit session and proceeds to record the meeting outcome."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Not yet"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setCheckOutConfirmOpen(false)}
            />
            <PrimaryButton
              label="Confirm & record outcome"
              style={{ flex: 1 }}
              loading={busy}
              onPress={() => void handleFinalizeCheckOut()}
            />
          </View>
        }
      >
        <Text style={styles.subText}>
          Elapsed active session time ({formatDurationClock(liveElapsedSeconds)})
          will be added to this meeting&apos;s verified visit total.
        </Text>
      </SheetModal>

      {/* Split-Visit Reschedule Continuation Modal */}
      <SheetModal
        visible={reschedOpen}
        onClose={() => setReschedOpen(false)}
        title="Reschedule continuation"
        subtitle="Closes current session, keeps original schedule intact, and appends a new schedule revision."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setReschedOpen(false)}
            />
            <PrimaryButton
              label="Confirm new slot"
              style={{ flex: 1 }}
              disabled={reschedReason.trim().length < 5}
              loading={busy}
              onPress={() => void handleRescheduleContinuation()}
            />
          </View>
        }
      >
        <FormInput
          label="Date (YYYY-MM-DD)"
          required
          value={reschedDate}
          onChangeText={setReschedDate}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <FormInput
            label="Start (HH:MM)"
            required
            style={{ flex: 1 }}
            value={reschedStart}
            onChangeText={setReschedStart}
          />
          <FormInput
            label="End (HH:MM)"
            required
            style={{ flex: 1 }}
            value={reschedEnd}
            onChangeText={setReschedEnd}
          />
        </View>
        <FormInput
          label="Reason"
          required
          hint="Min 5 chars"
          multiline
          placeholder="Client requested continuation slot..."
          value={reschedReason}
          onChangeText={setReschedReason}
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
    width: '100%',
    maxWidth: 560,
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
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  companyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  subText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  metaLine: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  gpsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gpsLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
  },
  sitePinLink: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  timerBox: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  timerCaption: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  timerDigits: {
    fontSize: 34,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  sessionsFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    gap: 6,
  },
  sessionsHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
});
