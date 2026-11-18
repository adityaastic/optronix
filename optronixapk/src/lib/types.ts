import type { RoleCode } from './domain';

export interface SessionUser {
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
  lastLoginAt: string | null;
  role: {
    id: string;
    code: RoleCode;
    name: string;
    tier: number;
  };
  permissions: string[];
  unreadNotificationsCount: number;
  tenantSettings?: {
    organizationName: string;
    defaultTimezone: string;
    defaultCurrency: 'INR' | 'USD' | 'EUR' | 'GBP';
    defaultGeofenceRadiusMeters: number;
  };
  sidebarCounts?: {
    meetings: number;
    followUps: number;
    customers: number;
  };
}

export interface AssignableUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  roleCode: string;
  territory: string | null;
}

export interface DashboardSummaryDto {
  kpis: {
    totalMeetings: number;
    scheduledToday: number;
    completedMeetings: number;
    pendingFollowUps: number;
    completionRatePercent: number;
    avgDurationMinutes: number;
    conversionRatePercent: number;
  };
  todaysMeetings: Array<{
    id: string;
    meetingCode: string;
    title: string;
    status: string;
    meetingType: string;
    priority: string;
    locationText: string;
    scheduledStart: string;
    scheduledEnd: string;
    customerName: string;
    contactName: string;
    repName: string;
  }>;
  pendingActionItems: Array<{
    id: string;
    taskCode: string;
    title: string;
    customerName: string;
    dueDate: string;
    priority: string;
    status: string;
  }>;
  routeStops: Array<{
    id: string;
    meetingCode: string;
    customerName: string;
    locationText: string;
    scheduledStart: string;
    status: string;
    coordinates?: { latitude: number; longitude: number } | null;
    legDistanceKm?: number | null;
  }>;
}

export interface MeetingListItem {
  id: string;
  meetingCode: string;
  title: string;
  purpose: string;
  status: string;
  meetingType: string;
  priority: string;
  scheduledStart: string;
  scheduledEnd: string;
  locationText: string;
  totalActualDurationMinutes: number;
  visitSessionCount: number;
  customer: {
    id: string;
    companyName: string;
    customerCode: string;
    tier: string;
  } | null;
  contact: {
    id: string;
    fullName: string;
    designation?: string;
  } | null;
  assignedRep: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
}

export interface MeetingDetailsDto {
  id: string;
  meetingCode: string;
  title: string;
  purpose: string;
  agenda: string | null;
  status: string;
  meetingType: string;
  priority: string;
  scheduledStart: string;
  scheduledEnd: string;
  originalScheduledStart: string;
  originalScheduledEnd: string;
  locationText: string;
  targetCoordinates?: { latitude: number; longitude: number } | null;
  totalActualDurationMinutes: number;
  visitSessionCount: number;
  completedSessionCount: number;
  reopenCount: number;
  customer: {
    id: string;
    companyName: string;
    customerCode: string;
    industry: string;
    tier: string;
    address: {
      street: string;
      city: string;
      state?: string;
      geofenceRadiusMeters: number;
      coordinates?: { latitude: number; longitude: number } | null;
    };
  };
  contact: {
    id: string;
    fullName: string;
    designation?: string;
    email: string;
    phone: string;
  } | null;
  assignedRep: {
    id: string;
    fullName: string;
    employeeCode: string;
    email: string;
  };
  schedules: Array<{
    id: string;
    revisionNumber: number;
    scheduledStart: string;
    scheduledEnd: string;
    isOriginal: boolean;
    changeReason?: string | null;
  }>;
  visitSessions: Array<{
    id: string;
    sessionNumber: number;
    status: string;
    checkInAt: string;
    checkOutAt: string | null;
    netDurationMinutes: number;
    withinGeofence: boolean;
    distanceFromTargetMeters: number | null;
    fieldNotes?: string | null;
    pauseSegments: Array<{
      pausedAt: string;
      resumedAt?: string | null;
      reason?: string | null;
    }>;
  }>;
  outcome: {
    id: string;
    outcomeType: string;
    summary: string;
    minutes?: string | null;
    disqualificationReason?: string | null;
    commercialSpecs?: {
      estimatedValue?: number;
      currency?: string;
      productsDiscussed?: string[];
    } | null;
  } | null;
  followUps: Array<{
    id: string;
    taskCode: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string;
    ownerName: string;
  }>;
  attachments: Array<{
    id: string;
    originalName: string;
    category: string;
    sizeBytes: number;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorName: string;
    reason?: string | null;
    createdAt: string;
  }>;
}

export interface FollowUpItem {
  id: string;
  taskCode: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate: string;
  customer: {
    id: string;
    companyName: string;
    customerCode: string;
  } | null;
  meeting: {
    id: string;
    meetingCode: string;
    title: string;
  } | null;
  owner: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
  comments?: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
}

export interface CustomerListItem {
  id: string;
  customerCode: string;
  companyName: string;
  industry: string;
  tier: string;
  status: string;
  address: {
    street: string;
    city: string;
    state?: string;
    geofenceRadiusMeters: number;
  };
  primaryContact: {
    id: string;
    fullName: string;
    designation?: string;
    email: string;
    phone: string;
  } | null;
  assignedRep: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
}

export interface CustomerDossier {
  id: string;
  customerCode: string;
  companyName: string;
  website?: string | null;
  industry: string;
  tier: string;
  status: string;
  annualRevenue?: number | null;
  strategicNotes?: string | null;
  address: {
    street: string;
    city: string;
    state?: string;
    geofenceRadiusMeters: number;
  };
  assignedRep: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
  contacts: Array<{
    id: string;
    fullName: string;
    designation?: string;
    email: string;
    phone: string;
    isPrimary: boolean;
  }>;
  meetings: Array<{
    id: string;
    meetingCode: string;
    title: string;
    status: string;
    scheduledStart: string;
    assignedRepName: string;
  }>;
  followUps: Array<{
    id: string;
    taskCode: string;
    title: string;
    status: string;
    dueDate: string;
    ownerName: string;
  }>;
}
