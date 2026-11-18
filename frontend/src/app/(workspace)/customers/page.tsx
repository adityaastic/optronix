'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  BellRing,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Eye,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  CUSTOMER_STATUS,
  CUSTOMER_TIER,
  PERMISSIONS,
  contactInputSchema,
  createCustomerSchema,
  type ContactInput,
  type CreateCustomerInput,
} from '@/shared';
import { formatCurrencyAmount, useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type {
  AssignableUser,
  CustomerDossier,
  CustomerListItem,
} from '@/lib/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/ActionMenu';
import {
  FormField,
  StatusBanner,
  useUnsavedChangesWarning,
} from '@/components/shared/FormField';
import { GeofenceMap } from '@/components/shared/GeofenceMap';
import { KpiCard } from '@/components/shared/KpiCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { FilterToolbar } from '@/components/shared/FilterToolbar';
import { ConfirmModal, SlideDrawer } from '@/components/shared/ConfirmModal';
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
} from '@/components/shared/FeedbackStates';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type ProfileTab = 'overview' | 'meetings' | 'contacts' | 'followups';

export default function CustomersPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const tenantCurrency = user?.tenantSettings?.defaultCurrency ?? 'INR';
  const canUpdateCustomer = hasPermission(PERMISSIONS.CUSTOMERS_UPDATE);
  const canArchiveCustomer = hasPermission(PERMISSIONS.CUSTOMERS_ARCHIVE);

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    newThisMonth: 0,
    customersWithFollowUps: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Customer Profile Drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<CustomerDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Add Customer Drawer
  const [addOpen, setAddOpen] = useState(false);
  const [assignableReps, setAssignableReps] = useState<AssignableUser[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [pinnedCoordsLabel, setPinnedCoordsLabel] = useState<string | null>(
    null,
  );
  const [geoMatches, setGeoMatches] = useState<
    Array<{ displayName: string; latitude: number; longitude: number }>
  >([]);

  // Archive Confirmation Modal
  const [archiveTarget, setArchiveTarget] = useState<CustomerListItem | null>(
    null,
  );
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const loadCustomers = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch<
          {
            customers: CustomerListItem[];
            stats: typeof stats;
          },
          typeof pagination
        >('/customers', {
          query: {
            page,
            limit: 15,
            search: search || undefined,
            status: statusFilter || undefined,
            tier: tierFilter || undefined,
          },
        });
        setCustomers(res.data.customers);
        setStats(res.data.stats);
        if (res.meta) setPagination(res.meta);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load customers.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [search, statusFilter, tierFilter],
  );

  useEffect(() => {
    void loadCustomers(1);
  }, [loadCustomers]);

  useEffect(() => {
    void apiFetch<{ users: AssignableUser[] }>('/users/assignable')
      .then((res) => setAssignableReps(res.data.users))
      .catch(() => undefined);
  }, []);

  const loadDossier = useCallback(async (id: string) => {
    setDossierLoading(true);
    try {
      const res = await apiFetch<{ customer: CustomerDossier }>(
        `/customers/${id}`,
      );
      setDossier(res.data.customer);
    } catch {
      setDossier(null);
    } finally {
      setDossierLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      void loadDossier(selectedId);
    } else {
      setDossier(null);
      setAddContactOpen(false);
      setContactError(null);
    }
  }, [selectedId, loadDossier]);

  // Create Customer Form
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      companyName: '',
      website: '',
      industry: 'Cloud Infrastructure',
      tier: CUSTOMER_TIER.ENTERPRISE_T1,
      status: CUSTOMER_STATUS.ACTIVE,
      address: {
        street: '',
        city: 'Gurugram',
        state: 'Haryana',
        postalCode: '',
        country: 'India',
        geofenceRadiusMeters: 100,
        coordinates: {
          latitude: 28.495,
          longitude: 77.089,
        },
      },
      primaryContact: {
        fullName: '',
        designation: '',
        email: '',
        phone: '',
        isPrimary: true,
      },
      strategicNotes: '',
    },
  });

  const watchedCoords = watch('address.coordinates');
  const watchedRadius = watch('address.geofenceRadiusMeters');
  const watchedCompany = watch('companyName');

  useUnsavedChangesWarning(addOpen && isDirty);

  // Add Contact Form
  const {
    register: registerContact,
    handleSubmit: handleSubmitContact,
    reset: resetContact,
    formState: { errors: contactErrors, isSubmitting: isAddingContact },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactInputSchema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: {
      fullName: '',
      designation: '',
      email: '',
      phone: '',
      isPrimary: false,
    },
  });

  const onCreateCustomer = async (values: CreateCustomerInput) => {
    setFormError(null);
    try {
      const res = await apiFetch<{ customer: CustomerDossier }>('/customers', {
        method: 'POST',
        body: values,
      });
      setAddOpen(false);
      reset();
      setBannerMessage(
        `${res.data.customer.companyName} added to the customer directory.`,
      );
      await loadCustomers(1);
      setProfileTab('overview');
      setSelectedId(res.data.customer.id);
    } catch (err) {
      setFormError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to create customer. Your input has been preserved.',
      );
    }
  };

  const onAddContact = async (values: ContactInput) => {
    if (!selectedId) return;
    setContactError(null);
    try {
      await apiFetch(`/customers/${selectedId}/contacts`, {
        method: 'POST',
        body: values,
      });
      resetContact();
      setAddContactOpen(false);
      await loadDossier(selectedId);
      await loadCustomers(pagination.page);
    } catch (err) {
      setContactError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to add contact. Please verify the fields.',
      );
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget || archiveReason.trim().length < 5) return;
    setArchiveError(null);
    setIsArchiving(true);
    try {
      await apiFetch(`/customers/${archiveTarget.id}/archive`, {
        method: 'POST',
        body: { reason: archiveReason.trim() },
      });
      const archivedName = archiveTarget.companyName;
      if (selectedId === archiveTarget.id) {
        setSelectedId(null);
      }
      setArchiveTarget(null);
      setArchiveReason('');
      setBannerMessage(`${archivedName} has been archived.`);
      await loadCustomers(pagination.page);
    } catch (err) {
      setArchiveError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to archive customer.',
      );
    } finally {
      setIsArchiving(false);
    }
  };

  const columns = useMemo<ColumnDef<CustomerListItem>[]>(
    () => [
      {
        header: 'Company',
        accessorKey: 'companyName',
        cell: ({ row }) => (
          <div className="flex flex-col min-w-[180px]">
            <span className="font-medium text-on-surface">
              {row.original.companyName}
            </span>
            <span className="text-caption text-on-surface-variant">
              {row.original.address.city} · {row.original.customerCode}
            </span>
          </div>
        ),
      },
      {
        header: 'Primary contact',
        id: 'primaryContact',
        cell: ({ row }) => {
          const ct = row.original.primaryContact;
          return ct ? (
            <div className="flex flex-col">
              <span className="text-body-sm text-on-surface">{ct.fullName}</span>
              <span className="text-caption text-on-surface-variant">
                {ct.designation || ct.email}
              </span>
            </div>
          ) : (
            <span className="text-on-surface-variant">—</span>
          );
        },
      },
      {
        header: 'Industry',
        accessorKey: 'industry',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-body-sm text-on-surface">
              {row.original.industry}
            </span>
            <span className="text-caption text-on-surface-variant">
              {row.original.tier.replace(/_/g, ' ')}
            </span>
          </div>
        ),
      },
      {
        header: 'Owner',
        id: 'assignedRep',
        cell: ({ row }) => (
          <span className="text-body-sm text-on-surface">
            {row.original.assignedRep?.fullName ?? 'Unassigned'}
          </span>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const items: ActionMenuItem[] = [
            {
              label: 'View profile',
              icon: Eye,
              onSelect: () => {
                setProfileTab('overview');
                setSelectedId(row.original.id);
              },
            },
            {
              label: 'Schedule meeting',
              icon: CalendarPlus,
              onSelect: () =>
                router.push(`/meetings/new?customerId=${row.original.id}`),
            },
          ];
          if (canArchiveCustomer) {
            items.push({
              label: 'Archive customer',
              icon: Archive,
              tone: 'danger',
              separatorBefore: true,
              onSelect: () => {
                setArchiveError(null);
                setArchiveReason('');
                setArchiveTarget(row.original);
              },
            });
          }
          return (
            <div className="flex justify-end">
              <ActionMenu
                ariaLabel={`Actions for ${row.original.companyName}`}
                items={items}
              />
            </div>
          );
        },
      },
    ],
    [canArchiveCustomer, router],
  );

  if (isLoading && customers.length === 0 && !search && !statusFilter && !tierFilter) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Customers"
        description="Manage customer accounts, contacts, and meeting history."
        actions={
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setFormError(null);
              setAddOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Add customer
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

      {error ? (
        <ErrorState message={error} onRetry={() => void loadCustomers(1)} />
      ) : null}

      {/* Focused 3-KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total customers"
          value={stats.totalCustomers}
          icon={Building2}
          badgeText={`+${stats.newThisMonth} this month`}
        />
        <KpiCard
          label="Active accounts"
          value={stats.activeCustomers}
          icon={CheckCircle2}
          badgeTone="success"
          badgeText="Active"
        />
        <KpiCard
          label="Open follow-ups"
          value={stats.customersWithFollowUps}
          icon={BellRing}
          badgeTone={stats.customersWithFollowUps > 0 ? 'warning' : 'default'}
          badgeText="Accounts"
        />
      </div>

      {/* Simple Search & Filters */}
      <FilterToolbar
        searchPlaceholder="Search by company, code, or city..."
        searchValue={search}
        onSearchChange={setSearch}
        hasActiveFilters={Boolean(statusFilter || tierFilter)}
        onReset={() => {
          setSearch('');
          setStatusFilter('');
          setTierFilter('');
        }}
      >
        <SelectField
          aria-label="Filter by tier"
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
        >
          <option value="">All tiers</option>
          <option value="ENTERPRISE_T1">Enterprise Tier 1</option>
          <option value="MID_MARKET">Mid-Market</option>
          <option value="SMB">SMB</option>
          <option value="GOV">Government</option>
        </SelectField>

        <SelectField
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PROSPECT">Prospect</option>
          <option value="AT_RISK">At Risk</option>
        </SelectField>
      </FilterToolbar>

      {/* Clean Full-Width Directory Table */}
      {customers.length === 0 && !isLoading ? (
        <div className="bg-surface-container-lowest rounded-xl border border-hairline">
          <EmptyState
            icon={Building2}
            title="No customers found"
            description="Adjust your search or add a new customer account to schedule field visits."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add customer
              </Button>
            }
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={customers}
          getRowId={(r) => r.id}
          selectedRowId={selectedId}
          onRowClick={(r) => {
            setProfileTab('overview');
            setSelectedId(r.id);
          }}
          isLoading={isLoading}
          pagination={{
            ...pagination,
            onPageChange: (p) => void loadCustomers(p),
          }}
        />
      )}

      {/* Customer Profile Drawer (Meetings, Contacts & Follow-ups Tabs) */}
      <SlideDrawer
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={dossier ? dossier.companyName : 'Customer profile'}
        subtitle={
          dossier
            ? `${dossier.customerCode} · ${dossier.industry} · ${dossier.tier.replace(/_/g, ' ')}`
            : 'Loading account details...'
        }
        footer={
          dossier ? (
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={dossier.status} />
              <Button asChild variant="primary" size="sm">
                <Link href={`/meetings/new?customerId=${dossier.id}`}>
                  <CalendarPlus className="w-4 h-4" />
                  Schedule meeting
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      >
        {dossierLoading || !dossier ? (
          <div className="py-10 text-center text-body-sm text-on-surface-variant">
            Loading customer profile...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Clean Tab Navigation */}
            <div
              role="tablist"
              aria-label="Customer profile sections"
              className="flex items-center gap-1 border-b border-hairline pb-2 overflow-x-auto"
            >
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  {
                    id: 'meetings',
                    label: `Meetings (${dossier.meetings.length})`,
                  },
                  {
                    id: 'contacts',
                    label: `Contacts (${dossier.contacts.length})`,
                  },
                  {
                    id: 'followups',
                    label: `Follow-ups (${dossier.followUps.length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={profileTab === tab.id}
                  type="button"
                  onClick={() => setProfileTab(tab.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-label-md transition-colors whitespace-nowrap cursor-pointer',
                    profileTab === tab.id
                      ? 'bg-surface-container text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Overview */}
            {profileTab === 'overview' ? (
              <div className="space-y-5">
                <dl className="grid grid-cols-2 gap-4 text-body-sm">
                  <div>
                    <dt className="text-caption text-on-surface-variant">
                      Annual revenue
                    </dt>
                    <dd className="font-medium text-on-surface tabular-nums mt-0.5">
                      {dossier.annualRevenue
                        ? formatCurrencyAmount(
                            dossier.annualRevenue,
                            tenantCurrency,
                          )
                        : 'Not specified'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-on-surface-variant">
                      Check-in radius
                    </dt>
                    <dd className="font-medium text-on-surface tabular-nums mt-0.5">
                      {dossier.address.geofenceRadiusMeters}m geofence
                    </dd>
                  </div>
                </dl>

                <div className="space-y-2.5 text-body-sm border-t border-hairline pt-4">
                  <div className="flex items-start gap-2.5 text-on-surface-variant">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="text-on-surface">
                      {dossier.address.street}, {dossier.address.city}
                      {dossier.address.state ? `, ${dossier.address.state}` : ''}
                    </span>
                  </div>
                  {dossier.address.coordinates ? (
                    <GeofenceMap
                      targetLocation={dossier.address.coordinates}
                      targetLabel={dossier.companyName}
                      geofenceRadiusMeters={dossier.address.geofenceRadiusMeters}
                      height={175}
                    />
                  ) : null}
                  {dossier.website ? (
                    <div className="flex items-center gap-2.5 text-on-surface-variant">
                      <Globe className="w-4 h-4 shrink-0" />
                      <span className="truncate text-on-surface">
                        {dossier.website}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2.5 text-on-surface-variant">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>
                      Account owner:{' '}
                      <strong className="font-medium text-on-surface">
                        {dossier.assignedRep?.fullName ?? 'Unassigned'}
                      </strong>
                    </span>
                  </div>
                </div>

                {dossier.strategicNotes ? (
                  <div className="border-t border-hairline pt-4 space-y-1">
                    <span className="text-label-sm text-on-surface-variant font-medium">
                      Account notes
                    </span>
                    <p className="text-body-sm text-on-surface leading-relaxed">
                      {dossier.strategicNotes}
                    </p>
                  </div>
                ) : null}

                {dossier.auditLogs.length > 0 ? (
                  <details className="border-t border-hairline pt-4 group">
                    <summary className="text-label-md font-medium text-on-surface-variant hover:text-on-surface cursor-pointer select-none">
                      Activity history ({dossier.auditLogs.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {dossier.auditLogs.map((a) => (
                        <div
                          key={a.id}
                          className="p-2.5 rounded-lg bg-surface-container-low text-caption flex items-center justify-between gap-2"
                        >
                          <span className="font-medium text-on-surface">
                            {a.action}
                          </span>
                          <span className="font-mono text-on-surface-variant">
                            {a.auditCode}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}

            {/* Tab 2: Meetings */}
            {profileTab === 'meetings' ? (
              <div className="space-y-2.5">
                {dossier.meetings.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant py-6 text-center">
                    No meetings scheduled for this customer yet.
                  </p>
                ) : (
                  dossier.meetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="block p-3.5 rounded-xl border border-hairline hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-on-surface truncate">
                          {m.title}
                        </span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="text-caption text-on-surface-variant mt-1 tabular-nums">
                        {format(
                          new Date(m.scheduledStart),
                          'dd MMM yyyy, hh:mm a',
                        )}{' '}
                        · {m.assignedRepName}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            ) : null}

            {/* Tab 3: Contacts */}
            {profileTab === 'contacts' ? (
              <div className="space-y-4">
                {canUpdateCustomer ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setContactError(null);
                        setAddContactOpen((v) => !v);
                      }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {addContactOpen ? 'Cancel' : 'Add contact'}
                    </Button>
                  </div>
                ) : null}

                {addContactOpen ? (
                  <form
                    onSubmit={handleSubmitContact(onAddContact)}
                    noValidate
                    className="p-4 rounded-xl bg-surface-container-low border border-hairline space-y-3"
                  >
                    {contactError ? (
                      <StatusBanner tone="error" message={contactError} />
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        label="Full name"
                        htmlFor="ct-name"
                        required
                        error={contactErrors.fullName?.message}
                      >
                        <Input
                          id="ct-name"
                          aria-invalid={Boolean(contactErrors.fullName)}
                          placeholder="Priya Nair"
                          {...registerContact('fullName')}
                        />
                      </FormField>
                      <FormField
                        label="Role / title"
                        htmlFor="ct-role"
                        error={contactErrors.designation?.message}
                      >
                        <Input
                          id="ct-role"
                          placeholder="Head of Procurement"
                          {...registerContact('designation')}
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        label="Email"
                        htmlFor="ct-email"
                        required
                        error={contactErrors.email?.message}
                      >
                        <Input
                          id="ct-email"
                          type="email"
                          aria-invalid={Boolean(contactErrors.email)}
                          placeholder="priya@company.com"
                          {...registerContact('email')}
                        />
                      </FormField>
                      <FormField
                        label="Phone"
                        htmlFor="ct-phone"
                        required
                        error={contactErrors.phone?.message}
                      >
                        <Input
                          id="ct-phone"
                          type="tel"
                          aria-invalid={Boolean(contactErrors.phone)}
                          placeholder="+91 98100 12345"
                          {...registerContact('phone')}
                        />
                      </FormField>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 text-caption text-on-surface cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-secondary"
                          {...registerContact('isPrimary')}
                        />
                        <span>Set as primary contact</span>
                      </label>
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        disabled={isAddingContact}
                      >
                        {isAddingContact ? 'Saving...' : 'Save contact'}
                      </Button>
                    </div>
                  </form>
                ) : null}

                <div className="space-y-2.5">
                  {dossier.contacts.map((ct) => (
                    <div
                      key={ct.id}
                      className="p-3.5 rounded-xl border border-hairline flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-on-surface">
                          {ct.fullName}
                        </span>
                        {ct.isPrimary ? (
                          <span className="px-2 py-0.5 rounded-md bg-secondary-fixed text-on-secondary-fixed text-caption font-medium">
                            Primary
                          </span>
                        ) : null}
                      </div>
                      <span className="text-caption text-on-surface-variant">
                        {ct.designation || 'Stakeholder'}
                      </span>
                      <div className="flex flex-wrap gap-4 text-caption text-on-surface-variant mt-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" /> {ct.email}
                        </span>
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          <Phone className="w-3.5 h-3.5" /> {ct.phone}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Tab 4: Follow-ups */}
            {profileTab === 'followups' ? (
              <div className="space-y-2.5">
                {dossier.followUps.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant py-6 text-center">
                    No follow-up tasks for this customer.
                  </p>
                ) : (
                  dossier.followUps.map((f) => (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-xl border border-hairline"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-on-surface">
                          {f.title}
                        </span>
                        <StatusBadge status={f.status} />
                      </div>
                      <div className="text-caption text-on-surface-variant mt-1 tabular-nums">
                        Due {format(new Date(f.dueDate), 'dd MMM yyyy')} ·{' '}
                        {f.ownerName}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        )}
      </SlideDrawer>

      {/* Add Customer SlideDrawer */}
      <SlideDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add customer"
        subtitle="Create a customer account, site address, and primary contact."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-customer-form"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Create customer'}
            </Button>
          </div>
        }
      >
        <form
          id="create-customer-form"
          onSubmit={handleSubmit(onCreateCustomer)}
          noValidate
          className="space-y-4"
        >
          {formError ? <StatusBanner tone="error" message={formError} /> : null}

          <FormField
            label="Company name"
            htmlFor="cust-company"
            required
            error={errors.companyName?.message}
          >
            <Input
              id="cust-company"
              aria-invalid={Boolean(errors.companyName)}
              placeholder="Acme Technologies Inc."
              {...register('companyName')}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Industry"
              htmlFor="cust-industry"
              required
              error={errors.industry?.message}
            >
              <Input
                id="cust-industry"
                aria-invalid={Boolean(errors.industry)}
                placeholder="Cloud Security"
                {...register('industry')}
              />
            </FormField>
            <FormField
              label="Account tier"
              htmlFor="cust-tier"
              error={errors.tier?.message}
            >
              <SelectField
                id="cust-tier"
                {...register('tier')}
                className="w-full"
              >
                <option value="ENTERPRISE_T1">Enterprise Tier 1</option>
                <option value="MID_MARKET">Mid-Market</option>
                <option value="SMB">SMB</option>
                <option value="GOV">Government</option>
              </SelectField>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Website"
              htmlFor="cust-website"
              error={errors.website?.message}
            >
              <Input
                id="cust-website"
                placeholder="https://acme-tech.com"
                {...register('website')}
              />
            </FormField>
            <FormField
              label="Annual revenue ($)"
              htmlFor="cust-revenue"
              error={errors.annualRevenue?.message}
            >
              <Input
                id="cust-revenue"
                type="number"
                min={0}
                placeholder="180000"
                {...register('annualRevenue', {
                  setValueAs: (v: string) =>
                    v === '' || Number.isNaN(Number(v)) ? undefined : Number(v),
                })}
              />
            </FormField>
          </div>

          {assignableReps.length > 1 ? (
            <FormField label="Account owner" htmlFor="cust-owner">
              <SelectField
                id="cust-owner"
                {...register('assignedRepId')}
                className="w-full"
              >
                {assignableReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.fullName} ({rep.employeeCode})
                  </option>
                ))}
              </SelectField>
            </FormField>
          ) : null}

          <div className="pt-3 border-t border-hairline space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-label-md font-semibold text-on-surface">
                Location &amp; GPS geofence
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={geocoding}
                  onClick={() => {
                    const st = getValues('address.street')?.trim() ?? '';
                    const ct = getValues('address.city')?.trim() ?? '';
                    const query = `${st} ${ct}`.trim();
                    if (query.length < 3) {
                      setPinnedCoordsLabel('Enter street or city first.');
                      return;
                    }
                    setGeocoding(true);
                    setGeoMatches([]);
                    void apiFetch<{
                      results: Array<{
                        displayName: string;
                        latitude: number;
                        longitude: number;
                      }>;
                    }>('/customers/geocode', { query: { q: query } })
                      .then((res) => {
                        const list = res.data.results ?? [];
                        setGeoMatches(list.slice(0, 3));
                        const top = list[0];
                        if (!top) {
                          setPinnedCoordsLabel(
                            'No map pin found — click directly on the map below to pin.',
                          );
                          return;
                        }
                        setValue(
                          'address.coordinates',
                          {
                            latitude: top.latitude,
                            longitude: top.longitude,
                          },
                          { shouldDirty: true },
                        );
                        setPinnedCoordsLabel(
                          `Pinned: ${top.latitude.toFixed(4)}° N, ${top.longitude.toFixed(4)}° E`,
                        );
                      })
                      .catch(() =>
                        setPinnedCoordsLabel('Geocoding unavailable — click map below to pin.'),
                      )
                      .finally(() => setGeocoding(false));
                  }}
                  className="text-caption font-medium text-secondary hover:underline cursor-pointer"
                >
                  {geocoding ? 'Locating...' : 'Find GPS from address'}
                </button>
                <span className="text-outline-variant">·</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) return;
                    setGeocoding(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const lat = Number(pos.coords.latitude.toFixed(6));
                        const lng = Number(pos.coords.longitude.toFixed(6));
                        setValue(
                          'address.coordinates',
                          {
                            latitude: lat,
                            longitude: lng,
                          },
                          { shouldDirty: true },
                        );
                        setPinnedCoordsLabel(
                          `Pinned live GPS: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
                        );
                        setGeocoding(false);
                      },
                      () => setGeocoding(false),
                    );
                  }}
                  className="text-caption font-medium text-secondary hover:underline cursor-pointer"
                >
                  Use my GPS
                </button>
              </div>
            </div>
            {pinnedCoordsLabel ? (
              <p className="text-caption text-emerald-700 font-medium tabular-nums">
                {pinnedCoordsLabel}
              </p>
            ) : null}
            {geoMatches.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {geoMatches.map((item, idx) => (
                  <button
                    key={`${item.latitude}-${item.longitude}-${idx}`}
                    type="button"
                    onClick={() => {
                      setValue(
                        'address.coordinates',
                        {
                          latitude: item.latitude,
                          longitude: item.longitude,
                        },
                        { shouldDirty: true },
                      );
                      setPinnedCoordsLabel(
                        `Pinned: ${item.displayName.split(',').slice(0, 2).join(',')}`,
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-secondary-fixed/40 border border-hairline text-caption text-on-surface truncate max-w-full cursor-pointer transition-colors"
                  >
                    📍 {item.displayName.split(',').slice(0, 3).join(',')}
                  </button>
                ))}
              </div>
            ) : null}
            {addOpen ? (
              <GeofenceMap
                targetLocation={
                  watchedCoords ?? { latitude: 28.495, longitude: 77.089 }
                }
                targetLabel={watchedCompany?.trim() || 'New customer site'}
                geofenceRadiusMeters={Number(watchedRadius) || 100}
                locating={geocoding}
                locatingText="Locating address on map..."
                interactive
                showDirectionsLink={false}
                height={195}
                onSelectLocation={(coords) => {
                  setValue('address.coordinates', coords, { shouldDirty: true });
                  setPinnedCoordsLabel(
                    `Custom map pin: ${coords.latitude.toFixed(5)}° N, ${coords.longitude.toFixed(5)}° E`,
                  );
                }}
              />
            ) : null}
            <FormField
              label="Street address"
              htmlFor="cust-street"
              required
              error={errors.address?.street?.message}
            >
              <Input
                id="cust-street"
                aria-invalid={Boolean(errors.address?.street)}
                placeholder="Building, street, tech park"
                {...register('address.street')}
              />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                label="City"
                htmlFor="cust-city"
                required
                error={errors.address?.city?.message}
              >
                <Input
                  id="cust-city"
                  aria-invalid={Boolean(errors.address?.city)}
                  placeholder="Gurugram"
                  {...register('address.city')}
                />
              </FormField>
              <FormField
                label="Geofence radius (m)"
                htmlFor="cust-radius"
                error={errors.address?.geofenceRadiusMeters?.message}
              >
                <Input
                  id="cust-radius"
                  type="number"
                  min={25}
                  max={5000}
                  {...register('address.geofenceRadiusMeters', {
                    valueAsNumber: true,
                  })}
                />
              </FormField>
            </div>
          </div>

          <div className="pt-3 border-t border-hairline space-y-3">
            <span className="text-label-md font-semibold text-on-surface block">
              Primary contact
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                label="Full name"
                htmlFor="cust-ct-name"
                required
                error={errors.primaryContact?.fullName?.message}
              >
                <Input
                  id="cust-ct-name"
                  aria-invalid={Boolean(errors.primaryContact?.fullName)}
                  placeholder="Rahul Mehta"
                  {...register('primaryContact.fullName')}
                />
              </FormField>
              <FormField
                label="Title"
                htmlFor="cust-ct-title"
                error={errors.primaryContact?.designation?.message}
              >
                <Input
                  id="cust-ct-title"
                  placeholder="VP Engineering"
                  {...register('primaryContact.designation')}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                label="Email"
                htmlFor="cust-ct-email"
                required
                error={errors.primaryContact?.email?.message}
              >
                <Input
                  id="cust-ct-email"
                  type="email"
                  aria-invalid={Boolean(errors.primaryContact?.email)}
                  placeholder="rahul@acme-tech.com"
                  {...register('primaryContact.email')}
                />
              </FormField>
              <FormField
                label="Phone"
                htmlFor="cust-ct-phone"
                required
                error={errors.primaryContact?.phone?.message}
              >
                <Input
                  id="cust-ct-phone"
                  type="tel"
                  aria-invalid={Boolean(errors.primaryContact?.phone)}
                  placeholder="+91 98765 43210"
                  {...register('primaryContact.phone')}
                />
              </FormField>
            </div>
          </div>

          <FormField
            label="Notes"
            htmlFor="cust-notes"
            hint="Optional"
            error={errors.strategicNotes?.message}
          >
            <Textarea
              id="cust-notes"
              rows={3}
              placeholder="Account context or key goals..."
              {...register('strategicNotes')}
            />
          </FormField>
        </form>
      </SlideDrawer>

      {/* Archive Customer Confirmation Modal */}
      <ConfirmModal
        open={Boolean(archiveTarget)}
        onClose={() => {
          setArchiveTarget(null);
          setArchiveReason('');
          setArchiveError(null);
        }}
        title="Archive customer"
        description={`Archiving ${archiveTarget?.companyName ?? ''} hides it from active scheduling while preserving historical meetings and audit records.`}
        tone="danger"
        icon={Archive}
        confirmLabel="Archive customer"
        confirmDisabled={archiveReason.trim().length < 5}
        isSubmitting={isArchiving}
        onConfirm={() => void handleConfirmArchive()}
      >
        <div className="space-y-3">
          {archiveError ? (
            <StatusBanner tone="error" message={archiveError} />
          ) : null}
          <FormField
            label="Reason for archiving"
            htmlFor="archive-reason"
            required
            hint="Min. 5 characters"
          >
            <Textarea
              id="archive-reason"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Explain why this customer is being archived..."
            />
          </FormField>
        </div>
      </ConfirmModal>
    </div>
  );
}
