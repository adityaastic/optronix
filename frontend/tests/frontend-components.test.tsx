import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Calendar, Plus, UserMinus } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvitationSchema,
  formatDurationClock,
  phoneNumberSchema,
} from '@/shared';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { FilterToolbar } from '@/components/shared/FilterToolbar';
import { FormField, StatusBanner } from '@/components/shared/FormField';
import { KpiCard } from '@/components/shared/KpiCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError, buildQueryString } from '@/lib/api-client';

afterEach(() => {
  cleanup();
});

describe('OPTRONIX Minimal SaaS Design System & Validation Primitives', () => {
  it('builds clean query strings omitting null, undefined, and empty values', () => {
    const qs = buildQueryString({
      page: 2,
      limit: 15,
      status: 'COMPLETED',
      search: '',
      assignedRepId: undefined,
      territory: null,
    });
    expect(qs).toBe('?page=2&limit=15&status=COMPLETED');
    expect(buildQueryString()).toBe('');
  });

  it('preserves structured HTTP status, error code, and details on ApiClientError', () => {
    const err = new ApiClientError(
      422,
      'MEETING_LOCKED_FOR_EDIT',
      'Completed meetings require Manager reopen',
      { meetingCode: 'MTG-001' },
    );
    expect(err.status).toBe(422);
    expect(err.code).toBe('MEETING_LOCKED_FOR_EDIT');
    expect(err.details).toEqual({ meetingCode: 'MTG-001' });
  });

  it('renders accessible StatusBadge with role="status" for lifecycle & onboarding states', () => {
    const { rerender } = render(<StatusBadge status="AWAITING_OUTCOME" />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Awaiting Outcome')).toBeTruthy();

    rerender(<StatusBadge status="REOPENED" />);
    expect(screen.getByText('Reopened')).toBeTruthy();

    rerender(<StatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('renders KpiCard metric value, badge pill, and footer context', () => {
    render(
      <KpiCard
        label="Completion rate"
        value="84.6%"
        icon={Calendar}
        badgeText="With outcome"
        badgeTone="success"
        footerLeft="11 closed"
        footerRight="Verified GPS"
      />,
    );

    expect(screen.getByText('Completion rate')).toBeTruthy();
    expect(screen.getByText('84.6%')).toBeTruthy();
    expect(screen.getByText('With outcome')).toBeTruthy();
    expect(screen.getByText('Verified GPS')).toBeTruthy();
  });

  it('renders PageHeader with title, description, and single primary action', () => {
    const onSchedule = vi.fn();
    render(
      <PageHeader
        title="Meetings"
        description="View and manage customer meetings."
        actions={
          <Button type="button" onClick={onSchedule}>
            <Plus className="w-4 h-4" />
            Schedule meeting
          </Button>
        }
      />,
    );

    expect(screen.getByRole('heading', { name: 'Meetings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Schedule meeting/i }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('renders FormField with accessible label and inline alert error, plus dismissible StatusBanner', () => {
    const onDismiss = vi.fn();
    render(
      <div>
        <StatusBanner
          tone="success"
          message="Profile details saved."
          onDismiss={onDismiss}
        />
        <FormField
          label="Work email"
          htmlFor="work-email"
          required
          error="Enter a valid work email"
        >
          <Input id="work-email" aria-invalid={true} />
        </FormField>
      </div>,
    );

    expect(screen.getByLabelText(/Work email/i)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'Enter a valid work email',
    );
    expect(screen.getByText('Profile details saved.')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Dismiss notification/i }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('supports search clearing and filter reset in FilterToolbar', () => {
    const onSearchChange = vi.fn();
    const onReset = vi.fn();

    render(
      <FilterToolbar
        searchValue="Cyber City"
        onSearchChange={onSearchChange}
        hasActiveFilters={true}
        onReset={onReset}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Clear search/i }));
    expect(onSearchChange).toHaveBeenCalledWith('');

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('enforces confirmDisabled guard and Escape-key dismissal in ConfirmModal', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <ConfirmModal
        open={true}
        onClose={onClose}
        tone="danger"
        icon={UserMinus}
        title="Reopen completed meeting"
        confirmLabel="Confirm & reopen"
        confirmDisabled={true}
        onConfirm={onConfirm}
      >
        <p>Mandatory reason required</p>
      </ConfirmModal>,
    );

    const confirmBtn = screen.getByRole('button', {
      name: /Confirm & reopen/i,
    });
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmModal
        open={true}
        onClose={onClose}
        tone="danger"
        icon={UserMinus}
        title="Reopen completed meeting"
        confirmLabel="Confirm & reopen"
        confirmDisabled={false}
        onConfirm={onConfirm}
      >
        <p>Mandatory reason required</p>
      </ConfirmModal>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Confirm & reopen/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('validates shared phone numbers, invitation password policy, and HH:MM:SS clock formatting', () => {
    expect(formatDurationClock(5280)).toBe('01:28:00');
    expect(phoneNumberSchema.safeParse('+91 98765 43210').success).toBe(true);
    expect(phoneNumberSchema.safeParse('abc-invalid').success).toBe(false);

    const mismatch = acceptInvitationSchema.safeParse({
      token: 'a'.repeat(32),
      password: 'StrongPassword@2026',
      confirmPassword: 'DifferentPassword@2026',
    });
    expect(mismatch.success).toBe(false);

    const validInvite = acceptInvitationSchema.safeParse({
      token: 'a'.repeat(32),
      password: 'StrongPassword@2026',
      confirmPassword: 'StrongPassword@2026',
      phone: '+91 98100 12345',
    });
    expect(validInvite.success).toBe(true);
  });
});
