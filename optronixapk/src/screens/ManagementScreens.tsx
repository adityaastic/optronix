import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMobileAuth } from '../context/AuthContext';
import { mobileApiFetch, MobileApiError } from '../lib/api';
import {
  MEETING_STATUS,
  PERMISSIONS,
  ROLE_CODES,
  formatDateTimeShort,
  optionalPhoneSchema,
  passwordPolicySchema,
} from '../lib/domain';
import {
  BannerAlert,
  CardSurface,
  ChipGroup,
  EmptyBlock,
  FormInput,
  KpiTile,
  PageHeaderBar,
  PrimaryButton,
  SheetModal,
  StatusPill,
} from '../components/ui';
import { MobileGeofenceMap } from '../components/MobileGeofenceMap';
import { COLORS, SPACING } from '../theme/tokens';

/* =========================================================
 * 1. SALES MANAGER — TEAM ACTIVITY & REOPEN GOVERNANCE
 * ========================================================= */
interface TeamActivityDto {
  kpis: {
    teamTotalMeetings: number;
    activeVisitsNow: number;
    teamCompletionRate: number;
    overdueTeamFollowUps: number;
  };
  repExecution: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    territory: string;
    totalMeetings: number;
    completedMeetings: number;
    openFollowUps: number;
    completionRate: number;
  }>;
  liveMonitoring: Array<{
    id: string;
    meetingCode: string;
    title: string;
    status: string;
    scheduledStart: string;
    totalActualDurationMinutes: number;
    visitSessionCount: number;
    customer: { companyName: string } | null;
    assignedRep: { fullName: string } | null;
  }>;
}

interface LiveRadarRepMobile {
  repId: string;
  employeeCode: string;
  fullName: string;
  territory: string;
  presenceStatus: 'ON_SITE' | 'LIVE_DUTY' | 'LAST_SEEN';
  coordinates: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    updatedAt: string;
  };
  activeVisit: {
    customerName: string;
    sessionNumber: number;
    checkInAt: string;
  } | null;
  nextMeeting: {
    customerName: string;
    distanceMeters: number | null;
  } | null;
  todayStats: {
    distanceTraveledKm: number;
  };
}

