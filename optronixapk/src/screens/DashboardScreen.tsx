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
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  FOLLOW_UP_STATUS,
  MEETING_STATUS,
  formatDateShort,
  formatTimeShort,
} from '../lib/domain';
import type { DashboardSummaryDto } from '../lib/types';
import {
  BannerAlert,
  CardSurface,
  EmptyBlock,
  KpiTile,
  PageHeaderBar,
  PrimaryButton,
  StatusPill,
} from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme/tokens';

export function DashboardScreen({
  onOpenSchedule,
  onOpenMeeting,
  onOpenVisit,
  onNavigateTab,
}: {
  onOpenSchedule: () => void;
  onOpenMeeting: (id: string) => void;
  onOpenVisit: (id: string) => void;
  onNavigateTab: (tab: 'meetings' | 'followups') => void;
}) {
  const { user, refreshSession } = useMobileAuth();
  const [data, setData] = useState<DashboardSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Salesperson Field Duty GPS Tracking
  const [dutyActive, setDutyActive] = useState(false);
  const [todayPings, setTodayPings] = useState(0);
  const [todayKm, setTodayKm] = useState(0);
  const [pinging, setPinging] = useState(false);

  const loadTrackingMe = useCallback(async () => {
    try {
      const res = await mobileApiFetch<{
        isFieldDutyActive: boolean;
        todayPingsCount: number;
        todayDistanceKm: number;
      }>('/tracking/me');
      setDutyActive(res.data.isFieldDutyActive);
      setTodayPings(res.data.todayPingsCount);
      setTodayKm(res.data.todayDistanceKm);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await mobileApiFetch<DashboardSummaryDto>(
        '/meetings/dashboard-summary',
      );
      setData(res.data);
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Failed to load dashboard.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadTrackingMe();
  }, [loadSummary, loadTrackingMe]);

  const sendMobileGpsPing = useCallback(
    async (source: 'HEARTBEAT' | 'MANUAL' = 'MANUAL') => {
      setPinging(true);
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        let lat = 28.495;
        let lng = 77.089;
        let acc = 10;
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = Number(pos.coords.latitude.toFixed(6));
          lng = Number(pos.coords.longitude.toFixed(6));
          acc = Math.round(pos.coords.accuracy ?? 8);
        }
        await mobileApiFetch('/tracking/ping', {
          method: 'POST',
          body: { latitude: lat, longitude: lng, accuracyMeters: acc, source },
        });
        await loadTrackingMe();
      } catch {
        // Ignore transient ping errors
      } finally {
        setPinging(false);
      }
    },
    [loadTrackingMe],
  );

  const handleToggleDuty = async () => {
    const next = !dutyActive;
    setDutyActive(next);
    await mobileApiFetch('/tracking/duty', {
      method: 'POST',
      body: { active: next },
    }).catch(() => undefined);
    if (next) {
      await sendMobileGpsPing('MANUAL');
    } else {
      await loadTrackingMe();
    }
  };

  useEffect(() => {
    if (!dutyActive) return;
    const timer = setInterval(() => {
      void sendMobileGpsPing('HEARTBEAT');
    }, 35_000);
    return () => clearInterval(timer);
  }, [dutyActive, sendMobileGpsPing]);

  const handleCompleteFollowUp = async (id: string) => {
    try {
      await mobileApiFetch(`/follow-ups/${id}/complete`, { method: 'POST' });
      await loadSummary(true);
      await refreshSession();
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Unable to complete task.',
      );
    }
  };

  const openFullDayRoute = () => {
    const valid = (data?.routeStops ?? []).filter((s) => Boolean(s.coordinates));
    if (valid.length === 0) return;
    if (valid.length === 1) {
      const only = valid[0]!.coordinates!;
      void Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${only.latitude},${only.longitude}`,
      );
      return;
    }
    const first = valid[0]!.coordinates!;
    const last = valid[valid.length - 1]!.coordinates!;
    const waypoints = valid
      .slice(1, -1)
      .map((w) => `${w.coordinates!.latitude},${w.coordinates!.longitude}`)
      .join('|');
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=${first.latitude},${first.longitude}&destination=${last.latitude},${last.longitude}${
        waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''
      }`,
    );
  };

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const meetingsList = data?.todaysMeetings ?? [];
  const followUpsList = data?.pendingActionItems ?? [];
  const routeStops = data?.routeStops ?? [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadSummary(true);
            void loadTrackingMe();
          }}
        />
      }
    >
      <PageHeaderBar
        title={`Hello, ${user?.firstName ?? 'Team'}`}
        subtitle="Today's scheduled visits, live field GPS, and follow-ups."
        rightAction={
          <PrimaryButton
            label="Schedule"
            icon="plus"
            size="sm"
            onPress={onOpenSchedule}
          />
        }
      />

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {data ? (
        <>
          {/* 4 Focused KPIs */}
          <View style={styles.kpiGrid}>
            <KpiTile
              label="Total meetings"
              value={data.kpis.totalMeetings}
              badgeText={`${data.kpis.completionRatePercent}% done`}
            />
            <KpiTile
              label="Completed"
              value={data.kpis.completedMeetings}
              badgeText="Locked"
              tone="success"
            />
            <KpiTile
              label="Avg visit"
              value={`${data.kpis.avgDurationMinutes}m`}
              badgeText="Verified"
              tone="blue"
            />
            <KpiTile
              label="Open follow-ups"
              value={data.kpis.pendingFollowUps}
              badgeText={data.kpis.pendingFollowUps > 0 ? 'Active' : 'Clear'}
              tone={data.kpis.pendingFollowUps > 0 ? 'warning' : 'success'}
            />
          </View>

          {/* Live Salesperson Field Duty GPS + Today's Multi-Stop Route */}
          <CardSurface style={{ gap: 12 }}>
            <View style={styles.dutyRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.rowTop}>
                  <View
                    style={[
                      styles.dutyDot,
                      {
                        backgroundColor: dutyActive
                          ? COLORS.success
                          : COLORS.border,
                      },
                    ]}
                  />
                  <Text style={styles.rowTitle}>
                    Field Duty GPS: {dutyActive ? 'Live Active' : 'Paused'}
                  </Text>
                </View>
                <Text style={styles.metaText}>
                  {todayPings} pings today · {todayKm} km covered
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PrimaryButton
                  label="Ping"
                  size="sm"
                  variant="outline"
                  loading={pinging}
                  onPress={() => void sendMobileGpsPing('MANUAL')}
                />
                <PrimaryButton
                  label={dutyActive ? 'Pause' : 'Start Duty'}
                  size="sm"
                  variant={dutyActive ? 'outline' : 'primary'}
                  onPress={() => void handleToggleDuty()}
                />
              </View>
            </View>

            {routeStops.length > 0 ? (
              <View style={styles.routeBlock}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.routeHeading}>
                    Today&apos;s field route ({routeStops.length} stops)
                  </Text>
                  <Pressable onPress={openFullDayRoute}>
                    <Text style={styles.sectionLink}>Start route ↗</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, alignItems: 'center' }}
                >
                  {routeStops.map((stop, idx) => (
                    <Pressable
                      key={stop.id}
                      onPress={() => onOpenVisit(stop.id)}
                      style={styles.routeStopPill}
                    >
                      <Text style={styles.routeStopTitle}>
                        #{idx + 1} {stop.customerName}
                      </Text>
                      <Text style={styles.metaText}>
                        {formatTimeShort(stop.scheduledStart)}
                        {stop.legDistanceKm ? ` · +${stop.legDistanceKm}km` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </CardSurface>

          {/* Primary Focus: Today's / Upcoming Meetings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Scheduled meetings</Text>
              <Pressable onPress={() => onNavigateTab('meetings')}>
                <Text style={styles.sectionLink}>View all</Text>
              </Pressable>
            </View>

            <CardSurface padded={false}>
              {meetingsList.length === 0 ? (
                <EmptyBlock
                  icon="calendar"
                  title="No meetings scheduled"
                  description="Schedule a customer visit to start tracking check-ins and outcomes."
                  action={
                    <PrimaryButton
                      label="Schedule meeting"
                      size="sm"
                      icon="plus"
                      onPress={onOpenSchedule}
                    />
                  }
                />
              ) : (
                meetingsList.map((m, idx) => {
                  const canVisit =
                    m.status !== MEETING_STATUS.COMPLETED &&
                    m.status !== MEETING_STATUS.CANCELLED;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => onOpenMeeting(m.id)}
                      style={[
                        styles.listRow,
                        idx > 0 && styles.listRowDivider,
                      ]}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {m.customerName}
                          </Text>
                          <StatusPill status={m.status} />
                        </View>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {m.title}
                        </Text>
                        <View style={styles.metaInline}>
                          <Feather
                            name="clock"
                            size={12}
                            color={COLORS.textMuted}
                          />
                          <Text style={styles.metaText}>
                            {formatDateShort(m.scheduledStart)} ·{' '}
                            {formatTimeShort(m.scheduledStart)}
                          </Text>
                        </View>
                      </View>

                      {canVisit ? (
                        <PrimaryButton
                          label="Visit"
                          size="sm"
                          variant="accent"
                          icon="map-pin"
                          onPress={() => onOpenVisit(m.id)}
                        />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </CardSurface>
          </View>

          {/* Pending Follow-ups */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending follow-ups</Text>
              <Pressable onPress={() => onNavigateTab('followups')}>
                <Text style={styles.sectionLink}>Manage tasks</Text>
              </Pressable>
            </View>

            <CardSurface padded={false}>
              {followUpsList.length === 0 ? (
                <EmptyBlock
                  icon="check-circle"
                  title="All caught up"
                  description="No pending or overdue follow-up tasks."
                />
              ) : (
                followUpsList.map((f, idx) => {
                  const overdue = f.status === FOLLOW_UP_STATUS.OVERDUE;
                  return (
                    <View
                      key={f.id}
                      style={[
                        styles.listRow,
                        idx > 0 && styles.listRowDivider,
                      ]}
                    >
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {f.title}
                        </Text>
                        <Text style={styles.rowSub}>
                          {f.customerName} ·{' '}
                          <Text
                            style={
                              overdue
                                ? { color: COLORS.warning, fontWeight: '600' }
                                : undefined
                            }
                          >
                            Due {formatDateShort(f.dueDate)}
                            {overdue ? ' (Overdue)' : ''}
                          </Text>
                        </Text>
                      </View>
                      <PrimaryButton
                        label="Done"
                        size="sm"
                        variant="outline"
                        icon="check"
                        onPress={() => void handleCompleteFollowUp(f.id)}
                      />
                    </View>
                  );
                })
              )}
            </CardSurface>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.xl,
    paddingBottom: 36,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  dutyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dutyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeBlock: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    gap: 8,
  },
  routeHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  routeStopPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  routeStopTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: SPACING.lg,
  },
  listRowDivider: {
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
  },
  rowSub: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  metaInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
