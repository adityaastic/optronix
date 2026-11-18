'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { PERMISSIONS } from '@/shared';
import { formatCurrencyAmount, useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AssignableUser } from '@/lib/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { ActionMenu } from '@/components/shared/ActionMenu';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { KpiCard } from '@/components/shared/KpiCard';
import { SlideDrawer } from '@/components/shared/ConfirmModal';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';

interface ReportsAnalyticsData {
  kpis: {
    totalMeetings: number;
    completedMeetings: number;
    completionRatePercent: number;
    avgVisitDurationMinutes: number;
    followUpCompletionRatePercent: number;
  };
  meetingAnalytics: {
    timeline: Array<{ date: string; scheduled: number; completed: number }>;
    statusBreakdown: Array<{
      status: string;
      count: number;
      percentage: number;
    }>;
  };
  outcomeAnalysis: Array<{
    outcomeType: string;
    count: number;
    percentage: number;
    estimatedPipelineValue: number;
  }>;
  visitAnalytics: {
    totalSessions: number;
    geofenceComplianceRatePercent: number;
    avgSessionMinutes: number;
    multiSessionMeetingsCount: number;
    pausedSessionsCount: number;
  };
  followUpAnalytics: {
    total: number;
    completed: number;
    overdue: number;
    pending: number;
    inProgress: number;
    byPriority: Record<string, number>;
  };
  employeePerformance: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    territory: string;
    totalMeetings: number;
    completedMeetings: number;
    rescheduledMeetings: number;
    avgDurationMinutes: number;
    followUpsCreated: number;
    followUpsCompleted: number;
    completionSlaPercent: number;
  }>;
}

