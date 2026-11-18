import type {
  CustomerStatus,
  CustomerTier,
  FollowUpStatus,
  MeetingEventType,
  MeetingStatus,
  MeetingType,
  OutcomeType,
  PriorityLevel,
  RoleCode,
  VisitSessionStatus,
} from '@/shared';

export interface AssignableUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  territory: string | null;
  department: string | null;
  roleCode: RoleCode;
  roleName: string;
}

export interface CustomerListItem {
  id: string;
  customerCode: string;
  companyName: string;
  website: string | null;
  industry: string;
  tier: CustomerTier;
  annualRevenue: number | null;
  status: CustomerStatus;
  isArchived: boolean;
  address: {
    street: string;
    city: string;
    state: string | null;
    postalCode: string | null;
    country: string;
    geofenceRadiusMeters: number;
    coordinates: { latitude: number; longitude: number } | null;
  };
  primaryContact: {
    id: string;
    fullName: string;
    designation: string | null;
    email: string;
    phone: string;
  } | null;
  assignedRep: {
    id: string;
    fullName: string;
    email: string;
    employeeCode: string;
    territory: string | null;
  } | null;
  strategicNotes: string | null;
  lastMeetingAt: string | null;
  createdAt: string;
}

export interface CustomerDossier extends Omit<CustomerListItem, 'primaryContact'> {
  archiveReason: string | null;
  contacts: Array<{
    id: string;
    fullName: string;
    designation: string | null;
    email: string;
    phone: string;
    department: string | null;
    isPrimary: boolean;
  }>;
  meetings: Array<{
    id: string;
    meetingCode: string;
    title: string;
    status: MeetingStatus;
    meetingType: MeetingType;
    scheduledStart: string;
    scheduledEnd: string;
    totalActualDurationMinutes: number;
    assignedRepName: string;
  }>;
  followUps: Array<{
    id: string;
    taskCode: string;
    title: string;
    dueDate: string;
    priority: PriorityLevel;
    status: FollowUpStatus;
    ownerName: string;
  }>;
  auditLogs: Array<{
    id: string;
    auditCode: string;
    action: string;
    reason: string | null;
    integrityHash: string;
    createdAt: string;
  }>;
}

export interface MeetingListItem {
  id: string;
  meetingCode: string;
  title: string;
  purpose: string;
  meetingType: MeetingType;
  priority: PriorityLevel;
  status: MeetingStatus;
  originalScheduledStart: string;
  originalScheduledEnd: string;
  scheduledStart: string;
  scheduledEnd: string;
  currentScheduleRevision: number;
  locationText: string;
  agenda: string | null;
  tags: string[];
  visitSessionCount: number;
  completedSessionCount: number;
  totalActualDurationMinutes: number;
  firstCheckInAt: string | null;
  lastCheckOutAt: string | null;
  customer: {
    id: string;
    companyName: string;
    customerCode: string;
    tier: CustomerTier;
    industry: string;
  } | null;
  contact: {
    id: string;
    fullName: string;
    designation: string | null;
    email: string;
    phone: string;
  } | null;
  assignedRep: {
    id: string;
    fullName: string;
    email: string;
    employeeCode: string;
    territory: string | null;
  } | null;
  outcome: {
    id: string;
    outcomeType: OutcomeType;
    summary: string;
  } | null;
  createdAt: string;
}

export interface VisitSessionDto {
  id: string;
  sessionNumber: number;
  scheduleRevisionNumber: number;
  status: VisitSessionStatus;
  checkInAt: string;
  checkInTelemetry: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    distanceFromTargetMeters?: number;
    withinGeofence?: boolean;
    geofenceOverrideReason?: string;
  };
  checkOutAt: string | null;
  checkOutTelemetry: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    distanceFromTargetMeters?: number;
    withinGeofence?: boolean;
  } | null;
  pauseSegments: Array<{
    pausedAt: string;
    resumedAt?: string | null;
    durationMinutes?: number;
    reason?: string;
  }>;
  grossDurationMinutes: number;
  pausedDurationMinutes: number;
  netDurationMinutes: number;
  arrivalNotes: string | null;
  fieldNotes: string | null;
  signatureDataUrl?: string | null;
  createdAt: string;
}

