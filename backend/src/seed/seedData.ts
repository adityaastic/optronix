import {
  CUSTOMER_STATUS,
  CUSTOMER_TIER,
  FOLLOW_UP_STATUS,
  MEETING_EVENT_TYPE,
  MEETING_STATUS,
  MEETING_TYPE,
  OUTCOME_TYPE,
  PRIORITY_LEVEL,
  ROLE_CODES,
  USER_STATUS,
  VISIT_SESSION_STATUS,
} from '../shared/index.js';
import { hashPassword, sha256Hex } from '../common/crypto.js';
import { ContactModel } from '../models/Contact.model.js';
import { CustomerModel } from '../models/Customer.model.js';
import { FollowUpTaskModel } from '../models/FollowUpTask.model.js';
import { MeetingEventModel } from '../models/MeetingEvent.model.js';
import { MeetingModel } from '../models/Meeting.model.js';
import { MeetingOutcomeModel } from '../models/MeetingOutcome.model.js';
import { MeetingScheduleModel } from '../models/MeetingSchedule.model.js';
import { UserModel } from '../models/User.model.js';
import { VisitSessionModel } from '../models/VisitSession.model.js';
import { ensureSystemRbacAndSettings } from '../modules/rbac/rbac.service.js';

export const DEFAULT_SEED_PASSWORD = 'Optronix@2026!';