export default function ReportsAnalyticsPage() {
  const { user, hasPermission } = useAuth();
  const canFilterEmployees = hasPermission(PERMISSIONS.TEAM_READ);
  const tenantCurrency = user?.tenantSettings?.defaultCurrency ?? 'INR';

  const [data, setData] = useState<ReportsAnalyticsData | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Understandable Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  // Custom CSV Export Drawer
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [includePerformance, setIncludePerformance] = useState(true);
  const [includeOutcomes, setIncludeOutcomes] = useState(true);
  const [includeVisitTelemetry, setIncludeVisitTelemetry] = useState(true);

  const dateRangeError = useMemo(() => {
    if (fromDate && toDate && toDate < fromDate) {
      return 'End date must be on or after start date.';
    }
    return null;
  }, [fromDate, toDate]);

  const loadAnalytics = useCallback(async () => {
    if (dateRangeError) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (employeeId) params.set('employeeId', employeeId);

      const qs = params.toString();
      const analyticsRes = await apiFetch<ReportsAnalyticsData>(
        `/reports/analytics${qs ? `?${qs}` : ''}`,
      );

      setData(analyticsRes.data);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load reports.',
      );
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, employeeId, dateRangeError]);

  useEffect(() => {
    if (!canFilterEmployees) return;
    void apiFetch<{ users: AssignableUser[] }>('/users/assignable')
      .then((res) => setAssignableUsers(res.data.users))
      .catch(() => undefined);
  }, [canFilterEmployees]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const totalPipelineValue = useMemo(() => {
    if (!data) return 0;
    return data.outcomeAnalysis.reduce(
      (sum, item) => sum + item.estimatedPipelineValue,
      0,
    );
  }, [data]);

  const handleExportCsv = () => {
    if (!data) return;
    const sections: string[] = [];

    if (includePerformance) {
      sections.push('EMPLOYEE PERFORMANCE');
      sections.push(
        [
          'Employee Code',
          'Full Name',
          'Territory',
          'Total Meetings',
          'Completed',
          'Rescheduled',
          'Avg Visit (min)',
          'Follow-Ups Created',
          'Follow-Ups Completed',
          'Completion Rate (%)',
        ].join(','),
      );
      for (const emp of data.employeePerformance) {
        sections.push(
          [
            emp.employeeCode,
            `"${emp.fullName}"`,
            `"${emp.territory}"`,
            emp.totalMeetings,
            emp.completedMeetings,
            emp.rescheduledMeetings,
            emp.avgDurationMinutes,
            emp.followUpsCreated,
            emp.followUpsCompleted,
            emp.completionSlaPercent,
          ].join(','),
        );
      }
      sections.push('');
    }

    if (includeOutcomes) {
      sections.push('OUTCOME SUMMARY');
      sections.push('Outcome Type,Count,Share (%),Estimated Pipeline Value');
      for (const out of data.outcomeAnalysis) {
        sections.push(
          [
            out.outcomeType,
            out.count,
            out.percentage,
            out.estimatedPipelineValue,
          ].join(','),
        );
      }
      sections.push('');
    }

    if (includeVisitTelemetry) {
      sections.push('VISIT SUMMARY');
      sections.push(`Total Sessions,${data.visitAnalytics.totalSessions}`);
      sections.push(
        `Geofence Compliance (%),${data.visitAnalytics.geofenceComplianceRatePercent}`,
      );
      sections.push(
        `Average Session Duration (min),${data.visitAnalytics.avgSessionMinutes}`,
      );
      sections.push(
        `Split Visits,${data.visitAnalytics.multiSessionMeetingsCount}`,
      );
      sections.push(
        `Paused Sessions,${data.visitAnalytics.pausedSessionsCount}`,
      );
    }

    const blob = new Blob([sections.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `optronix_reports_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportDrawerOpen(false);
  };

  if (loading && !data) {
    return <PageSkeleton />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Reports unavailable"
        message={error ?? 'Unable to load report metrics.'}
        onRetry={() => void loadAnalytics()}
      />
    );
  }

  const hasFilters = Boolean(fromDate || toDate || employeeId);

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Reports"
        description="Analyze meeting completion, visit durations, outcomes, and employee performance."
        actions={
          <>
            <ActionMenu
              triggerLabel="Options"
              ariaLabel="Report options"
              items={[
                {
                  label: 'Customize export',
                  icon: SlidersHorizontal,
                  onSelect: () => setExportDrawerOpen(true),
                },
                {
                  label: 'Refresh data',
                  icon: RefreshCw,
                  onSelect: () => void loadAnalytics(),
                },
              ]}
            />
            <Button type="button" variant="primary" onClick={handleExportCsv}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </>
        }
      />

      {/* Understandable Date & Employee Filter Strip */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            label="From date"
            htmlFor="rep-from-date"
            className="w-full sm:w-44"
          >
            <Input
              id="rep-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </FormField>

          <FormField
            label="To date"
            htmlFor="rep-to-date"
            className="w-full sm:w-44"
          >
            <Input
              id="rep-to-date"
              type="date"
              aria-invalid={Boolean(dateRangeError)}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </FormField>

          {canFilterEmployees ? (
            <FormField
              label="Employee"
              htmlFor="rep-emp-select"
              className="w-full sm:w-56"
            >
              <SelectField
                id="rep-emp-select"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full"
              >
                <option value="">All employees</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.employeeCode})
                  </option>
                ))}
              </SelectField>
            </FormField>
          ) : null}

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setEmployeeId('');
              }}
              className="h-9"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </Button>
          ) : null}
        </div>

        {dateRangeError ? (
          <StatusBanner tone="error" message={dateRangeError} />
        ) : null}
      </div>

      {/* 4 Crisp KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total meetings"
          value={data.kpis.totalMeetings}
          icon={Users}
          badgeText={`${data.visitAnalytics.geofenceComplianceRatePercent}% GPS verified`}
          badgeTone="success"
          footerLeft={`Completed: ${data.kpis.completedMeetings}`}
        />
        <KpiCard
          label="Completion rate"
          value={`${data.kpis.completionRatePercent}%`}
          icon={CheckCircle2}
          badgeText="With outcome"
          badgeTone="success"
          footerLeft={`${data.kpis.completedMeetings} closed`}
        />
        <KpiCard
          label="Avg. visit duration"
          value={`${data.kpis.avgVisitDurationMinutes}m`}
          icon={Clock}
          badgeText={
            data.visitAnalytics.multiSessionMeetingsCount > 0
              ? `${data.visitAnalytics.multiSessionMeetingsCount} split visits`
              : `${data.visitAnalytics.totalSessions} sessions`
          }
          badgeTone="blue"
          footerLeft="Actual checked-in time"
        />
        <KpiCard
          label="Follow-up completion"
          value={`${data.kpis.followUpCompletionRatePercent}%`}
          icon={TrendingUp}
          badgeText={
            data.followUpAnalytics.overdue > 0
              ? `${data.followUpAnalytics.overdue} overdue`
              : 'On schedule'
          }
          badgeTone={
            data.followUpAnalytics.overdue > 0 ? 'danger' : 'success'
          }
          footerLeft={`${data.followUpAnalytics.completed} of ${data.followUpAnalytics.total} tasks`}
        />
      </div>

      {/* Clean Insight Row: 1 Readable Timeline Chart + 1 Outcome Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl border border-hairline p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Scheduled vs. completed meetings
              </h2>
              <p className="text-caption text-on-surface-variant mt-0.5">
                14-day visit activity trend
              </p>
            </div>
            <div className="flex items-center gap-4 text-caption text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                Scheduled
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                Completed
              </span>
            </div>
          </div>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.meetingAnalytics.timeline}>
                <defs>
                  <linearGradient id="schedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="scheduled"
                  name="Scheduled"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#schedGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#059669"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#compGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl border border-hairline p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Meeting outcomes
              </h2>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Influenced pipeline:{' '}
                <strong className="text-on-surface font-medium tabular-nums">
                  {formatCurrencyAmount(totalPipelineValue, tenantCurrency)}
                </strong>
              </p>
            </div>

            {data.outcomeAnalysis.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant py-8 text-center">
                No outcomes recorded in this date range.
              </p>
            ) : (
              <div className="space-y-3">
                {data.outcomeAnalysis.map((o) => (
                  <div key={o.outcomeType} className="space-y-1.5">
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="text-on-surface font-medium">
                        {o.outcomeType.replace(/_/g, ' ')}
                      </span>
                      <span className="tabular-nums text-on-surface-variant">
                        {o.count} ({o.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div
                        className="h-full bg-secondary rounded-full"
                        style={{ width: `${Math.min(100, o.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-hairline grid grid-cols-2 gap-3 text-caption tabular-nums">
            <div>
              <span className="text-on-surface-variant block">
                Visit sessions
              </span>
              <span className="text-body-sm font-semibold text-on-surface">
                {data.visitAnalytics.totalSessions} total
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant block">
                Paused &amp; resumed
              </span>
              <span className="text-body-sm font-semibold text-on-surface">
                {data.visitAnalytics.pausedSessionsCount} sessions
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Clean Employee Performance Table */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            Employee breakdown
          </h2>
          <span className="text-caption text-on-surface-variant tabular-nums">
            {data.employeePerformance.length}{' '}
            {data.employeePerformance.length === 1 ? 'employee' : 'employees'}
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-x-auto">
          <table className="w-full text-left border-collapse tabular-nums">
            <thead>
              <tr className="border-b border-hairline bg-surface-container-low text-caption font-medium text-on-surface-variant">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Territory</th>
                <th className="py-3 px-3 text-right">Meetings</th>
                <th className="py-3 px-3 text-right">Completed</th>
                <th className="py-3 px-3 text-right">Rescheduled</th>
                <th className="py-3 px-3 text-right">Avg. visit</th>
                <th className="py-3 px-3 text-right">Follow-ups</th>
                <th className="py-3 px-4 text-right">Completion rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-body-sm">
              {data.employeePerformance.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-surface-container-low/60 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="font-medium text-on-surface">
                      {emp.fullName}
                    </div>
                    <div className="text-caption text-on-surface-variant">
                      {emp.employeeCode}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-on-surface-variant">
                    {emp.territory || '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-on-surface">
                    {emp.totalMeetings}
                  </td>
                  <td className="py-3 px-3 text-right text-on-surface">
                    {emp.completedMeetings}
                  </td>
                  <td className="py-3 px-3 text-right text-on-surface-variant">
                    {emp.rescheduledMeetings}
                  </td>
                  <td className="py-3 px-3 text-right text-on-surface">
                    {emp.avgDurationMinutes}m
                  </td>
                  <td className="py-3 px-3 text-right text-on-surface">
                    {emp.followUpsCompleted} / {emp.followUpsCreated}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-on-surface">
                    {emp.completionSlaPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Customize CSV Export Drawer */}
      <SlideDrawer
        open={exportDrawerOpen}
        onClose={() => setExportDrawerOpen(false)}
        title="Customize CSV export"
        subtitle="Choose which sections to include in the downloaded CSV file."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={
                !includePerformance &&
                !includeOutcomes &&
                !includeVisitTelemetry
              }
              onClick={handleExportCsv}
            >
              <Download className="w-4 h-4" />
              Download CSV
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="p-3.5 rounded-xl border border-hairline flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-label-md font-medium text-on-surface">
                Employee performance
              </p>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Meetings, completion rates, average visit durations, and
                follow-up counts per employee.
              </p>
            </div>
            <input
              type="checkbox"
              checked={includePerformance}
              onChange={(e) => setIncludePerformance(e.target.checked)}
              className="mt-1 w-4 h-4 accent-secondary"
            />
          </label>

          <label className="p-3.5 rounded-xl border border-hairline flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-label-md font-medium text-on-surface">
                Outcome &amp; pipeline summary
              </p>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Counts, percentages, and estimated pipeline values by outcome.
              </p>
            </div>
            <input
              type="checkbox"
              checked={includeOutcomes}
              onChange={(e) => setIncludeOutcomes(e.target.checked)}
              className="mt-1 w-4 h-4 accent-secondary"
            />
          </label>

          <label className="p-3.5 rounded-xl border border-hairline flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-label-md font-medium text-on-surface">
                Visit &amp; geofence summary
              </p>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Total visit sessions, geofence verification rate, and split
                visits.
              </p>
            </div>
            <input
              type="checkbox"
              checked={includeVisitTelemetry}
              onChange={(e) => setIncludeVisitTelemetry(e.target.checked)}
              className="mt-1 w-4 h-4 accent-secondary"
            />
          </label>
        </div>
      </SlideDrawer>
    </div>
  );
}
