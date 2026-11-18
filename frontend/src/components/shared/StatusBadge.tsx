import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'purple'
  | 'navy';

const TONE_CLASSES: Record<BadgeTone, { pill: string; dot: string }> = {
  neutral: {
    pill: 'bg-gray-100 text-gray-700 border-gray-200/80',
    dot: 'bg-gray-400',
  },
  info: {
    pill: 'bg-blue-50 text-blue-700 border-blue-200/70',
    dot: 'bg-blue-600',
  },
  success: {
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    dot: 'bg-emerald-600',
  },
  warning: {
    pill: 'bg-amber-50 text-amber-800 border-amber-200/70',
    dot: 'bg-amber-500',
  },
  danger: {
    pill: 'bg-red-50 text-red-700 border-red-200/70',
    dot: 'bg-red-600',
  },
  purple: {
    pill: 'bg-violet-50 text-violet-700 border-violet-200/70',
    dot: 'bg-violet-600',
  },
  navy: {
    pill: 'bg-gray-900 text-white border-gray-900',
    dot: 'bg-blue-300',
  },
};

const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  // Meeting Lifecycle
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  CHECKED_IN: { label: 'Checked In', tone: 'info' },
  IN_PROGRESS: { label: 'In Progress', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  AWAITING_OUTCOME: { label: 'Awaiting Outcome', tone: 'warning' },
  RESCHEDULED: { label: 'Rescheduled', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  REOPENED: { label: 'Reopened', tone: 'purple' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },

  // Outcomes
  INTERESTED: { label: 'Interested', tone: 'success' },
  PROPOSAL_REQUESTED: { label: 'Proposal Requested', tone: 'info' },
  FOLLOW_UP_REQUIRED: { label: 'Follow-up Required', tone: 'warning' },
  NOT_INTERESTED: { label: 'Not Interested', tone: 'neutral' },
  UNABLE_TO_MEET: { label: 'Unable to Meet', tone: 'danger' },

  // Follow-ups & Users & Customers
  PENDING: { label: 'Pending', tone: 'neutral' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  PROSPECT: { label: 'Prospect', tone: 'info' },
  AT_RISK: { label: 'At Risk', tone: 'warning' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },

  // Priority
  LOW: { label: 'Low', tone: 'neutral' },
  MEDIUM: { label: 'Medium', tone: 'neutral' },
  HIGH: { label: 'High', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

export interface StatusBadgeProps {
  status: string;
  labelOverride?: string;
  toneOverride?: BadgeTone;
  showDot?: boolean;
  pulseDot?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  labelOverride,
  toneOverride,
  showDot = true,
  pulseDot = false,
  className,
}: StatusBadgeProps) {
  const mapped = STATUS_MAP[status] ?? {
    label: status.replace(/_/g, ' '),
    tone: 'neutral' as BadgeTone,
  };

  const tone = toneOverride ?? mapped.tone;
  const label = labelOverride ?? mapped.label;
  const classes = TONE_CLASSES[tone];

  return (
    <span
      role="status"
      aria-label={`Status: ${label}`}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-caption font-medium whitespace-nowrap',
        classes.pill,
        className,
      )}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            classes.dot,
            pulseDot && 'animate-pulse',
          )}
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