export interface MeetingDetailsDto {
  id: string;
  meetingCode: string;
  title: string;
  purpose: string;
  meetingType: MeetingType;
  priority: PriorityLevel;
  status: MeetingStatus;
  originalScheduledStart: string;
  originalScheduledEnd: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  currentScheduleRevision: number;
  locationText: string;
  targetCoordinates: { latitude: number; longitude: number } | null;
  agenda: string | null;
  tags: string[];
  activeVisitSessionId: string | null;
  visitSessionCount: number;
  completedSessionCount: number;
  totalActualDurationMinutes: number;
  firstCheckInAt: string | null;
  lastCheckOutAt: string | null;
  lockedAt: string | null;
  reopenCount: number;
  lastReopenReason: string | null;
  cancellationReason: string | null;
  customer: {
    id: string;
    companyName: string;
    customerCode: string;
    tier: CustomerTier;
    industry: string;
    website: string | null;
    annualRevenue: number | null;
    status: string;
    address: {
      street: string;
      city: string;
      state: string | null;
      country: string;
      geofenceRadiusMeters: number;
      coordinates: { latitude: number; longitude: number } | null;
    };
  };
  contact: {
    id: string;
    fullName: string;
    designation: string | null;
    email: string;
    phone: string;
    department: string | null;
  } | null;
  assignedRep: {
    id: string;
    fullName: string;
    email: string;
    employeeCode: string;
    territory: string | null;
    phone: string | null;
  };
  schedules: Array<{
    id: string;
    revisionNumber: number;
    scheduledStart: string;
    scheduledEnd: string;
    timezone: string;
    isOriginal: boolean;
    changeReason: string | null;
    changedBy: string;
    createdAt: string;
  }>;
  visitSessions: VisitSessionDto[];
  events: Array<{
    id: string;
    eventType: MeetingEventType;
    fromStatus: MeetingStatus | null;
    toStatus: MeetingStatus;
    actorName: string;
    reason: string | null;
    telemetry: {
      ipAddress?: string;
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number;
      sha256Hash?: string;
    } | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  outcome: {
    id: string;
    version: number;
    outcomeType: OutcomeType;
    summary: string;
    minutes: string | null;
    clientFeedback: string | null;
    commercialSpecs: {
      estimatedValue?: number;
      currency: string;
      targetCloseDate?: string | null;
      productsDiscussed: string[];
    } | null;
    disqualificationReason: string | null;
    competitorNotes: string | null;
    recordedAt: string;
  } | null;
  followUps: Array<{
    id: string;
    taskCode: string;
    title: string;
    description: string | null;
    dueDate: string;
    priority: PriorityLevel;
    status: FollowUpStatus;
    owner: { id: string; fullName: string; employeeCode: string } | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    category: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface OverviewDashboardDto {
  kpis: {
    totalMeetings: number;
    scheduledToday: number;
    inPersonToday: number;
    virtualToday: number;
    completedMeetings: number;
    completionRatePercent: number;
    avgDurationMinutes: number;
    pendingFollowUps: number;
    dueTodayFollowUps: number;
    urgentFollowUps: number;
    conversionRatePercent: number;
  };
  todaysMeetings: Array<{
    id: string;
    meetingCode: string;
    title: string;
    status: MeetingStatus;
    meetingType: MeetingType;
    priority: PriorityLevel;
    locationText: string;
    scheduledStart: string;
    scheduledEnd: string;
    customerName: string;
    customerIndustry: string;
    contactName: string;
    contactDesignation: string;
    repName: string;
    outcomeType: OutcomeType | null;
  }>;
  pendingActionItems: Array<{
    id: string;
    taskCode: string;
    title: string;
    customerName: string;
    dueDate: string;
    priority: PriorityLevel;
    status: FollowUpStatus;
  }>;
  routeStops: Array<{
    id: string;
    meetingCode: string;
    customerName: string;
    locationText: string;
    scheduledStart: string;
    status: MeetingStatus;
    coordinates?: { latitude: number; longitude: number } | null;
    legDistanceKm?: number | null;
  }>;
}
