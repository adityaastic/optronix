'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building2,
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  MailPlus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import {
  PERMISSIONS,
  ROLE_CODES,
  USER_STATUS,
  inviteUserSchema,
  type InviteUserInput,
} from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { PageHeader } from '@/components/shared/PageHeader';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/ActionMenu';
import {
  FormField,
  StatusBanner,
  useUnsavedChangesWarning,
} from '@/components/shared/FormField';
import { KpiCard } from '@/components/shared/KpiCard';
import { FilterToolbar } from '@/components/shared/FilterToolbar';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmModal, SlideDrawer } from '@/components/shared/ConfirmModal';
import { ErrorState, PageSkeleton } from '@/components/shared/FeedbackStates';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type AdminTab = 'users' | 'roles' | 'policies' | 'organization' | 'audit';

interface AdminOverviewStats {
  totalUsers: number;
  activeSalesReps: number;
  totalAccounts: number;
  loggedMeetings: number;
  completionRatePercent: number;
  openFollowUpAlerts: number;
}

interface AdminUserRow {
  id: string;
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  territory: string | null;
  department: string | null;
  status: string;
  role: { id: string; code: string; name: string; tier: number } | null;
  manager: { id: string; fullName: string; employeeCode: string } | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AdminRoleItem {
  id: string;
  code: string;
  name: string;
  description: string;
  tier: number;
  isSystem: boolean;
  permissionKeys: string[];
}

interface AdminPermissionItem {
  id: string;
  key: string;
  module: string;
  description: string;
  isElevated: boolean;
}

interface SystemSettingsData {
  organizationName: string;
  defaultTimezone: string;
  defaultCurrency?: 'INR' | 'USD' | 'EUR' | 'GBP';
  smtpSenderEmail?: string;
  defaultGeofenceRadiusMeters: number;
  enforceGeofenceOnCheckIn: boolean;
  allowGeofenceOverrideWithReason: boolean;
  checkInBufferMinutes: number;
  minimumVisitDurationMinutes: number;
  requireManagerPinOnReopen: boolean;
  followUpReminderHoursBefore: number;
  enableSlaEscalationAlerts: boolean;
}

interface AuditLogItem {
  id: string;
  auditCode: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorRole: string;
  actorName: string;
  reason: string | null;
  ipAddress: string | null;
  integrityHash: string;
  createdAt: string;
}

interface EmailDeliveryStatus {
  delivered: boolean;
  mode: string;
  previewUrl?: string | null;
  error?: string | null;
}

interface GeneratedInviteInfo {
  email: string;
  fullName: string;
  roleCode: string;
  invitePath: string;
  expiresAt: string;
  emailDelivery?: EmailDeliveryStatus;
}

export default function AdminSettingsGovernancePage() {
  const { user, hasPermission, refreshSession } = useAuth();
  const isAuthorized = hasPermission(PERMISSIONS.USERS_MANAGE);

  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleItem[]>([]);
  const [permissions, setPermissions] = useState<AdminPermissionItem[]>([]);
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [chainIntegrity, setChainIntegrity] = useState<{
    valid: boolean;
    checkedCount: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // User Directory Filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Audit Filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('');

  // Invite User Drawer & Generated Invite Link
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] =
    useState<GeneratedInviteInfo | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Destructive Action: Deactivate User Modal
  const [deactivateTarget, setDeactivateTarget] =
    useState<AdminUserRow | null>(null);
  const [deactReason, setDeactReason] = useState('');
  const [reassignRepId, setReassignRepId] = useState('');
  const [deactError, setDeactError] = useState<string | null>(null);
  const [deactSubmitting, setDeactSubmitting] = useState(false);

  // Role Permission Editing
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [draftPermKeys, setDraftPermKeys] = useState<string[]>([]);
  const [roleSaving, setRoleSaving] = useState(false);

  // Settings Saving
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!isAuthorized) return;
    const userParams = new URLSearchParams({ limit: '50' });
    if (userSearch.trim()) userParams.set('search', userSearch.trim());
    if (roleFilter) userParams.set('roleCode', roleFilter);
    if (statusFilter) userParams.set('status', statusFilter);
    const usersRes = await apiFetch<{ users: AdminUserRow[] }>(
      `/admin/users?${userParams.toString()}`,
    );
    setUsers(usersRes.data.users);
  }, [isAuthorized, userSearch, roleFilter, statusFilter]);

  const loadAuditLogs = useCallback(async () => {
    if (!isAuthorized) return;
    const auditParams = new URLSearchParams({ limit: '40' });
    if (auditSearch.trim()) auditParams.set('search', auditSearch.trim());
    if (auditEntityFilter) auditParams.set('entityType', auditEntityFilter);
    const auditRes = await apiFetch<{
      auditLogs: AuditLogItem[];
      chainIntegrity?: { valid: boolean; checkedCount: number };
    }>(`/admin/audit-logs?${auditParams.toString()}`);
    setAuditLogs(auditRes.data.auditLogs);
    if (auditRes.data.chainIntegrity) {
      setChainIntegrity(auditRes.data.chainIntegrity);
    }
  }, [isAuthorized, auditSearch, auditEntityFilter]);

  const loadAllGovernanceData = useCallback(async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, rolesRes, settingsRes] = await Promise.all([
        apiFetch<{ stats: AdminOverviewStats }>('/admin/overview'),
        apiFetch<{
          roles: AdminRoleItem[];
          permissions: AdminPermissionItem[];
        }>('/admin/roles'),
        apiFetch<{ settings: SystemSettingsData }>('/admin/settings'),
        loadUsers(),
        loadAuditLogs(),
      ]);

      setStats(overviewRes.data.stats);
      setRoles(rolesRes.data.roles);
      setPermissions(rolesRes.data.permissions);
      setSettings(settingsRes.data.settings);

      if (rolesRes.data.roles.length > 0) {
        setSelectedRoleId((prev) => {
          if (prev) return prev;
          const defaultRole = rolesRes.data.roles[0]!;
          setDraftPermKeys(defaultRole.permissionKeys);
          return defaultRole.id;
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load administrative settings.',
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, loadUsers, loadAuditLogs]);

  useEffect(() => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [overviewRes, rolesRes, settingsRes] = await Promise.all([
          apiFetch<{ stats: AdminOverviewStats }>('/admin/overview'),
          apiFetch<{
            roles: AdminRoleItem[];
            permissions: AdminPermissionItem[];
          }>('/admin/roles'),
          apiFetch<{ settings: SystemSettingsData }>('/admin/settings'),
        ]);
        setStats(overviewRes.data.stats);
        setRoles(rolesRes.data.roles);
        setPermissions(rolesRes.data.permissions);
        setSettings(settingsRes.data.settings);
        if (rolesRes.data.roles.length > 0) {
          const defaultRole = rolesRes.data.roles[0]!;
          setSelectedRoleId(defaultRole.id);
          setDraftPermKeys(defaultRole.permissionKeys);
        }
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Failed to load administrative settings.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthorized]);

  useEffect(() => {
    void loadUsers().catch(() => undefined);
  }, [loadUsers]);

  useEffect(() => {
    void loadAuditLogs().catch(() => undefined);
  }, [loadAuditLogs]);

  const managersList = useMemo(
    () =>
      users.filter(
        (u) =>
          u.status === USER_STATUS.ACTIVE &&
          (u.role?.code === ROLE_CODES.SALES_MANAGER ||
            u.role?.code === ROLE_CODES.ADMIN),
      ),
    [users],
  );

  const activeUsersForReassign = useMemo(
    () =>
      users.filter(
        (u) =>
          u.status === USER_STATUS.ACTIVE && u.id !== deactivateTarget?.id,
      ),
    [users, deactivateTarget],
  );

  // Group permissions by module for understandable RBAC management
  const permissionsByModule = useMemo(() => {
    const groups = new Map<string, AdminPermissionItem[]>();
    for (const perm of permissions) {
      const mod = perm.module || 'General';
      const existing = groups.get(mod) ?? [];
      existing.push(perm);
      groups.set(mod, existing);
    }
    return Array.from(groups.entries());
  }, [permissions]);

  const {
    register: registerInvite,
    handleSubmit: handleSubmitInvite,
    reset: resetInvite,
    formState: {
      errors: inviteErrors,
      isSubmitting: isInviting,
      isDirty: isInviteDirty,
    },
  } = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      roleCode: ROLE_CODES.SALES_EMPLOYEE,
      managerId: undefined,
      territory: '',
      department: 'Enterprise Field Sales',
    },
  });

  useUnsavedChangesWarning(inviteOpen && isInviteDirty);

  const onInviteUser = async (values: InviteUserInput) => {
    setInviteError(null);
    try {
      const payload: InviteUserInput = {
        ...values,
        managerId: values.managerId || null,
        phone: values.phone?.trim() ? values.phone.trim() : undefined,
        territory: values.territory?.trim() || undefined,
        department: values.department?.trim() || undefined,
      };
      const res = await apiFetch<{
        user: {
          id: string;
          employeeCode: string;
          email: string;
          fullName: string;
          roleCode: string;
          status: string;
          expiresAt: string;
        };
        invitePath: string;
        emailDelivery?: EmailDeliveryStatus;
      }>('/admin/users/invite', {
        method: 'POST',
        body: payload,
      });

      setInviteOpen(false);
      resetInvite();
      setActiveTab('users');
      setGeneratedInvite({
        email: res.data.user.email,
        fullName: res.data.user.fullName,
        roleCode: res.data.user.roleCode,
        invitePath: res.data.invitePath,
        expiresAt: res.data.user.expiresAt,
        emailDelivery: res.data.emailDelivery,
      });
      setCopiedInvite(false);
      setBannerMsg(
        res.data.emailDelivery?.delivered
          ? `Invitation emailed to ${res.data.user.email} (${res.data.emailDelivery.mode}).`
          : `Invitation created for ${res.data.user.fullName}. Share the single-use onboarding link below.`,
      );
      await loadAllGovernanceData();
    } catch (err) {
      setInviteError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to create invitation. Your input has been preserved.',
      );
    }
  };

  const handleResendInvite = async (target: AdminUserRow) => {
    setError(null);
    try {
      const res = await apiFetch<{
        invitePath: string;
        expiresAt: string;
        emailDelivery?: EmailDeliveryStatus;
      }>(`/admin/users/${target.id}/resend-invite`, {
        method: 'POST',
      });
      setGeneratedInvite({
        email: target.email,
        fullName: target.fullName,
        roleCode: target.role?.code ?? ROLE_CODES.SALES_EMPLOYEE,
        invitePath: res.data.invitePath,
        expiresAt: res.data.expiresAt,
        emailDelivery: res.data.emailDelivery,
      });
      setCopiedInvite(false);
      setBannerMsg(
        res.data.emailDelivery?.delivered
          ? `Fresh 72-hour invitation emailed to ${target.email} (${res.data.emailDelivery.mode}).`
          : `Generated a fresh 72-hour onboarding link for ${target.fullName}.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to regenerate invitation link.',
      );
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInvite) return;
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${generatedInvite.invitePath}`
        : generatedInvite.invitePath;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    } catch {
      setCopiedInvite(false);
    }
  };

  const handleSelectRole = (role: AdminRoleItem) => {
    setSelectedRoleId(role.id);
    setDraftPermKeys(role.permissionKeys);
  };

  const toggleDraftPerm = (key: string) => {
    setDraftPermKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!selectedRoleId || draftPermKeys.length === 0) return;
    setRoleSaving(true);
    setBannerMsg(null);
    try {
      await apiFetch(`/admin/roles/${selectedRoleId}`, {
        method: 'PATCH',
        body: { permissionKeys: draftPermKeys },
      });
      setBannerMsg('Role permissions updated and recorded in the audit log.');
      await loadAllGovernanceData();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update role permissions.',
      );
    } finally {
      setRoleSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSettingsSaving(true);
    setBannerMsg(null);
    try {
      const res = await apiFetch<{ settings: SystemSettingsData }>(
        '/admin/settings',
        {
          method: 'PATCH',
          body: {
            organizationName: settings.organizationName,
            defaultTimezone: settings.defaultTimezone,
            defaultCurrency: settings.defaultCurrency ?? 'INR',
            smtpSenderEmail: settings.smtpSenderEmail?.trim() ?? '',
            defaultGeofenceRadiusMeters: Number(
              settings.defaultGeofenceRadiusMeters,
            ),
            enforceGeofenceOnCheckIn: settings.enforceGeofenceOnCheckIn,
            allowGeofenceOverrideWithReason:
              settings.allowGeofenceOverrideWithReason,
            checkInBufferMinutes: Number(settings.checkInBufferMinutes),
            minimumVisitDurationMinutes: Number(
              settings.minimumVisitDurationMinutes,
            ),
            requireManagerPinOnReopen: settings.requireManagerPinOnReopen,
            followUpReminderHoursBefore: Number(
              settings.followUpReminderHoursBefore,
            ),
            enableSlaEscalationAlerts: settings.enableSlaEscalationAlerts,
          },
        },
      );
      setSettings(res.data.settings);
      await refreshSession();
      setBannerMsg('Settings saved and recorded in the audit log.');
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update system settings.',
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget || deactReason.trim().length < 5) return;
    setDeactError(null);
    setDeactSubmitting(true);
    try {
      await apiFetch(`/admin/users/${deactivateTarget.id}/deactivate`, {
        method: 'POST',
        body: {
          reason: deactReason.trim(),
          reassignMeetingsToUserId: reassignRepId || undefined,
          reassignFollowUpsToUserId: reassignRepId || undefined,
        },
      });
      const deactivatedName = deactivateTarget.fullName;
      setDeactivateTarget(null);
      setDeactReason('');
      setReassignRepId('');
      setBannerMsg(
        `${deactivatedName} has been deactivated and active sessions were revoked.`,
      );
      await loadAllGovernanceData();
    } catch (err) {
      setDeactError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to deactivate user.',
      );
    } finally {
      setDeactSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-surface-container-lowest rounded-xl border border-hairline p-8 text-center space-y-4">
        <div className="w-11 h-11 rounded-xl bg-error-container text-error flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h1 className="text-headline-md font-semibold text-on-surface">
          Admin access required
        </h1>
        <p className="text-body-sm text-on-surface-variant">
          Only administrators can manage users, role permissions, system
          settings, and audit logs.
        </p>
        <Button asChild variant="primary">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  if (loading && !stats) {
    return <PageSkeleton />;
  }

  if (error && !stats) {
    return (
      <ErrorState
        title="Admin settings unavailable"
        message={error}
        onRetry={() => void loadAllGovernanceData()}
      />
    );
  }

  const fullInviteUrl =
    generatedInvite && typeof window !== 'undefined'
      ? `${window.location.origin}${generatedInvite.invitePath}`
      : generatedInvite?.invitePath ?? '';

  return (
    <div className="space-y-6 pb-14">
      <PageHeader
        title="Admin settings"
        description="Manage users, role permissions, visit rules, organization settings, and audit logs."
        actions={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setInviteError(null);
              setInviteOpen(true);
            }}
          >
            <MailPlus className="w-4 h-4" />
            Invite user
          </Button>
        }
      />

      {bannerMsg ? (
        <StatusBanner
          tone="success"
          message={bannerMsg}
          onDismiss={() => setBannerMsg(null)}
        />
      ) : null}

      {error ? (
        <StatusBanner
          tone="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {/* Focused 4-KPI Platform Summary */}
      {stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total users"
            value={stats.totalUsers}
            icon={Users}
            badgeText={`${stats.activeSalesReps} active reps`}
          />
          <KpiCard
            label="Customer accounts"
            value={stats.totalAccounts}
            icon={Building2}
            badgeText="Directory"
          />
          <KpiCard
            label="Logged meetings"
            value={stats.loggedMeetings}
            icon={CalendarCheck}
            badgeTone="success"
            badgeText={`${stats.completionRatePercent}% completed`}
          />
          <KpiCard
            label="Overdue follow-ups"
            value={stats.openFollowUpAlerts}
            icon={ShieldCheck}
            badgeTone={stats.openFollowUpAlerts > 0 ? 'danger' : 'success'}
            badgeText={stats.openFollowUpAlerts > 0 ? 'Overdue' : 'All clear'}
          />
        </div>
      ) : null}

      {/* Logical Section Navigation */}
      <div
        role="tablist"
        aria-label="Admin configuration sections"
        className="flex items-center gap-1 border-b border-hairline overflow-x-auto overflow-y-hidden"
      >
        {(
          [
            { id: 'users', label: `Users (${users.length})` },
            { id: 'roles', label: 'Roles & permissions' },
            { id: 'policies', label: 'Visit rules' },
            { id: 'organization', label: 'Organization & alerts' },
            { id: 'audit', label: 'Audit logs' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3.5 py-2.5 text-label-md border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer',
              activeTab === tab.id
                ? 'border-secondary text-on-surface font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: USERS & INVITATIONS */}
      {activeTab === 'users' ? (
        <div className="space-y-5">
          {/* Generated Single-Use Invitation Link Card */}
          {generatedInvite ? (
            <div className="bg-surface-container-lowest rounded-xl border border-secondary/35 p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-headline-sm font-semibold text-on-surface">
                    Onboarding invitation link ready
                  </h2>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Share this single-use activation link with{' '}
                    <strong className="text-on-surface font-medium">
                      {generatedInvite.fullName}
                    </strong>{' '}
                    ({generatedInvite.email}). Expires{' '}
                    {format(
                      new Date(generatedInvite.expiresAt),
                      'dd MMM yyyy, hh:mm a',
                    )}
                    .
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGeneratedInvite(null)}
                  className="text-caption text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Input
                  readOnly
                  aria-label="Single-use onboarding invitation URL"
                  value={fullInviteUrl}
                  className="font-mono text-caption bg-surface-container-low"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyInviteLink()}
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy link
                      </>
                    )}
                  </Button>
                  <Button asChild variant="subtle" size="sm">
                    <Link href={generatedInvite.invitePath}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open link
                    </Link>
                  </Button>
                </div>
              </div>

              {generatedInvite.emailDelivery ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hairline text-caption">
                  <span className="text-on-surface-variant">
                    Email status:{' '}
                    <strong className="text-on-surface font-medium">
                      {generatedInvite.emailDelivery.delivered
                        ? `Sent via ${generatedInvite.emailDelivery.mode.toUpperCase()}`
                        : `Fallback (${generatedInvite.emailDelivery.error ?? 'configure sender email in Organization & alerts'})`}
                    </strong>
                  </span>
                  {generatedInvite.emailDelivery.previewUrl ? (
                    <a
                      href={generatedInvite.emailDelivery.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-secondary hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View sent email preview
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <FilterToolbar
            searchPlaceholder="Search by name, email, or employee code..."
            searchValue={userSearch}
            onSearchChange={setUserSearch}
            hasActiveFilters={Boolean(roleFilter || statusFilter)}
            onReset={() => {
              setUserSearch('');
              setRoleFilter('');
              setStatusFilter('');
            }}
          >
            <SelectField
              aria-label="Filter users by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles</option>
              <option value={ROLE_CODES.SALES_EMPLOYEE}>Sales Employee</option>
              <option value={ROLE_CODES.SALES_MANAGER}>Sales Manager</option>
              <option value={ROLE_CODES.ADMIN}>Admin</option>
            </SelectField>

            <SelectField
              aria-label="Filter users by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value={USER_STATUS.ACTIVE}>Active</option>
              <option value={USER_STATUS.PENDING}>Pending invite</option>
              <option value={USER_STATUS.INACTIVE}>Inactive</option>
            </SelectField>
          </FilterToolbar>

          <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-hairline text-caption font-medium text-on-surface-variant">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Territory &amp; manager</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-body-sm">
                {users.map((u) => {
                  const menuItems: ActionMenuItem[] = [];
                  if (u.status === USER_STATUS.PENDING) {
                    menuItems.push({
                      label: 'Resend invitation',
                      icon: Send,
                      onSelect: () => void handleResendInvite(u),
                    });
                  }
                  if (u.status === USER_STATUS.ACTIVE && u.id !== user?.id) {
                    menuItems.push({
                      label: 'Deactivate account',
                      icon: UserMinus,
                      tone: 'danger',
                      separatorBefore: menuItems.length > 0,
                      onSelect: () => {
                        setDeactError(null);
                        setDeactReason('');
                        setReassignRepId('');
                        setDeactivateTarget(u);
                      },
                    });
                  }

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-surface-container-low/60 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-on-surface">
                          {u.fullName}
                        </div>
                        <div className="text-caption text-on-surface-variant">
                          {u.email} ·{' '}
                          <span className="tabular-nums">{u.employeeCode}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-surface-container text-on-surface text-caption font-medium">
                          {u.role?.name ?? 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-on-surface">
                          {u.territory ?? 'Headquarters'}
                        </div>
                        <div className="text-caption text-on-surface-variant">
                          {u.manager
                            ? `Reports to ${u.manager.fullName}`
                            : 'Direct'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {menuItems.length > 0 ? (
                          <ActionMenu
                            ariaLabel={`Actions for ${u.fullName}`}
                            items={menuItems}
                          />
                        ) : (
                          <span className="text-caption text-on-surface-variant">
                            {u.id === user?.id ? 'You' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* SECTION 2: ROLES & PERMISSIONS */}
      {activeTab === 'roles' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Roles &amp; permissions
              </h2>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Select a role to view or customize the permissions enforced by
                the API.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              disabled={roleSaving || draftPermKeys.length === 0}
              onClick={() => void handleSaveRolePermissions()}
            >
              <Save className="w-4 h-4" />
              {roleSaving ? 'Saving...' : 'Save permissions'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {roles.map((r) => {
              const selected = r.id === selectedRoleId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRole(r)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-colors cursor-pointer bg-surface-container-lowest',
                    selected
                      ? 'border-secondary ring-2 ring-secondary/15'
                      : 'border-hairline hover:bg-surface-container-low',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label-lg font-semibold text-on-surface">
                      {r.name}
                    </span>
                    <span className="text-caption text-on-surface-variant tabular-nums">
                      Tier {r.tier}
                    </span>
                  </div>
                  <p className="text-caption text-on-surface-variant mt-1 line-clamp-2">
                    {r.description}
                  </p>
                  <p className="text-caption font-medium text-secondary mt-3 tabular-nums">
                    {selected ? draftPermKeys.length : r.permissionKeys.length}{' '}
                    enabled permissions
                  </p>
                </button>
              );
            })}
          </div>

          <div className="space-y-5">
            {permissionsByModule.map(([modName, modPerms]) => (
              <div
                key={modName}
                className="bg-surface-container-lowest rounded-xl border border-hairline p-4 sm:p-5 space-y-3"
              >
                <h3 className="text-label-md font-semibold text-on-surface uppercase tracking-wider">
                  {modName}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {modPerms.map((perm) => {
                    const checked = draftPermKeys.includes(perm.key);
                    return (
                      <label
                        key={perm.id}
                        className={cn(
                          'p-3 rounded-lg border flex items-start justify-between gap-3 cursor-pointer transition-colors',
                          checked
                            ? 'border-secondary/35 bg-secondary-fixed/25'
                            : 'border-hairline hover:bg-surface-container-low',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-caption font-semibold text-on-surface">
                              {perm.key}
                            </code>
                            {perm.isElevated ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-medium">
                                Elevated
                              </span>
                            ) : null}
                          </div>
                          <p className="text-caption text-on-surface-variant mt-0.5">
                            {perm.description}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDraftPerm(perm.key)}
                          className="mt-0.5 w-4 h-4 accent-secondary shrink-0"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* SECTION 3: VISIT POLICIES */}
      {activeTab === 'policies' && settings ? (
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="space-y-6 max-w-3xl"
        >
          <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Check-in &amp; geofence thresholds
              </h2>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Configure default distance tolerances and timing buffers for
                field visits.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                label="Geofence radius (m)"
                htmlFor="gov-radius"
                hint="25–5000"
              >
                <Input
                  id="gov-radius"
                  type="number"
                  min={25}
                  max={5000}
                  value={settings.defaultGeofenceRadiusMeters}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultGeofenceRadiusMeters: Number(e.target.value),
                    })
                  }
                />
              </FormField>

              <FormField
                label="Early check-in buffer (min)"
                htmlFor="gov-buffer"
              >
                <Input
                  id="gov-buffer"
                  type="number"
                  min={0}
                  max={240}
                  value={settings.checkInBufferMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      checkInBufferMinutes: Number(e.target.value),
                    })
                  }
                />
              </FormField>

              <FormField
                label="Target visit duration (min)"
                htmlFor="gov-min-dur"
              >
                <Input
                  id="gov-min-dur"
                  type="number"
                  min={0}
                  max={480}
                  value={settings.minimumVisitDurationMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minimumVisitDurationMinutes: Number(e.target.value),
                    })
                  }
                />
              </FormField>
            </div>

            <div className="space-y-3 pt-2 border-t border-hairline">
              <label className="flex items-start justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <p className="text-label-md font-medium text-on-surface">
                    Verify GPS distance on check-in
                  </p>
                  <p className="text-caption text-on-surface-variant">
                    Checks employee coordinates against the customer site
                    radius.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enforceGeofenceOnCheckIn}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      enforceGeofenceOnCheckIn: e.target.checked,
                    })
                  }
                  className="mt-1 w-4 h-4 accent-secondary"
                />
              </label>

              <label className="flex items-start justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <p className="text-label-md font-medium text-on-surface">
                    Allow off-site check-in with written reason
                  </p>
                  <p className="text-caption text-on-surface-variant">
                    Lets employees check in outside the geofence if they provide
                    an explanation.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowGeofenceOverrideWithReason}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      allowGeofenceOverrideWithReason: e.target.checked,
                    })
                  }
                  className="mt-1 w-4 h-4 accent-secondary"
                />
              </label>
            </div>
          </div>

          {/* Clearly Separated Sensitive / High-Impact Policy */}
          <div className="bg-surface-container-lowest rounded-xl border border-amber-200 p-5 sm:p-6 space-y-3">
            <div>
              <h3 className="text-headline-sm font-semibold text-on-surface">
                Sensitive governance controls
              </h3>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Additional verification for unlocking completed meeting records.
              </p>
            </div>

            <label className="flex items-start justify-between gap-4 pt-1 cursor-pointer">
              <div>
                <p className="text-label-md font-medium text-on-surface">
                  Require manager PIN when reopening completed meetings
                </p>
                <p className="text-caption text-on-surface-variant">
                  Requires secondary PIN verification alongside the mandatory
                  reopen reason.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.requireManagerPinOnReopen}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    requireManagerPinOnReopen: e.target.checked,
                  })
                }
                className="mt-1 w-4 h-4 accent-secondary"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={settingsSaving}>
              <Save className="w-4 h-4" />
              {settingsSaving ? 'Saving...' : 'Save visit rules'}
            </Button>
          </div>
        </form>
      ) : null}

      {/* SECTION 4: ORGANIZATION & ALERTS */}
      {activeTab === 'organization' && settings ? (
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="space-y-6 max-w-3xl"
        >
          <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Organization profile
              </h2>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Workspace display name and default scheduling timezone.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Organization name" htmlFor="org-name" required>
                <Input
                  id="org-name"
                  required
                  value={settings.organizationName}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      organizationName: e.target.value,
                    })
                  }
                />
              </FormField>

              <FormField label="Default timezone" htmlFor="org-tz">
                <SelectField
                  id="org-tz"
                  value={settings.defaultTimezone}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultTimezone: e.target.value,
                    })
                  }
                  className="w-full"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">
                    America/New_York (EST/EDT)
                  </option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </SelectField>
              </FormField>

              <FormField label="Default currency" htmlFor="org-currency">
                <SelectField
                  id="org-currency"
                  value={settings.defaultCurrency ?? 'INR'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultCurrency: e.target.value as
                        | 'INR'
                        | 'USD'
                        | 'EUR'
                        | 'GBP',
                    })
                  }
                  className="w-full"
                >
                  <option value="INR">INR (₹ — Indian Rupee)</option>
                  <option value="USD">USD ($ — US Dollar)</option>
                  <option value="EUR">EUR (€ — Euro)</option>
                  <option value="GBP">GBP (£ — British Pound)</option>
                </SelectField>
              </FormField>

              <FormField
                label="Outbound Gmail / SMTP sender email"
                htmlFor="org-smtp-email"
                hint="Pairs with SMTP_PASS in .env for real Gmail delivery"
              >
                <Input
                  id="org-smtp-email"
                  type="email"
                  placeholder="yourname@gmail.com"
                  value={settings.smtpSenderEmail ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      smtpSenderEmail: e.target.value,
                    })
                  }
                />
              </FormField>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-hairline p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Follow-up reminders &amp; escalations
              </h2>
              <p className="text-caption text-on-surface-variant mt-0.5">
                Configure lead reminders and overdue task notifications.
              </p>
            </div>

            <FormField
              label="Reminder lead window (hours before due)"
              htmlFor="notif-hours"
              className="max-w-xs"
            >
              <Input
                id="notif-hours"
                type="number"
                min={1}
                max={168}
                value={settings.followUpReminderHoursBefore}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    followUpReminderHoursBefore: Number(e.target.value),
                  })
                }
              />
            </FormField>

            <label className="flex items-start justify-between gap-4 pt-2 border-t border-hairline cursor-pointer">
              <div>
                <p className="text-label-md font-medium text-on-surface">
                  Notify sales managers on overdue follow-ups
                </p>
                <p className="text-caption text-on-surface-variant">
                  Sends in-app notifications when employee tasks pass their due
                  date.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableSlaEscalationAlerts}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    enableSlaEscalationAlerts: e.target.checked,
                  })
                }
                className="mt-1 w-4 h-4 accent-secondary"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={settingsSaving}>
              <Save className="w-4 h-4" />
              {settingsSaving ? 'Saving...' : 'Save organization settings'}
            </Button>
          </div>
        </form>
      ) : null}

      {/* SECTION 5: AUDIT LOGS */}
      {activeTab === 'audit' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-headline-sm font-semibold text-on-surface">
                Audit logs
              </h2>
              {chainIntegrity ? (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-md text-caption font-medium',
                    chainIntegrity.valid
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-error-container text-error',
                  )}
                >
                  {chainIntegrity.valid
                    ? `SHA-256 chain verified (${chainIntegrity.checkedCount})`
                    : 'Chain integrity alert'}
                </span>
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadAllGovernanceData()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>

          <FilterToolbar
            searchPlaceholder="Search action, code, or reason..."
            searchValue={auditSearch}
            onSearchChange={setAuditSearch}
            hasActiveFilters={Boolean(auditEntityFilter)}
            onReset={() => {
              setAuditSearch('');
              setAuditEntityFilter('');
            }}
          >
            <SelectField
              aria-label="Filter audit logs by entity"
              value={auditEntityFilter}
              onChange={(e) => setAuditEntityFilter(e.target.value)}
            >
              <option value="">All entities</option>
              <option value="MEETING">Meeting</option>
              <option value="VISIT_SESSION">Visit session</option>
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="USER">User</option>
              <option value="ROLE">Role</option>
              <option value="SYSTEM_SETTING">System setting</option>
            </SelectField>
          </FilterToolbar>

          <div className="bg-surface-container-lowest rounded-xl border border-hairline overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-hairline text-caption font-medium text-on-surface-variant">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-3">Actor</th>
                  <th className="py-3 px-3">Reason</th>
                  <th className="py-3 px-4 text-right">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-body-sm">
                {auditLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-surface-container-low/60 transition-colors"
                  >
                    <td className="py-3 px-4 tabular-nums">
                      <div className="font-medium text-on-surface">
                        {format(
                          new Date(log.createdAt),
                          'dd MMM yyyy, HH:mm:ss',
                        )}
                      </div>
                      <div className="text-caption text-on-surface-variant font-mono">
                        {log.auditCode}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface text-caption font-medium">
                        {log.action}
                      </span>
                      <div className="text-caption text-on-surface-variant mt-0.5">
                        {log.entityType}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-on-surface">
                        {log.actorName}
                      </div>
                      <div className="text-caption text-on-surface-variant">
                        {log.actorRole}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-caption text-on-surface-variant max-w-[260px]">
                      {log.reason ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-caption text-on-surface-variant">
                      {log.integrityHash.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Invite User SlideDrawer (Secure Invitation-Based Onboarding) */}
      <SlideDrawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite user"
        subtitle="Generate a single-use, 72-hour onboarding link so the employee can set their own password and activate their account."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="invite-user-form"
              variant="primary"
              disabled={isInviting}
            >
              <Send className="w-4 h-4" />
              {isInviting ? 'Creating invite...' : 'Send invitation'}
            </Button>
          </div>
        }
      >
        <form
          id="invite-user-form"
          onSubmit={handleSubmitInvite(onInviteUser)}
          noValidate
          className="space-y-4"
        >
          {inviteError ? (
            <StatusBanner tone="error" message={inviteError} />
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="First name"
              htmlFor="inv-first"
              required
              error={inviteErrors.firstName?.message}
            >
              <Input
                id="inv-first"
                aria-invalid={Boolean(inviteErrors.firstName)}
                placeholder="Ananya"
                {...registerInvite('firstName')}
              />
            </FormField>

            <FormField
              label="Last name"
              htmlFor="inv-last"
              required
              error={inviteErrors.lastName?.message}
            >
              <Input
                id="inv-last"
                aria-invalid={Boolean(inviteErrors.lastName)}
                placeholder="Iyer"
                {...registerInvite('lastName')}
              />
            </FormField>
          </div>

          <FormField
            label="Work email"
            htmlFor="inv-email"
            required
            error={inviteErrors.email?.message}
          >
            <Input
              id="inv-email"
              type="email"
              aria-invalid={Boolean(inviteErrors.email)}
              placeholder="ananya.iyer@optronix.com"
              {...registerInvite('email')}
            />
          </FormField>

          <FormField
            label="Phone number"
            htmlFor="inv-phone"
            hint="Optional"
            error={inviteErrors.phone?.message}
          >
            <Input
              id="inv-phone"
              type="tel"
              aria-invalid={Boolean(inviteErrors.phone)}
              placeholder="+91 98100 54321"
              {...registerInvite('phone')}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Assigned role"
              htmlFor="inv-role"
              required
              error={inviteErrors.roleCode?.message}
            >
              <SelectField
                id="inv-role"
                {...registerInvite('roleCode')}
                className="w-full"
              >
                <option value={ROLE_CODES.SALES_EMPLOYEE}>
                  Sales Employee
                </option>
                <option value={ROLE_CODES.SALES_MANAGER}>Sales Manager</option>
                <option value={ROLE_CODES.ADMIN}>Administrator</option>
              </SelectField>
            </FormField>

            <FormField label="Reporting manager" htmlFor="inv-mgr">
              <SelectField
                id="inv-mgr"
                {...registerInvite('managerId', {
                  setValueAs: (v: string) => (v === '' ? undefined : v),
                })}
                className="w-full"
              >
                <option value="">None / direct</option>
                {managersList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </SelectField>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Territory"
              htmlFor="inv-territory"
              error={inviteErrors.territory?.message}
            >
              <Input
                id="inv-territory"
                placeholder="Bengaluru & South"
                {...registerInvite('territory')}
              />
            </FormField>

            <FormField
              label="Department"
              htmlFor="inv-dept"
              error={inviteErrors.department?.message}
            >
              <Input id="inv-dept" {...registerInvite('department')} />
            </FormField>
          </div>
        </form>
      </SlideDrawer>

      {/* Destructive Operation: Deactivate User Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deactivateTarget)}
        onClose={() => {
          setDeactivateTarget(null);
          setDeactError(null);
        }}
        tone="danger"
        icon={UserMinus}
        title="Deactivate user account"
        description={
          deactivateTarget
            ? `Deactivating ${deactivateTarget.fullName} (${deactivateTarget.employeeCode}) immediately revokes active sessions and blocks sign-in.`
            : undefined
        }
        confirmLabel="Deactivate account"
        confirmDisabled={deactReason.trim().length < 5}
        isSubmitting={deactSubmitting}
        onConfirm={() => void handleConfirmDeactivate()}
      >
        <div className="space-y-3.5">
          {deactError ? (
            <StatusBanner tone="error" message={deactError} />
          ) : null}

          <FormField
            label="Reassign open meetings & follow-ups"
            htmlFor="deact-reassign"
            hint="Optional"
          >
            <SelectField
              id="deact-reassign"
              value={reassignRepId}
              onChange={(e) => setReassignRepId(e.target.value)}
              className="w-full"
            >
              <option value="">Keep current owner</option>
              {activeUsersForReassign.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.employeeCode})
                </option>
              ))}
            </SelectField>
          </FormField>

          <FormField
            label="Reason for deactivation"
            htmlFor="deact-reason"
            required
            hint="Min. 5 characters"
          >
            <Textarea
              id="deact-reason"
              rows={3}
              placeholder="Explain why access is being revoked..."
              value={deactReason}
              onChange={(e) => setDeactReason(e.target.value)}
            />
          </FormField>
        </div>
      </ConfirmModal>
    </div>
  );
}