export function TeamActivityScreen({
  onOpenMeeting,
}: {
  onOpenMeeting: (id: string) => void;
}) {
  const { hasPermission } = useMobileAuth();
  const [data, setData] = useState<TeamActivityDto | null>(null);
  const [radarReps, setRadarReps] = useState<LiveRadarRepMobile[]>([]);
  const [teamTab, setTeamTab] = useState<'overview' | 'radar'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [reopenTarget, setReopenTarget] = useState<
    TeamActivityDto['liveMonitoring'][number] | null
  >(null);
  const [reopenReason, setReopenReason] = useState(
    'Customer requested scope amendment',
  );
  const [reopenNotes, setReopenNotes] = useState('');
  const [reopening, setReopening] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, radarRes] = await Promise.all([
        mobileApiFetch<TeamActivityDto>('/manager/team-activity'),
        mobileApiFetch<{ reps: LiveRadarRepMobile[] }>('/tracking/live-team'),
      ]);
      setData(res.data);
      setRadarReps(radarRes.data.reps);
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Unable to load team activity.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const handleConfirmReopen = async () => {
    if (!reopenTarget || reopenReason.trim().length < 5) return;
    setReopening(true);
    try {
      await mobileApiFetch(`/meetings/${reopenTarget.id}/reopen`, {
        method: 'POST',
        body: {
          reason: reopenReason.trim(),
          explanation: reopenNotes.trim() || undefined,
          notifyAssignedRep: true,
        },
      });
      const code = reopenTarget.meetingCode;
      setReopenTarget(null);
      setReopenNotes('');
      setBanner(`Meeting ${code} reopened and logged in AuditLog.`);
      await loadTeam();
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Reopen failed.');
    } finally {
      setReopening(false);
    }
  };

  if (loading && !data) {
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
    >
      <PageHeaderBar
        title="Team activity"
        subtitle="Employee performance, active visits, and meeting governance."
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

      {data ? (
        <>
          <View style={styles.kpiGrid}>
            <KpiTile label="Team meetings" value={data.kpis.teamTotalMeetings} />
            <KpiTile
              label="Active visits"
              value={data.kpis.activeVisitsNow}
              tone="blue"
              badgeText="Live"
            />
            <KpiTile
              label="Completion"
              value={`${data.kpis.teamCompletionRate}%`}
              tone="success"
            />
            <KpiTile
              label="Overdue tasks"
              value={data.kpis.overdueTeamFollowUps}
              tone={data.kpis.overdueTeamFollowUps > 0 ? 'danger' : 'neutral'}
            />
          </View>

          <ChipGroup
            options={[
              { label: 'Performance & meetings', value: 'overview' },
              {
                label: `Live Field Radar (${radarReps.length})`,
                value: 'radar',
              },
            ]}
            value={teamTab}
            onChange={setTeamTab}
          />

          {teamTab === 'radar' ? (
            <View style={{ gap: 12 }}>
              {radarReps.map((rep) => (
                <CardSurface key={rep.repId} style={{ gap: 10 }}>
                  <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowHeading}>{rep.fullName}</Text>
                      <Text style={styles.rowMeta}>
                        {rep.employeeCode} · {rep.territory} ·{' '}
                        {rep.todayStats.distanceTraveledKm} km today
                      </Text>
                    </View>
                    <StatusPill
                      status={rep.presenceStatus}
                      labelOverride={
                        rep.presenceStatus === 'ON_SITE'
                          ? 'Checked-In @ Site'
                          : rep.presenceStatus === 'LIVE_DUTY'
                            ? 'On-Duty GPS'
                            : 'Last Known'
                      }
                      toneOverride={
                        rep.presenceStatus === 'ON_SITE'
                          ? 'success'
                          : rep.presenceStatus === 'LIVE_DUTY'
                            ? 'blue'
                            : 'neutral'
                      }
                    />
                  </View>
                  {rep.activeVisit ? (
                    <Text style={styles.rowMeta}>
                      Active visit: {rep.activeVisit.customerName} (Session #
                      {rep.activeVisit.sessionNumber})
                    </Text>
                  ) : rep.nextMeeting ? (
                    <Text style={styles.rowMeta}>
                      Next stop: {rep.nextMeeting.customerName}
                      {rep.nextMeeting.distanceMeters !== null
                        ? ` (${(rep.nextMeeting.distanceMeters / 1000).toFixed(1)} km)`
                        : ''}
                    </Text>
                  ) : null}
                  <MobileGeofenceMap
                    latitude={rep.coordinates.latitude}
                    longitude={rep.coordinates.longitude}
                    geofenceRadiusMeters={100}
                    withinGeofence={rep.presenceStatus === 'ON_SITE'}
                    height={150}
                  />
                </CardSurface>
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Employee performance</Text>
          <CardSurface padded={false}>
            {data.repExecution.map((rep, idx) => (
              <View
                key={rep.id}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowHeading}>{rep.fullName}</Text>
                  <Text style={styles.rowMeta}>
                    {rep.employeeCode} · {rep.territory}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowHeading}>{rep.completionRate}%</Text>
                  <Text style={styles.rowMeta}>
                    {rep.completedMeetings}/{rep.totalMeetings} mtgs
                  </Text>
                </View>
              </View>
            ))}
          </CardSurface>

          <Text style={styles.sectionTitle}>Meeting progress</Text>
          <CardSurface padded={false}>
            {data.liveMonitoring.map((m, idx) => (
              <Pressable
                key={m.id}
                onPress={() => onOpenMeeting(m.id)}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowHeading}>
                      {m.customer?.companyName ?? m.title}
                    </Text>
                    <StatusPill status={m.status} />
                  </View>
                  <Text style={styles.rowMeta}>
                    {m.meetingCode} · {m.assignedRep?.fullName ?? 'Rep'} ·{' '}
                    {m.totalActualDurationMinutes}m ({m.visitSessionCount} sess.)
                  </Text>
                </View>

                {m.status === MEETING_STATUS.COMPLETED &&
                hasPermission(PERMISSIONS.MEETINGS_REOPEN) ? (
                  <PrimaryButton
                    label="Reopen"
                    size="sm"
                    variant="outline"
                    onPress={() => setReopenTarget(m)}
                  />
                ) : null}
              </Pressable>
            ))}
          </CardSurface>
            </>
          )}
        </>
      ) : null}

      <SheetModal
        visible={Boolean(reopenTarget)}
        onClose={() => setReopenTarget(null)}
        title="Reopen completed meeting"
        subtitle="Unlocks the completed meeting for edits and records an immutable audit event."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setReopenTarget(null)}
            />
            <PrimaryButton
              label="Confirm & reopen"
              variant="danger"
              style={{ flex: 1 }}
              disabled={reopenReason.trim().length < 5}
              loading={reopening}
              onPress={() => void handleConfirmReopen()}
            />
          </View>
        }
      >
        <FormInput
          label="Mandatory reopen reason"
          required
          value={reopenReason}
          onChangeText={setReopenReason}
        />
        <FormInput
          label="Notes"
          hint="Optional"
          multiline
          value={reopenNotes}
          onChangeText={setReopenNotes}
        />
      </SheetModal>
    </ScrollView>
  );
}

