'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { AlertTriangle, ChevronDown, ChevronUp, MapPin, Phone, Video } from 'lucide-react';
import {
  MEETING_TYPE,
  PRIORITY_LEVEL,
  type MeetingType,
  type PriorityLevel,
} from '@/shared';
import { useAuth } from '@/hooks/use-auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type {
  AssignableUser,
  CustomerDossier,
  CustomerListItem,
} from '@/lib/types';
import { PageSkeleton } from '@/components/shared/FeedbackStates';
import {
  FormField,
  StatusBanner,
  focusFirstInvalidField,
  useUnsavedChangesWarning,
} from '@/components/shared/FormField';
import { GeofenceMap } from '@/components/shared/GeofenceMap';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ConflictItem {
  id: string;
  meetingCode: string;
  title: string;
  customerName: string;
  scheduledStart: string;
  scheduledEnd: string;
}

function ScheduleMeetingFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const preselectedCustomerId = searchParams.get('customerId') ?? '';

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customerDossier, setCustomerDossier] =
    useState<CustomerDossier | null>(null);
  const [reps, setReps] = useState<AssignableUser[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    preselectedCustomerId,
  );
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('Product Demo & Architecture Review');
  const [meetingType, setMeetingType] = useState<MeetingType>(
    MEETING_TYPE.IN_PERSON,
  );
  const [priority, setPriority] = useState<PriorityLevel>(PRIORITY_LEVEL.MEDIUM);
  const [assignedRepId, setAssignedRepId] = useState('');
  const [dateStr, setDateStr] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  );
  const [startTimeStr, setStartTimeStr] = useState('10:00');
  const [endTimeStr, setEndTimeStr] = useState('11:00');
  const [locationText, setLocationText] = useState('');
  const [targetCoords, setTargetCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [geocodingVenue, setGeocodingVenue] = useState(false);
  const [showOptionalNotes, setShowOptionalNotes] = useState(false);
  const [agenda, setAgenda] = useState('');
  const [tagsText, setTagsText] = useState('');

  // Validation & Submission
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useUnsavedChangesWarning(Boolean(title.trim() || agenda.trim()) && !isSubmitting);

  useEffect(() => {
    Promise.all([
      apiFetch<{ customers: CustomerListItem[] }>('/customers', {
        query: { limit: 100 },
      }),
      apiFetch<{ users: AssignableUser[] }>('/users/assignable'),
    ])
      .then(([custRes, repsRes]) => {
        setCustomers(custRes.data.customers);
        setReps(repsRes.data.users);
        if (!selectedCustomerId && custRes.data.customers[0]) {
          setSelectedCustomerId(custRes.data.customers[0].id);
        }
        if (user) {
          setAssignedRepId(user.id);
        }
      })
      .finally(() => setIsBootstrapping(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    void apiFetch<{ customer: CustomerDossier }>(
      `/customers/${selectedCustomerId}`,
    )
      .then((res) => {
        const d = res.data.customer;
        setCustomerDossier(d);
        const primary = d.contacts.find((c) => c.isPrimary) ?? d.contacts[0];
        setContactId(primary?.id ?? '');
        if (meetingType === MEETING_TYPE.IN_PERSON) {
          setLocationText(`${d.address.street}, ${d.address.city}`);
          setTargetCoords(d.address.coordinates ?? null);
        }
      })
      .catch(() => setCustomerDossier(null));
  }, [selectedCustomerId, meetingType]);

  const scheduledDates = useMemo(() => {
    const startIso = new Date(`${dateStr}T${startTimeStr}:00`);
    const endIso = new Date(`${dateStr}T${endTimeStr}:00`);
    const diffMins = Math.round(
      (endIso.getTime() - startIso.getTime()) / 60000,
    );
    return { startIso, endIso, diffMins };
  }, [dateStr, startTimeStr, endTimeStr]);

  useEffect(() => {
    if (
      !assignedRepId ||
      Number.isNaN(scheduledDates.startIso.getTime()) ||
      Number.isNaN(scheduledDates.endIso.getTime()) ||
      scheduledDates.diffMins <= 0
    ) {
      setConflicts([]);
      return;
    }
    void apiFetch<{ conflicts: ConflictItem[] }>('/meetings/conflicts', {
      query: {
        repId: assignedRepId,
        start: scheduledDates.startIso.toISOString(),
        end: scheduledDates.endIso.toISOString(),
      },
    })
      .then((res) => setConflicts(res.data.conflicts))
      .catch(() => setConflicts([]));
  }, [assignedRepId, scheduledDates]);

  const titleError =
    touched.title && title.trim().length < 3
      ? 'Enter a meeting title (at least 3 characters).'
      : null;
  const timeError =
    scheduledDates.diffMins <= 0
      ? 'End time must be after the start time.'
      : null;
  const locationError =
    touched.location &&
    meetingType === MEETING_TYPE.IN_PERSON &&
    locationText.trim().length < 2
      ? 'Enter the visit address or meeting room.'
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ title: true, location: true });
    setErrorMsg(null);

    if (
      !selectedCustomerId ||
      title.trim().length < 3 ||
      scheduledDates.diffMins <= 0 ||
      (meetingType === MEETING_TYPE.IN_PERSON &&
        locationText.trim().length < 2)
    ) {
      focusFirstInvalidField(formRef.current);
      return;
    }

    setIsSubmitting(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await apiFetch<{ meeting: { id: string } }>('/meetings', {
        method: 'POST',
        body: {
          title: title.trim(),
          purpose: purpose.trim(),
          customerId: selectedCustomerId,
          contactId: contactId || undefined,
          assignedRepId: assignedRepId || undefined,
          meetingType,
          priority,
          scheduledStart: scheduledDates.startIso.toISOString(),
          scheduledEnd: scheduledDates.endIso.toISOString(),
          timezone: user?.tenantSettings?.defaultTimezone ?? 'Asia/Kolkata',
          locationText:
            locationText.trim() ||
            (meetingType === MEETING_TYPE.VIRTUAL
              ? 'Virtual video link'
              : 'Phone call'),
          targetCoordinates:
            meetingType === MEETING_TYPE.IN_PERSON && targetCoords
              ? targetCoords
              : undefined,
          agenda: agenda.trim() || undefined,
          tags,
        },
      });
      router.push(`/meetings/${res.data.meeting.id}`);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to schedule meeting.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isBootstrapping) {
    return <PageSkeleton />;
  }

  const selectedCustomerName =
    customers.find((c) => c.id === selectedCustomerId)?.companyName ?? '—';

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <PageHeader
        title="Schedule meeting"
        description="Set up a customer meeting or field visit in a few clear steps."
      />

      {errorMsg ? (
        <StatusBanner
          tone="error"
          message={errorMsg}
          onDismiss={() => setErrorMsg(null)}
        />
      ) : null}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="bg-surface-container-lowest rounded-xl border border-hairline divide-y divide-hairline"
      >
        {/* 1. Customer & Contact */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-sm font-semibold text-on-surface">
              1. Customer &amp; contact
            </h2>
            <Link
              href="/customers"
              className="text-caption text-secondary hover:underline font-medium"
            >
              + New customer
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Customer account" htmlFor="sched-customer" required>
              <SelectField
                id="sched-customer"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </SelectField>
            </FormField>

            <FormField label="Contact person" htmlFor="sched-contact">
              <SelectField
                id="sched-contact"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full"
              >
                {(customerDossier?.contacts ?? []).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.fullName}
                    {ct.designation ? ` · ${ct.designation}` : ''}
                  </option>
                ))}
              </SelectField>
            </FormField>
          </div>
        </section>

        {/* 2. Meeting Details */}
        <section className="p-5 sm:p-6 space-y-4">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            2. Meeting details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Meeting title"
              htmlFor="sched-title"
              required
              error={titleError}
            >
              <Input
                id="sched-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, title: true }))}
                placeholder="e.g. Q4 Enterprise SLA Review"
                aria-invalid={Boolean(titleError)}
                required
              />
            </FormField>

            <FormField label="Purpose" htmlFor="sched-purpose" required>
              <SelectField
                id="sched-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full"
              >
                <option value="Product Demo & Architecture Review">
                  Product demo &amp; review
                </option>
                <option value="Initial Discovery & Qualification">
                  Discovery &amp; qualification
                </option>
                <option value="Commercial Proposal & Pricing">
                  Proposal &amp; pricing
                </option>
                <option value="Executive Renewal & Expansion">
                  Renewal &amp; expansion
                </option>
                <option value="On-Site Technical Audit">
                  On-site technical audit
                </option>
              </SelectField>
            </FormField>
          </div>

          <FormField label="Format">
            <div className="grid grid-cols-3 gap-2.5">
              {[
                {
                  value: MEETING_TYPE.IN_PERSON,
                  label: 'In-person',
                  icon: MapPin,
                },
                {
                  value: MEETING_TYPE.VIRTUAL,
                  label: 'Virtual',
                  icon: Video,
                },
                {
                  value: MEETING_TYPE.PHONE,
                  label: 'Phone',
                  icon: Phone,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = meetingType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMeetingType(opt.value)}
                    className={cn(
                      'h-10 px-3 rounded-lg border text-label-md font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer',
                      active
                        ? 'border-secondary bg-secondary-fixed text-on-secondary-fixed'
                        : 'border-hairline bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </FormField>

          <div>
            <button
              type="button"
              onClick={() => setShowOptionalNotes((v) => !v)}
              className="inline-flex items-center gap-1 text-body-sm text-secondary hover:underline font-medium cursor-pointer"
            >
              {showOptionalNotes ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Hide optional agenda &amp; tags
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Add agenda or tags (optional)
                </>
              )}
            </button>

            {showOptionalNotes ? (
              <div className="mt-3 space-y-3 pt-1">
                <FormField label="Agenda" htmlFor="sched-agenda">
                  <Textarea
                    id="sched-agenda"
                    rows={3}
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    placeholder="Key talking points or preparation notes..."
                  />
                </FormField>
                <FormField
                  label="Tags"
                  htmlFor="sched-tags"
                  hint="Comma-separated"
                >
                  <Input
                    id="sched-tags"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="q4-renewal, enterprise"
                  />
                </FormField>
              </div>
            ) : null}
          </div>
        </section>

        {/* 3. Date, Time & Location */}
        <section className="p-5 sm:p-6 space-y-4">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            3. Date, time &amp; location
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Date" htmlFor="sched-date" required>
              <Input
                id="sched-date"
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Start time" htmlFor="sched-start" required>
              <Input
                id="sched-start"
                type="time"
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
                required
              />
            </FormField>
            <FormField
              label="End time"
              htmlFor="sched-end"
              required
              error={timeError}
            >
              <Input
                id="sched-end"
                type="time"
                value={endTimeStr}
                onChange={(e) => setEndTimeStr(e.target.value)}
                aria-invalid={Boolean(timeError)}
                required
              />
            </FormField>
          </div>

          {conflicts.length > 0 ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-body-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Overlaps with <strong>{conflicts[0]!.title}</strong> (
                {conflicts[0]!.customerName}). You can still schedule if
                intentional.
              </span>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="sched-location"
                className="text-label-md font-medium text-on-surface"
              >
                {meetingType === MEETING_TYPE.IN_PERSON
                  ? 'Visit address *'
                  : 'Meeting link or phone details'}
              </label>
              {meetingType === MEETING_TYPE.IN_PERSON ? (
                <button
                  type="button"
                  disabled={geocodingVenue || locationText.trim().length < 3}
                  onClick={() => {
                    setGeocodingVenue(true);
                    void apiFetch<{
                      results: Array<{ latitude: number; longitude: number }>;
                    }>('/customers/geocode', {
                      query: { q: locationText.trim() },
                    })
                      .then((res) => {
                        const top = res.data.results[0];
                        if (top) {
                          setTargetCoords({
                            latitude: top.latitude,
                            longitude: top.longitude,
                          });
                        }
                      })
                      .catch(() => undefined)
                      .finally(() => setGeocodingVenue(false));
                  }}
                  className="text-caption font-medium text-secondary hover:underline cursor-pointer disabled:opacity-50"
                >
                  {geocodingVenue ? 'Locating on map...' : 'Locate on map'}
                </button>
              ) : null}
            </div>

            <Input
              id="sched-location"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, location: true }))}
              aria-invalid={Boolean(locationError)}
              placeholder={
                meetingType === MEETING_TYPE.IN_PERSON
                  ? 'Customer office address'
                  : 'Google Meet / Zoom link or phone number'
              }
            />
            {locationError ? (
              <p className="text-caption text-error font-medium">
                {locationError}
              </p>
            ) : null}

            {meetingType === MEETING_TYPE.IN_PERSON ? (
              <GeofenceMap
                targetLocation={
                  targetCoords ?? { latitude: 28.495, longitude: 77.089 }
                }
                targetLabel={selectedCustomerName}
                geofenceRadiusMeters={
                  customerDossier?.address.geofenceRadiusMeters ?? 100
                }
                locating={geocodingVenue}
                locatingText="Pinning meeting venue..."
                interactive
                onSelectLocation={(coords) => setTargetCoords(coords)}
                height={180}
              />
            ) : null}
          </div>
        </section>

        {/* 4. Assigned Employee */}
        <section className="p-5 sm:p-6 space-y-4">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            4. Assigned employee
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Owner" htmlFor="sched-rep">
              <SelectField
                id="sched-rep"
                value={assignedRepId}
                onChange={(e) => setAssignedRepId(e.target.value)}
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

            <FormField label="Priority" htmlFor="sched-priority">
              <SelectField
                id="sched-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full"
              >
                <option value={PRIORITY_LEVEL.LOW}>Low</option>
                <option value={PRIORITY_LEVEL.MEDIUM}>Medium</option>
                <option value={PRIORITY_LEVEL.HIGH}>High</option>
                <option value={PRIORITY_LEVEL.CRITICAL}>Critical</option>
              </SelectField>
            </FormField>
          </div>
        </section>

        {/* 5. Review & Confirm */}
        <section className="p-5 sm:p-6 bg-surface-container-low/60 rounded-b-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-body-sm text-on-surface-variant space-y-0.5 tabular-nums">
            <p className="font-medium text-on-surface">
              {selectedCustomerName} ·{' '}
              {scheduledDates.diffMins > 0
                ? `${scheduledDates.diffMins} min`
                : 'Invalid time range'}
            </p>
            <p>
              {dateStr} · {startTimeStr} – {endTimeStr}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <Button asChild type="button" variant="outline">
              <Link href="/meetings">Cancel</Link>
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Scheduling...' : 'Confirm & Schedule Meeting'}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}

export default function ScheduleMeetingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ScheduleMeetingFormContent />
    </Suspense>
  );
}