export async function seedCoreUsersAndRbac() {
  const { rolesByCode } = await ensureSystemRbacAndSettings();

  const adminRole = rolesByCode.get(ROLE_CODES.ADMIN)!;
  const managerRole = rolesByCode.get(ROLE_CODES.SALES_MANAGER)!;
  const repRole = rolesByCode.get(ROLE_CODES.SALES_EMPLOYEE)!;

  const defaultPasswordHash = await hashPassword(DEFAULT_SEED_PASSWORD);
  const managerPinHash = await hashPassword('8821');

  // 1. Enterprise Administrator (matches Stitch Screen #12 & #13)
  const admin = await UserModel.findOneAndUpdate(
    { email: 'vikramaditya.roy@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-1001',
        email: 'vikramaditya.roy@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Vikramaditya',
        lastName: 'Roy',
        phone: '+91 98110 10001',
        roleId: adminRole._id,
        territory: 'Global / All India',
        department: 'Enterprise Security & Governance',
        status: USER_STATUS.ACTIVE,
        managerPinHash,
      },
    },
    { upsert: true, new: true },
  );

  // 2. North Hub Sales Manager (matches Stitch Screen #10 & #13)
  const northManager = await UserModel.findOneAndUpdate(
    { email: 'priya.mehta@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-8821',
        email: 'priya.mehta@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Priya',
        lastName: 'Mehta',
        phone: '+91 98110 88210',
        roleId: managerRole._id,
        territory: 'North Regional Hub (DLF CyberCity / NCR)',
        department: 'Enterprise Field Sales',
        status: USER_STATUS.ACTIVE,
        managerPinHash,
      },
    },
    { upsert: true, new: true },
  );

  // 3. Primary Sales Employee (Aditya Sharma - matches Stitch Screens #01..#10 & #13)
  const aditya = await UserModel.findOneAndUpdate(
    { email: 'aditya.sharma@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-4190',
        email: 'aditya.sharma@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Aditya',
        lastName: 'Sharma',
        phone: '+91 98100 41900',
        roleId: repRole._id,
        managerId: northManager._id,
        territory: 'Cyber City & Noida Sector 62',
        department: 'Enterprise Field Sales',
        status: USER_STATUS.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );

  // 4. Team Rep #2 (Rahul Singh - matches Stitch Screen #10)
  const rahul = await UserModel.findOneAndUpdate(
    { email: 'rahul.singh@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-6229',
        email: 'rahul.singh@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Rahul',
        lastName: 'Singh',
        phone: '+91 98100 62290',
        roleId: repRole._id,
        managerId: northManager._id,
        territory: 'Noida Sector 62 & Expressway',
        department: 'Strategic Accounts',
        status: USER_STATUS.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );

  // 5. Team Rep #3 (Amit Verma - matches Stitch Screen #10)
  const amit = await UserModel.findOneAndUpdate(
    { email: 'amit.verma@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-3104',
        email: 'amit.verma@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Amit',
        lastName: 'Verma',
        phone: '+91 98100 31040',
        roleId: repRole._id,
        managerId: northManager._id,
        territory: 'Manesar & Udyog Vihar',
        department: 'Field Sales',
        status: USER_STATUS.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );

  // 6. West Region Sales Employee (outside Priya Mehta's North team - for cross-team RBAC testing)
  const westManager = await UserModel.findOneAndUpdate(
    { email: 'karan.malhotra@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-7100',
        email: 'karan.malhotra@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Karan',
        lastName: 'Malhotra',
        phone: '+91 98200 71000',
        roleId: managerRole._id,
        territory: 'West Regional Hub (Mumbai BKC)',
        department: 'Enterprise Field Sales',
        status: USER_STATUS.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );

  const rohan = await UserModel.findOneAndUpdate(
    { email: 'rohan.desai@optronix.com' },
    {
      $setOnInsert: {
        employeeCode: 'OPT-7205',
        email: 'rohan.desai@optronix.com',
        passwordHash: defaultPasswordHash,
      },
      $set: {
        firstName: 'Rohan',
        lastName: 'Desai',
        phone: '+91 98200 72050',
        roleId: repRole._id,
        managerId: westManager._id,
        territory: 'Mumbai BKC & Lower Parel',
        department: 'Field Sales',
        status: USER_STATUS.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );

  return {
    admin: admin!,
    northManager: northManager!,
    westManager: westManager!,
    aditya: aditya!,
    rahul: rahul!,
    amit: amit!,
    rohan: rohan!,
  };
}

export async function seedSampleDomainData(
  users: Awaited<ReturnType<typeof seedCoreUsersAndRbac>>,
) {
  const existingMtgs = await MeetingModel.countDocuments();
  if (existingMtgs > 0) {
    return;
  }

  const today = new Date();
  const atHour = (h: number, m = 0, dayOffset = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // Seed 4 core Enterprise Accounts matching Stitch screens
  const acme = await CustomerModel.create({
    customerCode: 'CUST-9001',
    companyName: 'Acme Technologies',
    website: 'https://acme-tech.example.com',
    industry: 'Cloud Infrastructure',
    tier: CUSTOMER_TIER.ENTERPRISE_T1,
    annualRevenue: 450000,
    status: CUSTOMER_STATUS.ACTIVE,
    address: {
      street: 'Cyber Hub Tower 10, DLF Phase 2',
      city: 'Gurugram',
      state: 'Haryana',
      postalCode: '122002',
      country: 'India',
      location: { type: 'Point', coordinates: [77.0888, 28.495] },
      geofenceRadiusMeters: 100,
    },
    assignedRepId: users.aditya._id,
    strategicNotes: 'Key Q4 multi-region cloud security expansion account.',
    lastMeetingAt: atHour(9, 30, 0),
    createdBy: users.aditya._id,
  });

  const acmeContact = await ContactModel.create({
    customerId: acme._id,
    fullName: 'Rajesh Kumar',
    designation: 'VP Engineering',
    email: 'rajesh.kumar@acme-tech.example.com',
    phone: '+91 98101 11223',
    department: 'Platform Engineering',
    isPrimary: true,
  });
  acme.primaryContactId = acmeContact._id;
  await acme.save();

  const vertex = await CustomerModel.create({
    customerCode: 'CUST-9004',
    companyName: 'Vertex Systems Ltd.',
    website: 'https://vertex-sys.example.com',
    industry: 'Cloud & Hybrid Storage',
    tier: CUSTOMER_TIER.ENTERPRISE_T1,
    annualRevenue: 180000,
    status: CUSTOMER_STATUS.ACTIVE,
    address: {
      street: 'Vertex Tech Park, Tower B, Sector 62',
      city: 'Noida',
      state: 'Uttar Pradesh',
      postalCode: '201309',
      country: 'India',
      location: { type: 'Point', coordinates: [77.3649, 28.628] },
      geofenceRadiusMeters: 100,
    },
    assignedRepId: users.aditya._id,
    strategicNotes: 'High-intent PoC SLA addendum in technical review.',
    createdBy: users.aditya._id,
  });

  const vertexContact = await ContactModel.create({
    customerId: vertex._id,
    fullName: 'Neha Kapoor',
    designation: 'CTO',
    email: 'neha.kapoor@vertex-sys.example.com',
    phone: '+91 98100 23456',
    department: 'Executive Technology',
    isPrimary: true,
  });
  vertex.primaryContactId = vertexContact._id;
  await vertex.save();

  const nexa = await CustomerModel.create({
    customerCode: 'CUST-9012',
    companyName: 'Nexa Solutions Pvt Ltd',
    website: 'https://nexa.example.com',
    industry: 'FinTech & Payments',
    tier: CUSTOMER_TIER.MID_MARKET,
    annualRevenue: 120000,
    status: CUSTOMER_STATUS.ACTIVE,
    address: {
      street: 'Golf Course Extension Road',
      city: 'Gurugram',
      state: 'Haryana',
      postalCode: '122018',
      country: 'India',
      location: { type: 'Point', coordinates: [77.099, 28.412] },
      geofenceRadiusMeters: 100,
    },
    assignedRepId: users.rahul._id,
    createdBy: users.northManager._id,
  });

  const nexaContact = await ContactModel.create({
    customerId: nexa._id,
    fullName: 'Sarah Jenkins',
    designation: 'Director of Operations',
    email: 'sarah.jenkins@nexa.example.com',
    phone: '+91 98105 77889',
    isPrimary: true,
  });
  nexa.primaryContactId = nexaContact._id;
  await nexa.save();

  const bluewave = await CustomerModel.create({
    customerCode: 'CUST-9021',
    companyName: 'BlueWave Industries',
    website: 'https://bluewave.example.com',
    industry: 'Industrial Automation',
    tier: CUSTOMER_TIER.ENTERPRISE_T1,
    annualRevenue: 420000,
    status: CUSTOMER_STATUS.AT_RISK,
    address: {
      street: 'IMT Manesar Sector 8',
      city: 'Gurugram',
      state: 'Haryana',
      postalCode: '122051',
      country: 'India',
      location: { type: 'Point', coordinates: [76.936, 28.358] },
      geofenceRadiusMeters: 120,
    },
    assignedRepId: users.amit._id,
    createdBy: users.northManager._id,
  });

  const bwContact = await ContactModel.create({
    customerId: bluewave._id,
    fullName: 'Amit Deshmukh',
    designation: 'Managing Director',
    email: 'amit.deshmukh@bluewave.example.com',
    phone: '+91 98188 55443',
    isPrimary: true,
  });
  bluewave.primaryContactId = bwContact._id;
  await bluewave.save();

  // Seed MTG-001 (Completed with Outcome & VisitSession)
  const mtg1Start = atHour(9, 30, 0);
  const mtg1End = atHour(10, 30, 0);
  const mtg1 = await MeetingModel.create({
    meetingCode: 'MTG-001',
    title: 'Zero-Trust Architecture & Renewal Review',
    purpose: 'Executive Renewal & Expansion',
    customerId: acme._id,
    contactId: acmeContact._id,
    assignedRepId: users.aditya._id,
    createdBy: users.aditya._id,
    meetingType: MEETING_TYPE.IN_PERSON,
    priority: PRIORITY_LEVEL.HIGH,
    status: MEETING_STATUS.COMPLETED,
    originalScheduledStart: mtg1Start,
    originalScheduledEnd: mtg1End,
    currentScheduledStart: mtg1Start,
    currentScheduledEnd: mtg1End,
    locationText: 'Cyber Hub Tower 10, Gurugram',
    targetCoordinates: { latitude: 28.495, longitude: 77.0888 },
    agenda: 'Review Q4 multi-region telemetry SLA, pricing tiers, and security sign-off.',
    tags: ['Enterprise', 'Renewal', 'Q4-Priority'],
    visitSessionCount: 1,
    completedSessionCount: 1,
    totalActualDurationMinutes: 52,
    firstCheckInAt: atHour(9, 28, 0),
    lastCheckOutAt: atHour(10, 20, 0),
    lockedAt: atHour(10, 25, 0),
    lockedBy: users.aditya._id,
  });

  const sched1 = await MeetingScheduleModel.create({
    meetingId: mtg1._id,
    revisionNumber: 1,
    scheduledStart: mtg1Start,
    scheduledEnd: mtg1End,
    isOriginal: true,
    changedBy: users.aditya._id,
    changeReason: 'Initial meeting schedule',
  });
  mtg1.currentScheduleId = sched1._id;

  await VisitSessionModel.create({
    meetingId: mtg1._id,
    repId: users.aditya._id,
    scheduleRevisionNumber: 1,
    sessionNumber: 1,
    status: VISIT_SESSION_STATUS.COMPLETED,
    checkInAt: atHour(9, 28, 0),
    checkInTelemetry: {
      latitude: 28.4951,
      longitude: 77.0889,
      accuracyMeters: 4.2,
      distanceFromTargetMeters: 14,
      withinGeofence: true,
    },
    checkOutAt: atHour(10, 20, 0),
    checkOutTelemetry: {
      latitude: 28.4951,
      longitude: 77.0889,
      accuracyMeters: 3.8,
      distanceFromTargetMeters: 14,
      withinGeofence: true,
    },
    grossDurationMinutes: 52,
    pausedDurationMinutes: 0,
    netDurationMinutes: 52,
    fieldNotes: 'VP Engineering approved PoC cluster rollout for December 1.',
    integrityHash: sha256Hex('MTG-001:SESSION-1'),
  });

  const outcome1 = await MeetingOutcomeModel.create({
    meetingId: mtg1._id,
    outcomeType: OUTCOME_TYPE.PROPOSAL_REQUESTED,
    summary: 'Client requested commercial proposal for 3-year multi-region SLA.',
    minutes: 'Confirmed technical fit; procurement needs itemized multi-warehouse discount matrix.',
    clientFeedback: 'Positive alignment on latency and compliance guarantees.',
    commercialSpecs: {
      estimatedValue: 185000,
      currency: 'USD',
      productsDiscussed: ['Optronix Telemetry Core', 'GeoFence Enterprise Suite'],
    },
    recordedBy: users.aditya._id,
    recordedAt: atHour(10, 25, 0),
  });
  mtg1.outcomeId = outcome1._id;
  await mtg1.save();

  await MeetingEventModel.insertMany([
    {
      meetingId: mtg1._id,
      eventType: MEETING_EVENT_TYPE.CREATED,
      fromStatus: null,
      toStatus: MEETING_STATUS.SCHEDULED,
      actorId: users.aditya._id,
    },
    {
      meetingId: mtg1._id,
      eventType: MEETING_EVENT_TYPE.CONFIRMED,
      fromStatus: MEETING_STATUS.SCHEDULED,
      toStatus: MEETING_STATUS.CONFIRMED,
      actorId: users.aditya._id,
    },
    {
      meetingId: mtg1._id,
      eventType: MEETING_EVENT_TYPE.CHECKED_IN,
      fromStatus: MEETING_STATUS.CONFIRMED,
      toStatus: MEETING_STATUS.IN_PROGRESS,
      actorId: users.aditya._id,
    },
    {
      meetingId: mtg1._id,
      eventType: MEETING_EVENT_TYPE.COMPLETED,
      fromStatus: MEETING_STATUS.AWAITING_OUTCOME,
      toStatus: MEETING_STATUS.COMPLETED,
      actorId: users.aditya._id,
    },
  ]);

  // Seed MTG-004 (Confirmed Today - Ready for Check-in on Vertex Systems)
  const mtg4Start = atHour(14, 0, 0);
  const mtg4End = atHour(15, 0, 0);
  const mtg4 = await MeetingModel.create({
    meetingCode: 'MTG-004',
    title: 'Hybrid Storage SLA & Field Architecture Briefing',
    purpose: 'Product Demo & PoC Sign-off',
    customerId: vertex._id,
    contactId: vertexContact._id,
    assignedRepId: users.aditya._id,
    createdBy: users.aditya._id,
    meetingType: MEETING_TYPE.IN_PERSON,
    priority: PRIORITY_LEVEL.HIGH,
    status: MEETING_STATUS.CONFIRMED,
    originalScheduledStart: mtg4Start,
    originalScheduledEnd: mtg4End,
    currentScheduledStart: mtg4Start,
    currentScheduledEnd: mtg4End,
    locationText: 'Vertex Tech Park, Tower B, Sector 62, Noida',
    targetCoordinates: { latitude: 28.628, longitude: 77.3649 },
    agenda: 'On-premise geofence SLA verification, failover architecture walkthrough, and commercial terms.',
    tags: ['Tier-1', 'PoC', 'In-Person'],
  });

  const sched4 = await MeetingScheduleModel.create({
    meetingId: mtg4._id,
    revisionNumber: 1,
    scheduledStart: mtg4Start,
    scheduledEnd: mtg4End,
    isOriginal: true,
    changedBy: users.aditya._id,
    changeReason: 'Initial meeting schedule',
  });
  mtg4.currentScheduleId = sched4._id;
  await mtg4.save();

  // Seed MTG-002 (Scheduled Tomorrow for Aditya)
  const mtg2Start = atHour(11, 0, 1);
  const mtg2End = atHour(12, 0, 1);
  const mtg2 = await MeetingModel.create({
    meetingCode: 'MTG-002',
    title: 'Quarterly Account Security Alignment',
    purpose: 'QBR & Roadmap',
    customerId: acme._id,
    contactId: acmeContact._id,
    assignedRepId: users.aditya._id,
    createdBy: users.northManager._id,
    meetingType: MEETING_TYPE.VIRTUAL,
    priority: PRIORITY_LEVEL.MEDIUM,
    status: MEETING_STATUS.SCHEDULED,
    originalScheduledStart: mtg2Start,
    originalScheduledEnd: mtg2End,
    currentScheduledStart: mtg2Start,
    currentScheduledEnd: mtg2End,
    locationText: 'Google Meet Enterprise Bridge',
    agenda: 'Review Q1 expansion milestones.',
    tags: ['Virtual', 'QBR'],
  });
  const sched2 = await MeetingScheduleModel.create({
    meetingId: mtg2._id,
    revisionNumber: 1,
    scheduledStart: mtg2Start,
    scheduledEnd: mtg2End,
    isOriginal: true,
    changedBy: users.northManager._id,
  });
  mtg2.currentScheduleId = sched2._id;
  await mtg2.save();

  // Seed MTG-005 (Rahul Singh's Meeting - In-team for Priya, inaccessible to Aditya)
  const mtg5Start = atHour(16, 0, 0);
  const mtg5End = atHour(17, 0, 0);
  const mtg5 = await MeetingModel.create({
    meetingCode: 'MTG-005',
    title: 'Payment Gateway Telemetry Discovery',
    purpose: 'Discovery Call',
    customerId: nexa._id,
    contactId: nexaContact._id,
    assignedRepId: users.rahul._id,
    createdBy: users.rahul._id,
    meetingType: MEETING_TYPE.IN_PERSON,
    priority: PRIORITY_LEVEL.MEDIUM,
    status: MEETING_STATUS.CONFIRMED,
    originalScheduledStart: mtg5Start,
    originalScheduledEnd: mtg5End,
    currentScheduledStart: mtg5Start,
    currentScheduledEnd: mtg5End,
    locationText: 'Golf Course Extension Rd, Gurugram',
    targetCoordinates: { latitude: 28.412, longitude: 77.099 },
    tags: ['FinTech'],
  });
  const sched5 = await MeetingScheduleModel.create({
    meetingId: mtg5._id,
    revisionNumber: 1,
    scheduledStart: mtg5Start,
    scheduledEnd: mtg5End,
    isOriginal: true,
    changedBy: users.rahul._id,
  });
  mtg5.currentScheduleId = sched5._id;
  await mtg5.save();

  // Seed Follow-up Tasks
  await FollowUpTaskModel.insertMany([
    {
      taskCode: 'FUP-101',
      title: 'Send customized pricing matrix & PoC SLA addendum',
      description: 'Include multi-warehouse volume discount tier for Acme Technologies.',
      customerId: acme._id,
      meetingId: mtg1._id,
      ownerId: users.aditya._id,
      assignedById: users.aditya._id,
      dueDate: atHour(18, 0, 0),
      priority: PRIORITY_LEVEL.HIGH,
      status: FOLLOW_UP_STATUS.PENDING,
    },
    {
      taskCode: 'FUP-102',
      title: 'Share Zero-Trust geofence compliance kit with Neha Kapoor',
      description: 'Pre-briefing technical collateral ahead of Vertex Systems visit.',
      customerId: vertex._id,
      meetingId: mtg4._id,
      ownerId: users.aditya._id,
      assignedById: users.northManager._id,
      dueDate: atHour(17, 30, 1),
      priority: PRIORITY_LEVEL.CRITICAL,
      status: FOLLOW_UP_STATUS.IN_PROGRESS,
    },
    {
      taskCode: 'FUP-103',
      title: 'Deliver FinTech API compliance architecture slides',
      customerId: nexa._id,
      meetingId: mtg5._id,
      ownerId: users.rahul._id,
      assignedById: users.rahul._id,
      dueDate: atHour(12, 0, 2),
      priority: PRIORITY_LEVEL.MEDIUM,
      status: FOLLOW_UP_STATUS.PENDING,
    },
  ]);
}