/* =========================================================
 * 2. REPORTS & ANALYTICS
 * ========================================================= */
interface ReportsDto {
  kpis: {
    totalMeetings: number;
    completedMeetings: number;
    completionRatePercent: number;
    avgVisitDurationMinutes: number;
    followUpCompletionRatePercent: number;
  };
  outcomeAnalysis: Array<{
    outcomeType: string;
    count: number;
    percentage: number;
  }>;
  visitAnalytics: {
    totalSessions: number;
    geofenceComplianceRatePercent: number;
    multiSessionMeetingsCount: number;
  };
  employeePerformance: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    totalMeetings: number;
    completedMeetings: number;
    avgDurationMinutes: number;
    completionSlaPercent: number;
  }>;
}

export function ReportsScreen() {
  const [data, setData] = useState<ReportsDto | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (fromDate && toDate && toDate < fromDate) {
      setError('End date must be on or after start date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await mobileApiFetch<ReportsDto>('/reports/analytics', {
        query: {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
      });
      setData(res.data);
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Unable to load reports.',
      );
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
    >
      <PageHeaderBar
        title="Reports"
        subtitle="Meeting completion, visit durations, and outcomes."
        rightAction={
          <PrimaryButton
            label="Refresh"
            size="sm"
            variant="outline"
            icon="refresh-cw"
            onPress={() => void loadReports()}
          />
        }
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <FormInput
          label="From (YYYY-MM-DD)"
          style={{ flex: 1 }}
          placeholder="2026-01-01"
          value={fromDate}
          onChangeText={setFromDate}
        />
        <FormInput
          label="To (YYYY-MM-DD)"
          style={{ flex: 1 }}
          placeholder="2026-12-31"
          value={toDate}
          onChangeText={setToDate}
        />
      </View>

      {error ? (
        <BannerAlert
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {loading && !data ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : data ? (
        <>
          <View style={styles.kpiGrid}>
            <KpiTile
              label="Total meetings"
              value={data.kpis.totalMeetings}
              badgeText={`${data.visitAnalytics.geofenceComplianceRatePercent}% GPS`}
              tone="success"
            />
            <KpiTile
              label="Completion rate"
              value={`${data.kpis.completionRatePercent}%`}
              tone="success"
            />
            <KpiTile
              label="Avg. visit"
              value={`${data.kpis.avgVisitDurationMinutes}m`}
              badgeText={`${data.visitAnalytics.multiSessionMeetingsCount} split`}
              tone="blue"
            />
            <KpiTile
              label="Follow-up rate"
              value={`${data.kpis.followUpCompletionRatePercent}%`}
            />
          </View>

          <CardSurface style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Meeting outcomes</Text>
            {data.outcomeAnalysis.length === 0 ? (
              <Text style={styles.rowMeta}>No outcomes recorded yet.</Text>
            ) : (
              data.outcomeAnalysis.map((o) => (
                <View key={o.outcomeType} style={{ gap: 4 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowHeading}>
                      {o.outcomeType.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {o.count} ({o.percentage}%)
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.min(100, o.percentage)}%` },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}
          </CardSurface>

          <Text style={styles.sectionTitle}>Employee breakdown</Text>
          <CardSurface padded={false}>
            {data.employeePerformance.map((emp, idx) => (
              <View
                key={emp.id}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowHeading}>{emp.fullName}</Text>
                  <Text style={styles.rowMeta}>
                    {emp.employeeCode} · Avg {emp.avgDurationMinutes}m visit
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowHeading}>
                    {emp.completionSlaPercent}%
                  </Text>
                  <Text style={styles.rowMeta}>
                    {emp.completedMeetings}/{emp.totalMeetings} closed
                  </Text>
                </View>
              </View>
            ))}
          </CardSurface>
        </>
      ) : null}
    </ScrollView>
  );
}

/* =========================================================
 * 3. ADMIN SETTINGS & INVITATION ONBOARDING
 * ========================================================= */
interface AdminUserDto {
  id: string;
  employeeCode: string;
  email: string;
  fullName: string;
  status: string;
  territory: string | null;
  role: { code: string; name: string } | null;
}

interface AuditEntryDto {
  id: string;
  auditCode: string;
  action: string;
  entityType: string;
  actorName: string;
  integrityHash: string;
  createdAt: string;
}

export function AdminSettingsScreen() {
  const { user, refreshSession } = useMobileAuth();
  const [tab, setTab] = useState<'users' | 'settings' | 'audit'>('users');
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntryDto[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Organization & SMTP Settings
  const [orgName, setOrgName] = useState('OPTRONIX Enterprise Sales');
  const [orgCurrency, setOrgCurrency] = useState<'INR' | 'USD' | 'EUR' | 'GBP'>('INR');
  const [smtpSenderEmail, setSmtpSenderEmail] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Invite User Modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invFirst, setInvFirst] = useState('');
  const [invLast, setInvLast] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<string>(ROLE_CODES.SALES_EMPLOYEE);
  const [inviting, setInviting] = useState(false);
  const [generatedInvitePath, setGeneratedInvitePath] = useState<string | null>(
    null,
  );
  const [generatedEmailStatus, setGeneratedEmailStatus] = useState<string | null>(
    null,
  );

  // Deactivate User Modal
  const [deactTarget, setDeactTarget] = useState<AdminUserDto | null>(null);
  const [deactReason, setDeactReason] = useState('');

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, aRes, sRes] = await Promise.all([
        mobileApiFetch<{ users: AdminUserDto[] }>('/admin/users?limit=40'),
        mobileApiFetch<{
          auditLogs: AuditEntryDto[];
          chainIntegrity?: { valid: boolean };
        }>('/admin/audit-logs?limit=30'),
        mobileApiFetch<{
          settings: {
            organizationName: string;
            defaultCurrency?: 'INR' | 'USD' | 'EUR' | 'GBP';
            smtpSenderEmail?: string;
          };
        }>('/admin/settings'),
      ]);
      setUsers(uRes.data.users);
      setAuditLogs(aRes.data.auditLogs);
      if (aRes.data.chainIntegrity) {
        setChainValid(aRes.data.chainIntegrity.valid);
      }
      if (sRes.data.settings) {
        setOrgName(sRes.data.settings.organizationName);
        setOrgCurrency(sRes.data.settings.defaultCurrency ?? 'INR');
        setSmtpSenderEmail(sRes.data.settings.smtpSenderEmail ?? '');
      }
    } catch (err) {
      setError(
        err instanceof MobileApiError
          ? err.message
          : 'Admin clearance required.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const handleSaveOrgSettings = async () => {
    setSavingSettings(true);
    setError(null);
    try {
      await mobileApiFetch('/admin/settings', {
        method: 'PATCH',
        body: {
          organizationName: orgName.trim() || 'OPTRONIX Enterprise Sales',
          defaultCurrency: orgCurrency,
          smtpSenderEmail: smtpSenderEmail.trim(),
        },
      });
      await refreshSession();
      setBanner('Organization, currency, and SMTP sender settings saved.');
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Save failed.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleInviteUser = async () => {
    if (!invFirst.trim() || !invLast.trim() || !invEmail.includes('@')) {
      setError('Enter first name, last name, and work email.');
      return;
    }
    setInviting(true);
    setError(null);
    try {
      const res = await mobileApiFetch<{
        invitePath: string;
        emailDelivery?: { delivered: boolean; mode: string; previewUrl?: string | null };
      }>(
        '/admin/users/invite',
        {
          method: 'POST',
          body: {
            firstName: invFirst.trim(),
            lastName: invLast.trim(),
            email: invEmail.trim().toLowerCase(),
            roleCode: invRole,
          },
        },
      );
      setInviteOpen(false);
      setInvFirst('');
      setInvLast('');
      setInvEmail('');
      setGeneratedInvitePath(res.data.invitePath);
      setGeneratedEmailStatus(
        res.data.emailDelivery?.delivered
          ? `Email sent via ${res.data.emailDelivery.mode.toUpperCase()}${res.data.emailDelivery.previewUrl ? ` (${res.data.emailDelivery.previewUrl})` : ''}`
          : 'Share the activation link below',
      );
      setBanner('Single-use onboarding invitation created.');
      await loadAdmin();
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Invite failed.');
    } finally {
      setInviting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactTarget || deactReason.trim().length < 5) return;
    try {
      await mobileApiFetch(`/admin/users/${deactTarget.id}/deactivate`, {
        method: 'POST',
        body: { reason: deactReason.trim() },
      });
      setDeactTarget(null);
      setDeactReason('');
      setBanner('User account deactivated and sessions revoked.');
      await loadAdmin();
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Deactivate failed.',
      );
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
    >
      <PageHeaderBar
        title="Admin settings"
        subtitle="Manage users, invitations, and audit logs."
        rightAction={
          <PrimaryButton
            label="Invite user"
            icon="user-plus"
            size="sm"
            onPress={() => setInviteOpen(true)}
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

      {generatedInvitePath ? (
        <CardSurface style={{ gap: 6 }}>
          <Text style={styles.sectionTitle}>Onboarding link ready</Text>
          {generatedEmailStatus ? (
            <Text style={styles.rowMeta}>{generatedEmailStatus}</Text>
          ) : null}
          <FormInput
            label="Invitation path"
            editable={false}
            value={generatedInvitePath}
          />
        </CardSurface>
      ) : null}

      <ChipGroup
        options={[
          { label: `Users (${users.length})`, value: 'users' },
          { label: 'Org & SMTP', value: 'settings' },
          {
            label: `Audit (${chainValid ? 'SHA-256 OK' : 'Alert'})`,
            value: 'audit',
          },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} />
      ) : tab === 'users' ? (
        <CardSurface padded={false}>
          {users.map((u, idx) => (
            <View
              key={u.id}
              style={[styles.row, idx > 0 && styles.rowDivider]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowHeading}>{u.fullName}</Text>
                  <StatusPill status={u.status} />
                </View>
                <Text style={styles.rowMeta}>
                  {u.email} · {u.role?.name ?? 'Role'}
                </Text>
              </View>
              {u.status === 'ACTIVE' && u.id !== user?.id ? (
                <PrimaryButton
                  label="Deactivate"
                  size="sm"
                  variant="outline"
                  onPress={() => setDeactTarget(u)}
                />
              ) : null}
            </View>
          ))}
        </CardSurface>
      ) : tab === 'settings' ? (
        <CardSurface style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>Organization &amp; Email Settings</Text>
          <FormInput
            label="Organization name"
            value={orgName}
            onChangeText={setOrgName}
          />
          <ChipGroup
            options={[
              { label: 'INR (₹)', value: 'INR' },
              { label: 'USD ($)', value: 'USD' },
              { label: 'EUR (€)', value: 'EUR' },
              { label: 'GBP (£)', value: 'GBP' },
            ]}
            value={orgCurrency}
            onChange={setOrgCurrency}
          />
          <FormInput
            label="Sender Gmail / SMTP email"
            hint="Uses App Password from .env"
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="yourname@gmail.com"
            value={smtpSenderEmail}
            onChangeText={setSmtpSenderEmail}
          />
          <PrimaryButton
            label="Save settings"
            loading={savingSettings}
            onPress={() => void handleSaveOrgSettings()}
          />
        </CardSurface>
      ) : (
        <CardSurface padded={false}>
          {auditLogs.map((log, idx) => (
            <View
              key={log.id}
              style={[styles.row, idx > 0 && styles.rowDivider]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowHeading}>{log.action}</Text>
                <Text style={styles.rowMeta}>
                  {log.actorName} · {formatDateTimeShort(log.createdAt)}
                </Text>
                <Text style={styles.rowMeta}>
                  SHA-256: {log.integrityHash.slice(0, 16)}…
                </Text>
              </View>
            </View>
          ))}
        </CardSurface>
      )}

      <SheetModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite user"
        subtitle="Creates a PENDING identity with a single-use SHA-256 onboarding token."
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setInviteOpen(false)}
            />
            <PrimaryButton
              label="Send invite"
              style={{ flex: 1 }}
              loading={inviting}
              onPress={() => void handleInviteUser()}
            />
          </View>
        }
      >
        <FormInput
          label="First name"
          required
          value={invFirst}
          onChangeText={setInvFirst}
        />
        <FormInput
          label="Last name"
          required
          value={invLast}
          onChangeText={setInvLast}
        />
        <FormInput
          label="Work email"
          required
          autoCapitalize="none"
          keyboardType="email-address"
          value={invEmail}
          onChangeText={setInvEmail}
        />
        <ChipGroup
          options={[
            { label: 'Sales Employee', value: ROLE_CODES.SALES_EMPLOYEE },
            { label: 'Sales Manager', value: ROLE_CODES.SALES_MANAGER },
            { label: 'Admin', value: ROLE_CODES.ADMIN },
          ]}
          value={invRole}
          onChange={setInvRole}
        />
      </SheetModal>

      <SheetModal
        visible={Boolean(deactTarget)}
        onClose={() => setDeactTarget(null)}
        title="Deactivate user"
        subtitle={`Revokes active sessions for ${deactTarget?.fullName ?? ''}.`}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setDeactTarget(null)}
            />
            <PrimaryButton
              label="Deactivate"
              variant="danger"
              style={{ flex: 1 }}
              disabled={deactReason.trim().length < 5}
              onPress={() => void handleDeactivate()}
            />
          </View>
        }
      >
        <FormInput
          label="Reason"
          required
          hint="Min 5 chars"
          multiline
          value={deactReason}
          onChangeText={setDeactReason}
        />
      </SheetModal>
    </ScrollView>
  );
}

/* =========================================================
 * 4. PROFILE, NOTIFICATIONS & SIGN OUT
 * ========================================================= */
interface NotificationDto {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function ProfileAndAlertsScreen() {
  const { user, logout, refreshSession } = useMobileAuth();
  const [section, setSection] = useState<'profile' | 'notifications'>(
    'profile',
  );
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await mobileApiFetch<{ notifications: NotificationDto[] }>(
        '/notifications',
      );
      setNotifications(res.data.notifications);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleSaveProfile = async () => {
    setError(null);
    const phoneCheck = optionalPhoneSchema.safeParse(phone);
    if (!phoneCheck.success) {
      setError(phoneCheck.error.issues[0]?.message ?? 'Invalid phone number.');
      return;
    }
    setSaving(true);
    try {
      await mobileApiFetch('/auth/profile', {
        method: 'PATCH',
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        },
      });
      await refreshSession();
      setBanner('Profile saved.');
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    const pwCheck = passwordPolicySchema.safeParse(newPassword);
    if (!pwCheck.success) {
      setError(pwCheck.error.issues[0]?.message ?? 'Weak password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await mobileApiFetch('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
          confirmPassword,
          invalidateRemoteSessions: true,
        },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setBanner('Password updated.');
    } catch (err) {
      setError(
        err instanceof MobileApiError ? err.message : 'Password change failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllRead = async () => {
    await mobileApiFetch('/notifications/read-all', { method: 'POST' });
    await loadNotifications();
    await refreshSession();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={styles.content}
    >
      <PageHeaderBar
        title="Account & alerts"
        subtitle={`${user?.fullName ?? ''} · ${user?.role.name ?? ''}`}
        rightAction={
          <PrimaryButton
            label="Sign out"
            size="sm"
            variant="outline"
            icon="log-out"
            onPress={() => void logout()}
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

      <ChipGroup
        options={[
          { label: 'Profile & security', value: 'profile' },
          {
            label: `Notifications (${notifications.filter((n) => !n.isRead).length})`,
            value: 'notifications',
          },
        ]}
        value={section}
        onChange={setSection}
      />

      {section === 'profile' ? (
        <>
          <CardSurface style={{ gap: 12 }}>
            <Text style={styles.sectionTitle}>Personal details</Text>
            <FormInput
              label="First name"
              required
              value={firstName}
              onChangeText={setFirstName}
            />
            <FormInput
              label="Last name"
              required
              value={lastName}
              onChangeText={setLastName}
            />
            <FormInput
              label="Phone"
              keyboardType="phone-pad"
              placeholder="+91 98100 00000"
              value={phone}
              onChangeText={setPhone}
            />
            <PrimaryButton
              label="Save profile"
              loading={saving}
              onPress={() => void handleSaveProfile()}
            />
          </CardSurface>

          <CardSurface style={{ gap: 12 }}>
            <Text style={styles.sectionTitle}>Change password</Text>
            <FormInput
              label="Current password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <FormInput
              label="New password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <FormInput
              label="Confirm new password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <PrimaryButton
              label="Update password"
              variant="outline"
              loading={saving}
              onPress={() => void handleChangePassword()}
            />
          </CardSurface>
        </>
      ) : (
        <CardSurface padded={false}>
          {notifications.length === 0 ? (
            <EmptyBlock
              icon="bell"
              title="All caught up"
              description="No notifications in your feed."
            />
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.sectionTitle}>Recent alerts</Text>
                <PrimaryButton
                  label="Mark all read"
                  size="sm"
                  variant="outline"
                  onPress={() => void handleMarkAllRead()}
                />
              </View>
              {notifications.map((n) => (
                <View key={n.id} style={[styles.row, styles.rowDivider]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.rowHeading}>{n.title}</Text>
                    <Text style={styles.rowMeta}>{n.message}</Text>
                  </View>
                  {!n.isRead ? (
                    <StatusPill status="PENDING" labelOverride="New" />
                  ) : null}
                </View>
              ))}
            </>
          )}
        </CardSurface>
      )}
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
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
  rowHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
});
