export const COLORS = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  text: '#111827',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  primary: '#111827',
  primaryText: '#FFFFFF',
  accent: '#2563EB',
  accentSoft: '#EFF6FF',
  accentBorder: '#BFDBFE',
  success: '#059669',
  successSoft: '#ECFDF5',
  successBorder: '#A7F3D0',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  warningBorder: '#FDE68A',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const RADIUS = {
  sm: 8,
  md: 10,
  lg: 12,
  pill: 999,
} as const;

export type BadgeTone = 'neutral' | 'blue' | 'success' | 'warning' | 'danger';

export function resolveStatusTone(status: string): {
  label: string;
  tone: BadgeTone;
} {
  const normalized = (status || '').toUpperCase();
  switch (normalized) {
    case 'COMPLETED':
    case 'ACTIVE':
    case 'INTERESTED':
    case 'PROPOSAL_REQUESTED':
      return {
        label: formatEnumLabel(normalized),
        tone: 'success',
      };
    case 'CONFIRMED':
    case 'CHECKED_IN':
    case 'IN_PROGRESS':
    case 'PROSPECT':
      return {
        label: formatEnumLabel(normalized),
        tone: 'blue',
      };
    case 'PAUSED':
    case 'AWAITING_OUTCOME':
    case 'RESCHEDULED':
    case 'FOLLOW_UP_REQUIRED':
    case 'PENDING':
    case 'AT_RISK':
      return {
        label: formatEnumLabel(normalized),
        tone: 'warning',
      };
    case 'CANCELLED':
    case 'OVERDUE':
    case 'REOPENED':
    case 'INACTIVE':
    case 'NOT_INTERESTED':
    case 'UNABLE_TO_MEET':
      return {
        label: formatEnumLabel(normalized),
        tone: 'danger',
      };
    default:
      return {
        label: formatEnumLabel(normalized || 'Unknown'),
        tone: 'neutral',
      };
  }
}

export function formatEnumLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
