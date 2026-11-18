'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CalendarPlus,
  CheckCircle2,
  Eye,
  KeyRound,
  LockOpen,
  MapPin,
  Navigation,
  Radio,
  Users,
} from 'lucide-react';
import { MEETING_STATUS, PERMISSIONS } from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AssignableUser } from '@/lib/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/ActionMenu';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { KpiCard } from '@/components/shared/KpiCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  TeamRadarMap,
  type LiveTeamRepPin,
  type RepBreadcrumbPoint,
} from '@/components/shared/TeamRadarMap';
import { ConfirmModal, SlideDrawer } from '@/components/shared/ConfirmModal';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface TeamActivityResponse {
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
    email: string;
    territory: string;
    department: string;
    totalMeetings: number;
    completedMeetings: number;
    openFollowUps: number;
    completionRate: number;
    lastActiveAt: string;
  }>;
  liveMonitoring: Array<{
    id: string;
    meetingCode: string;
    title: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    firstCheckInAt: string | null;
    lastCheckOutAt: string | null;
    totalActualDurationMinutes: number;
    visitSessionCount: number;
    reopenCount: number;
    customer: {
      id: string;
      companyName: string;
      customerCode: string;
      tier: string;
    } | null;
    assignedRep: {
      id: string;
      fullName: string;
      employeeCode: string;
    } | null;
    outcome: {
      outcomeType: string;
      summary: string;
    } | null;
  }>;
}

interface RepDossierDto {
  rep: {
    id: string;
    employeeCode: string;
    fullName: string;
    email: string;
    territory: string | null;
    department: string | null;
  };
  recentMeetings: Array<{
    id: string;
    meetingCode: string;
    title: string;
    customerName: string;
    status: string;
    scheduledStart: string;
    totalActualDurationMinutes: number;
  }>;
  latestTelemetry: {
    sessionNumber: number;
    status: string;
    checkInAt: string;
    coordinates: {
      latitude: number;
      longitude: number;
      withinGeofence?: boolean;
    };
  } | null;
  pendingFollowUps: Array<{
    id: string;
    taskCode: string;
    title: string;
    customerName: string;
    dueDate: string;
    priority: string;
    status: string;
  }>;
}

function TeamActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const initialReopenId = searchParams.get('reopenId');

  const [data, setData] = useState<TeamActivityResponse | null>(null);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'radar'>('table');
  const [liveRadarReps, setLiveRadarReps] = useState<
    Array<
      LiveTeamRepPin & {
        todayStats: {
          pingsCount: number;
          completedVisitsToday: number;
          distanceTraveledKm: number;
        };
      }
    >
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Employee Activity & GPS Breadcrumb Trail Drawer
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [repDossier, setRepDossier] = useState<RepDossierDto | null>(null);
  const [repTrail, setRepTrail] = useState<RepBreadcrumbPoint[]>([]);
  const [repDistanceKm, setRepDistanceKm] = useState(0);
  const [repLoading, setRepLoading] = useState(false);

  // Reopen Completed Meeting Modal
  const [reopenTarget, setReopenTarget] = useState<
    TeamActivityResponse['liveMonitoring'][number] | null
  >(null);
  const [reopenReason, setReopenReason] = useState(
    'Customer requested scope amendment',
  );
  const [reopenExplanation, setReopenExplanation] = useState('');
  const [notifyRep, setNotifyRep] = useState(true);
  const [managerPin, setManagerPin] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [isReopening, setIsReopening] = useState(false);

  // Reassign Meeting Modal
  const [reassignTarget, setReassignTarget] = useState<
    TeamActivityResponse['liveMonitoring'][number] | null
  >(null);
  const [newRepId, setNewRepId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  useEffect(() => {
    if (!hasPermission(PERMISSIONS.TEAM_READ)) {
      router.replace('/forbidden');
    }
  }, [hasPermission, router]);

  const loadTeamActivity = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [dashRes, repsRes, radarRes] = await Promise.all([
        apiFetch<TeamActivityResponse>('/manager/team-activity'),
        apiFetch<{ users: AssignableUser[] }>('/users/assignable'),
        apiFetch<{
          reps: Array<
            LiveTeamRepPin & {
              todayStats: {
                pingsCount: number;
                completedVisitsToday: number;
                distanceTraveledKm: number;
              };
            }
          >;
        }>('/tracking/live-team'),
      ]);
      setData(dashRes.data);
      setReps(repsRes.data.users);
      setLiveRadarReps(radarRes.data.reps);
      if (initialReopenId) {
        const found = dashRes.data.liveMonitoring.find(
          (m) =>
            m.id === initialReopenId && m.status === MEETING_STATUS.COMPLETED,
        );
        if (found) setReopenTarget(found);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load team activity.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [initialReopenId]);

  useEffect(() => {
    void loadTeamActivity();
  }, [loadTeamActivity]);

  useEffect(() => {
    const handleRealtime = () => {
      void Promise.all([
        apiFetch<TeamActivityResponse>('/manager/team-activity').then(
          (dashRes) => setData(dashRes.data),
        ),
        apiFetch<{
          reps: Array<
            LiveTeamRepPin & {
              todayStats: {
                pingsCount: number;
                completedVisitsToday: number;
                distanceTraveledKm: number;
              };
            }
          >;
        }>('/tracking/live-team').then((rRes) =>
          setLiveRadarReps(rRes.data.reps),
        ),
      ]).catch(() => undefined);
    };
    window.addEventListener('optronix:realtime', handleRealtime);
    return () => window.removeEventListener('optronix:realtime', handleRealtime);
  }, []);

  useEffect(() => {
    if (!selectedRepId) {
      setRepDossier(null);
      setRepTrail([]);
      setRepDistanceKm(0);
      return;
    }
    setRepLoading(true);
    void Promise.all([
      apiFetch<RepDossierDto>(`/manager/employees/${selectedRepId}`),
      apiFetch<{
        totalDistanceKm: number;
        trail: RepBreadcrumbPoint[];
      }>(`/tracking/rep/${selectedRepId}/trail`),
    ])
      .then(([dosRes, trailRes]) => {
        setRepDossier(dosRes.data);
        setRepTrail(trailRes.data.trail);
        setRepDistanceKm(trailRes.data.totalDistanceKm);
      })
      .catch(() => {
        setRepDossier(null);
        setRepTrail([]);
      })
      .finally(() => setRepLoading(false));
  }, [selectedRepId]);

  const handleConfirmReopen = async () => {
    if (!reopenTarget || reopenReason.trim().length < 5) return;
    setReopenError(null);
    setIsReopening(true);
    try {
      await apiFetch(`/meetings/${reopenTarget.id}/reopen`, {
        method: 'POST',
        body: {
          reason: reopenReason.trim(),
          explanation: reopenExplanation.trim() || undefined,
          notifyAssignedRep: notifyRep,
          managerPin: managerPin.trim() || undefined,
        },
      });
      const code = reopenTarget.meetingCode;
      setReopenTarget(null);
      setReopenExplanation('');
      setManagerPin('');
      setBannerMessage(`Meeting ${code} reopened and recorded in audit log.`);
      await loadTeamActivity();
    } catch (err) {
      setReopenError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to reopen meeting.',
      );
    } finally {
      setIsReopening(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!reassignTarget || !newRepId || reassignReason.trim().length < 3) return;
    setReassignError(null);
    setIsReassigning(true);
    try {
      await apiFetch(`/meetings/${reassignTarget.id}/reassign`, {
        method: 'POST',
        body: {
          newAssignedRepId: newRepId,
          reason: reassignReason.trim(),
        },
      });
      const code = reassignTarget.meetingCode;
      setReassignTarget(null);
      setNewRepId('');
      setReassignReason('');
      setBannerMessage(`Meeting ${code} reassigned.`);
      await loadTeamActivity();
    } catch (err) {
      setReassignError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to reassign meeting.',
      );
    } finally {
      setIsReassigning(false);
    }
  };

  if (isLoading && !data) {
    return <PageSkeleton />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message={error ?? 'No team data available.'}
        onRetry={() => void loadTeamActivity()}
      />
    );
  }

  return (
    <div className="space-y-8 pb-14">
      <PageHeader
        title="Team activity"
        description="Monitor employee performance, active visits, and meeting progress."
        actions={
          <Button asChild variant="primary">
            <Link href="/meetings/new">
              <CalendarPlus className="w-4 h-4" />
              Schedule meeting
            </Link>
          </Button>
        }
      />

      {bannerMessage ? (
        <StatusBanner
          tone="success"
          message={bannerMessage}
          onDismiss={() => setBannerMessage(null)}
        />
      ) : null}

      {/* 4 Focused KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Team meetings"
          value={data.kpis.teamTotalMeetings}
          icon={Users}
          badgeText={`${data.repExecution.length} employees`}
        />
        <KpiCard
          label="Active visits now"
          value={data.kpis.activeVisitsNow}
          icon={Activity}
          badgeTone={data.kpis.activeVisitsNow > 0 ? 'blue' : 'default'}
          badgeText={data.kpis.activeVisitsNow > 0 ? 'Checked in' : 'Idle'}
        />
        <KpiCard
          label="Completion rate"
          value={`${data.kpis.teamCompletionRate}%`}
          icon={CheckCircle2}
          badgeTone="success"
          badgeText="Completed"
        />
        <KpiCard
          label="Overdue follow-ups"
          value={data.kpis.overdueTeamFollowUps}
          icon={AlertTriangle}
          badgeTone={data.kpis.overdueTeamFollowUps > 0 ? 'danger' : 'default'}
          badgeText={
            data.kpis.overdueTeamFollowUps > 0 ? 'Needs attention' : 'On track'
          }
        />
      </div>

      {/* View Switcher: Performance Table vs Live Salesperson Field Radar */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={cn(
              'px-3.5 py-2.5 text-label-md border-b-2 -mb-px transition-colors cursor-pointer',
              viewMode === 'table'
                ? 'border-secondary text-on-surface font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            Performance &amp; meetings
          </button>
          <button
            type="button"
            onClick={() => setViewMode('radar')}
            className={cn(
              'px-3.5 py-2.5 text-label-md border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 cursor-pointer',
              viewMode === 'radar'
                ? 'border-secondary text-on-surface font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-600" />
            Live Field Radar ({liveRadarReps.length})
          </button>
        </div>

        <span className="text-caption text-on-surface-variant hidden sm:inline">
          Real-time SSE updates enabled
        </span>
      </div>

      {viewMode === 'radar' ? (
        <section className="space-y-4">
          <TeamRadarMap
            reps={liveRadarReps}
            onSelectRep={(id) => setSelectedRepId(id)}
            height={380}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 tabular-nums">
            {liveRadarReps.map((rep) => (
              <button
                key={rep.repId}
                type="button"
                onClick={() => setSelectedRepId(rep.repId)}
                className="text-left p-4 rounded-xl bg-surface-container-lowest border border-hairline hover:border-secondary/40 transition-colors space-y-2.5 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-on-surface text-body-md">
                      {rep.fullName}
                    </div>
                    <div className="text-caption text-on-surface-variant">
                      {rep.employeeCode} · {rep.territory}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0',
                      rep.presenceStatus === 'ON_SITE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : rep.presenceStatus === 'LIVE_DUTY'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-surface-container text-on-surface-variant',
                    )}
                  >
                    {rep.presenceStatus === 'ON_SITE'
                      ? 'Checked-In @ Site'
                      : rep.presenceStatus === 'LIVE_DUTY'
                        ? 'On-Duty GPS'
                        : 'Last Known'}
                  </span>
                </div>

                {rep.activeVisit ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-caption text-emerald-900">
                    Active at <strong>{rep.activeVisit.customerName}</strong> (
                    Session #{rep.activeVisit.sessionNumber} · since{' '}
                    {format(new Date(rep.activeVisit.checkInAt), 'h:mm a')})
                  </div>
                ) : rep.nextMeeting ? (
                  <div className="p-2.5 rounded-lg bg-surface-container-low text-caption text-on-surface-variant flex items-center justify-between gap-2">
                    <span className="truncate">
                      Next: <strong className="text-on-surface">{rep.nextMeeting.customerName}</strong>
                    </span>
                    {rep.nextMeeting.distanceMeters !== null ? (
                      <span className="shrink-0 font-medium text-secondary">
                        {(rep.nextMeeting.distanceMeters / 1000).toFixed(1)} km
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="pt-1 border-t border-hairline flex items-center justify-between text-caption text-on-surface-variant">
                  <span>
                    {rep.coordinates.latitude.toFixed(4)}° N,{' '}
                    {rep.coordinates.longitude.toFixed(4)}° E
                  </span>
                  <span>
                    {rep.todayStats.distanceTraveledKm} km · View trail →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Section 1: Team Performance */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            Employee performance
          </h2>
          <span className="text-caption text-on-surface-variant">
            Select an employee to view recent activity
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-x-auto">
          <table className="w-full text-left text-body-sm tabular-nums">
            <thead className="bg-surface-container-low border-b border-hairline text-caption font-medium text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Territory</th>
                <th className="px-4 py-3 text-right">Meetings</th>
                <th className="px-4 py-3 text-right">Open follow-ups</th>
                <th className="px-4 py-3">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {data.repExecution.map((rep) => (
                <tr
                  key={rep.id}
                  onClick={() => setSelectedRepId(rep.id)}
                  className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-on-surface">
                      {rep.fullName}
                    </div>
                    <div className="text-caption text-on-surface-variant">
                      {rep.employeeCode} · {rep.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {rep.territory || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-on-surface">
                    {rep.completedMeetings} / {rep.totalMeetings}
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface">
                    {rep.openFollowUps}
                  </td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
                        <div
                          className="h-full bg-secondary rounded-full"
                          style={{
                            width: `${Math.min(100, rep.completionRate)}%`,
                          }}
                        />
                      </div>
                      <span className="text-caption font-medium text-on-surface w-9 text-right">
                        {rep.completionRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Meeting Progress (Contextual Menu for Reopen & Reassign) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-headline-sm font-semibold text-on-surface">
            Meeting progress
          </h2>
          <p className="text-caption text-on-surface-variant mt-0.5">
            Track scheduled visits, actual durations, and outcomes across your
            team.
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-x-auto">
          <table className="w-full text-left text-body-sm tabular-nums">
            <thead className="bg-surface-container-low border-b border-hairline text-caption font-medium text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Customer &amp; meeting</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Actual visit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {data.liveMonitoring.map((m) => {
                const menuItems: ActionMenuItem[] = [
                  {
                    label: 'View meeting',
                    icon: Eye,
                    onSelect: () => router.push(`/meetings/${m.id}`),
                  },
                ];

                if (
                  m.status !== MEETING_STATUS.COMPLETED &&
                  m.status !== MEETING_STATUS.CANCELLED &&
                  hasPermission(PERMISSIONS.MEETINGS_REASSIGN)
                ) {
                  menuItems.push({
                    label: 'Reassign employee',
                    icon: ArrowLeftRight,
                    onSelect: () => {
                      setReassignError(null);
                      setNewRepId('');
                      setReassignReason('');
                      setReassignTarget(m);
                    },
                  });
                }

                if (
                  m.status === MEETING_STATUS.COMPLETED &&
                  hasPermission(PERMISSIONS.MEETINGS_REOPEN)
                ) {
                  menuItems.push({
                    label: 'Reopen meeting',
                    icon: KeyRound,
                    tone: 'danger',
                    separatorBefore: true,
                    onSelect: () => {
                      setReopenError(null);
                      setReopenTarget(m);
                    },
                  });
                }

                return (
                  <tr
                    key={m.id}
                    className="hover:bg-surface-container-low/60 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/meetings/${m.id}`}
                        className="font-medium text-on-surface hover:text-secondary transition-colors block"
                      >
                        {m.customer?.companyName ?? m.title}
                      </Link>
                      <span className="text-caption text-on-surface-variant">
                        {m.meetingCode} · {m.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface">
                      {m.assignedRep?.fullName ?? 'Unassigned'}
                    </td>
                    <td className="px-4 py-3 text-caption text-on-surface-variant">
                      <div>
                        {format(new Date(m.scheduledStart), 'dd MMM yyyy')}
                      </div>
                      <div>
                        {format(new Date(m.scheduledStart), 'hh:mm a')} –{' '}
                        {format(new Date(m.scheduledEnd), 'hh:mm a')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-caption">
                      {m.firstCheckInAt ? (
                        <div>
                          <span className="font-medium text-on-surface">
                            {m.totalActualDurationMinutes}m
                          </span>
                          <span className="text-on-surface-variant">
                            {' '}
                            ({m.visitSessionCount}{' '}
                            {m.visitSessionCount === 1 ? 'session' : 'sessions'})
                          </span>
                        </div>
                      ) : (
                        <span className="text-on-surface-variant">
                          Not started
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3">
                      {m.outcome ? (
                        <StatusBadge
                          status={m.outcome.outcomeType}
                          showDot={false}
                        />
                      ) : (
                        <span className="text-caption text-on-surface-variant">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ActionMenu
                        ariaLabel={`Actions for ${m.meetingCode}`}
                        items={menuItems}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Employee Activity Drawer */}
      <SlideDrawer
        open={Boolean(selectedRepId)}
        onClose={() => setSelectedRepId(null)}
        title={
          repDossier
            ? repDossier.rep.fullName
            : 'Employee activity'
        }
        subtitle={
          repDossier
            ? `${repDossier.rep.employeeCode} · ${repDossier.rep.territory ?? 'No territory'}`
            : 'Loading employee details...'
        }
      >
        {repLoading || !repDossier ? (
          <div className="py-10 text-center text-body-sm text-on-surface-variant">
            Loading employee details...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Salesperson Live GPS Breadcrumb Route Trail */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-label-md font-semibold text-on-surface flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-secondary" />
                  GPS breadcrumb trail ({repTrail.length} pts)
                </h3>
                <span className="text-caption font-medium text-on-surface-variant tabular-nums">
                  {repDistanceKm} km covered
                </span>
              </div>

              {repTrail.length > 0 ? (
                <>
                  <TeamRadarMap trail={repTrail} height={190} />
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 tabular-nums">
                    {[...repTrail].reverse().slice(0, 6).map((pt) => (
                      <div
                        key={pt.id}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-hairline flex items-center justify-between gap-2 text-caption"
                      >
                        <span className="font-medium text-on-surface truncate">
                          {pt.label}
                        </span>
                        <span className="text-on-surface-variant shrink-0">
                          {format(new Date(pt.recordedAt), 'dd MMM, h:mm a')}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : repDossier.latestTelemetry ? (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-hairline flex items-start gap-2.5 tabular-nums">
                  <MapPin className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                  <div className="text-body-sm">
                    <div className="font-medium text-on-surface">
                      Last check-in location
                    </div>
                    <div className="text-caption text-on-surface-variant mt-0.5">
                      {repDossier.latestTelemetry.coordinates.latitude.toFixed(4)}
                      ° N,{' '}
                      {repDossier.latestTelemetry.coordinates.longitude.toFixed(4)}
                      ° E ·{' '}
                      {format(
                        new Date(repDossier.latestTelemetry.checkInAt),
                        'dd MMM, hh:mm a',
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  No GPS pings recorded yet for this employee.
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <h3 className="text-label-md font-semibold text-on-surface">
                Recent meetings
              </h3>
              {repDossier.recentMeetings.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">
                  No recent meetings recorded.
                </p>
              ) : (
                repDossier.recentMeetings.map((m) => (
                  <Link
                    key={m.id}
                    href={`/meetings/${m.id}`}
                    className="flex items-center justify-between gap-2 p-3 rounded-xl border border-hairline hover:bg-surface-container-low transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-on-surface truncate">
                        {m.customerName}
                      </div>
                      <div className="text-caption text-on-surface-variant tabular-nums">
                        {format(new Date(m.scheduledStart), 'dd MMM, hh:mm a')} ·{' '}
                        {m.totalActualDurationMinutes}m
                      </div>
                    </div>
                    <StatusBadge status={m.status} showDot={false} />
                  </Link>
                ))
              )}
            </div>

            <div className="space-y-2.5 border-t border-hairline pt-4">
              <h3 className="text-label-md font-semibold text-on-surface">
                Open follow-ups ({repDossier.pendingFollowUps.length})
              </h3>
              {repDossier.pendingFollowUps.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">
                  No open follow-up tasks.
                </p>
              ) : (
                repDossier.pendingFollowUps.map((f) => (
                  <div
                    key={f.id}
                    className="p-3 rounded-xl border border-hairline space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-on-surface text-body-sm truncate">
                        {f.title}
                      </span>
                      <StatusBadge status={f.status} showDot={false} />
                    </div>
                    <div className="text-caption text-on-surface-variant tabular-nums">
                      {f.customerName} · Due{' '}
                      {format(new Date(f.dueDate), 'dd MMM yyyy')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SlideDrawer>

      {/* Reopen Completed Meeting Confirmation Modal */}
      <ConfirmModal
        open={Boolean(reopenTarget)}
        onClose={() => {
          setReopenTarget(null);
          setReopenError(null);
        }}
        title="Reopen completed meeting"
        description="Reopening a completed meeting unlocks its outcome for editing and creates an immutable audit log entry."
        tone="danger"
        icon={LockOpen}
        confirmLabel="Confirm & reopen"
        confirmDisabled={reopenReason.trim().length < 5}
        isSubmitting={isReopening}
        onConfirm={() => void handleConfirmReopen()}
      >
        <div className="space-y-4">
          {reopenTarget ? (
            <div className="p-3 rounded-lg bg-surface-container-low border border-hairline text-caption flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-on-surface">
                {reopenTarget.meetingCode} · {reopenTarget.customer?.companyName}
              </span>
              <span className="text-on-surface-variant">
                Owner: {reopenTarget.assignedRep?.fullName}
              </span>
            </div>
          ) : null}

          {reopenError ? (
            <StatusBanner tone="error" message={reopenError} />
          ) : null}

          <FormField
            label="Reason for reopening"
            htmlFor="reopen-reason"
            required
          >
            <SelectField
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="w-full"
            >
              <option value="Customer requested scope amendment">
                Customer requested scope amendment
              </option>
              <option value="Incomplete visit notes or missing follow-up deliverable">
                Incomplete visit notes or missing follow-up deliverable
              </option>
              <option value="Incorrect outcome classification recorded by rep">
                Incorrect outcome classification recorded by rep
              </option>
              <option value="Additional continuation session requested">
                Additional continuation session requested
              </option>
            </SelectField>
          </FormField>

          <FormField
            label="Additional notes"
            htmlFor="reopen-notes"
            hint="Optional"
          >
            <Textarea
              id="reopen-notes"
              value={reopenExplanation}
              onChange={(e) => setReopenExplanation(e.target.value)}
              placeholder="Add context for the assigned employee and audit log..."
            />
          </FormField>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-body-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={notifyRep}
                onChange={(e) => setNotifyRep(e.target.checked)}
                className="w-4 h-4 rounded accent-secondary"
              />
              <span>Notify assigned employee</span>
            </label>

            <div className="flex items-center gap-2">
              <label
                htmlFor="manager-pin"
                className="text-caption text-on-surface-variant"
              >
                Manager PIN (if required):
              </label>
              <Input
                id="manager-pin"
                type="password"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="••••"
                className="w-24 text-center"
              />
            </div>
          </div>
        </div>
      </ConfirmModal>

      {/* Reassign Meeting Modal */}
      <ConfirmModal
        open={Boolean(reassignTarget)}
        onClose={() => {
          setReassignTarget(null);
          setReassignError(null);
        }}
        title="Reassign meeting"
        description={
          reassignTarget
            ? `Transfer ${reassignTarget.meetingCode} (${reassignTarget.customer?.companyName ?? ''}) to another team member.`
            : undefined
        }
        tone="info"
        icon={ArrowLeftRight}
        confirmLabel="Confirm reassignment"
        confirmDisabled={!newRepId || reassignReason.trim().length < 3}
        isSubmitting={isReassigning}
        onConfirm={() => void handleConfirmReassign()}
      >
        <div className="space-y-3.5">
          {reassignError ? (
            <StatusBanner tone="error" message={reassignError} />
          ) : null}

          <FormField
            label="New assigned employee"
            htmlFor="reassign-rep"
            required
          >
            <SelectField
              id="reassign-rep"
              value={newRepId}
              onChange={(e) => setNewRepId(e.target.value)}
              className="w-full"
            >
              <option value="">Select employee...</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName} ({r.employeeCode})
                </option>
              ))}
            </SelectField>
          </FormField>

          <FormField
            label="Reason"
            htmlFor="reassign-reason"
            required
            hint="Min. 3 characters"
          >
            <Textarea
              id="reassign-reason"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Territory coverage, leave backup, or escalation..."
            />
          </FormField>
        </div>
      </ConfirmModal>
    </div>
  );
}

export default function TeamActivityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamActivityContent />
    </Suspense>
  );
}
