import type { Types } from 'mongoose';
import {
  CUSTOMER_STATUS,
  FOLLOW_UP_STATUS,
  ROLE_CODES,
  type ArchiveCustomerInput,
  type ContactInput,
  type CreateCustomerInput,
  type CustomerListQuery,
  type UpdateCustomerInput,
} from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { generateEntityCode, writeAuditLog } from '../../common/audit.service.js';
import { buildPaginationMeta } from '../../common/response.js';
import { withTransaction } from '../../config/database.js';
import type { AuthenticatedActor } from '../../middleware/auth.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  resolveAuthorizedUserScope,
} from '../../middleware/rbac.middleware.js';
import { AuditLogModel } from '../../models/AuditLog.model.js';
import { ContactModel } from '../../models/Contact.model.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { FollowUpTaskModel } from '../../models/FollowUpTask.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';
import { UserModel } from '../../models/User.model.js';

export async function createCustomer(
  actor: AuthenticatedActor,
  input: CreateCustomerInput,
  ipAddress?: string | null,
) {
  let assignedRepId: Types.ObjectId = actor.userId;

  if (input.assignedRepId && String(input.assignedRepId) !== String(actor.userId)) {
    if (actor.roleCode === ROLE_CODES.SALES_EMPLOYEE) {
      throw ApiError.forbidden(
        'Sales Employees can only assign new customer accounts to themselves',
      );
    }
    await assertCanAccessUserScopedRecord(actor, input.assignedRepId);
    const targetRep = await UserModel.findOne({
      _id: input.assignedRepId,
      deletedAt: null,
    }).lean();
    if (!targetRep) {
      throw ApiError.badRequest('Assigned sales representative does not exist');
    }
    assignedRepId = targetRep._id;
  }

  return withTransaction(async (session) => {
    const customerCode = generateEntityCode('CUST');

    const location = input.address.coordinates
      ? {
          type: 'Point' as const,
          coordinates: [
            input.address.coordinates.longitude,
            input.address.coordinates.latitude,
          ] as [number, number],
        }
      : undefined;

    const [customer] = await CustomerModel.create(
      [
        {
          customerCode,
          companyName: input.companyName,
          website: input.website,
          industry: input.industry,
          tier: input.tier,
          annualRevenue: input.annualRevenue,
          status: input.status,
          address: {
            street: input.address.street,
            city: input.address.city,
            state: input.address.state,
            postalCode: input.address.postalCode,
            country: input.address.country,
            ...(location ? { location } : {}),
            geofenceRadiusMeters: input.address.geofenceRadiusMeters,
          },
          assignedRepId,
          strategicNotes: input.strategicNotes,
          createdBy: actor.userId,
        },
      ],
      session ? { session } : undefined,
    );

    if (!customer) {
      throw ApiError.internal('Failed to create customer record');
    }

    const [contact] = await ContactModel.create(
      [
        {
          customerId: customer._id,
          fullName: input.primaryContact.fullName,
          designation: input.primaryContact.designation,
          email: input.primaryContact.email,
          phone: input.primaryContact.phone,
          department: input.primaryContact.department,
          notes: input.primaryContact.notes,
          isPrimary: true,
        },
      ],
      session ? { session } : undefined,
    );

    if (contact) {
      customer.primaryContactId = contact._id;
      await customer.save(session ? { session } : undefined);
    }

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: customer._id,
      afterSnapshot: {
        customerCode: customer.customerCode,
        companyName: customer.companyName,
        assignedRepId: String(assignedRepId),
      },
      ipAddress,
      session,
    });

    return getCustomerDetails(actor, String(customer._id));
  });
}

export async function listCustomers(
  actor: AuthenticatedActor,
  query: CustomerListQuery,
) {
  const scope = await resolveAuthorizedUserScope(actor);

  const baseScopeFilter: Record<string, unknown> = {};
  if (scope.allowedUserIds !== null) {
    baseScopeFilter.assignedRepId = { $in: scope.allowedUserIds };
  }

  const filter: Record<string, unknown> = { ...baseScopeFilter };

  if (!query.includeArchived) {
    filter.isArchived = false;
  }

  if (query.industry) {
    filter.industry = query.industry;
  }
  if (query.tier) {
    filter.tier = query.tier;
  }
  if (query.status) {
    filter.status = query.status;
  }
  if (query.assignedRepId) {
    await assertCanAccessUserScopedRecord(actor, query.assignedRepId);
    filter.assignedRepId = query.assignedRepId;
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { companyName: regex },
      { customerCode: regex },
      { industry: regex },
      { 'address.city': regex },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const sortField =
    query.sortBy && ['companyName', 'createdAt', 'lastMeetingAt', 'annualRevenue'].includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
  const sortDir = query.sortOrder === 'asc' ? 1 : -1;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [total, docs, totalActive, newThisMonth, openFollowUpCustomerIds] =
    await Promise.all([
      CustomerModel.countDocuments(filter),
      CustomerModel.find(filter)
        .populate('primaryContactId', 'fullName designation email phone')
        .populate('assignedRepId', 'firstName lastName email employeeCode territory')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      CustomerModel.countDocuments({
        ...baseScopeFilter,
        isArchived: false,
        status: CUSTOMER_STATUS.ACTIVE,
      }),
      CustomerModel.countDocuments({
        ...baseScopeFilter,
        isArchived: false,
        createdAt: { $gte: startOfMonth },
      }),
      FollowUpTaskModel.distinct('customerId', {
        isDeleted: false,
        status: {
          $in: [
            FOLLOW_UP_STATUS.PENDING,
            FOLLOW_UP_STATUS.IN_PROGRESS,
            FOLLOW_UP_STATUS.OVERDUE,
          ],
        },
        ...(scope.allowedUserIds !== null
          ? { ownerId: { $in: scope.allowedUserIds } }
          : {}),
      }),
    ]);

  const totalCustomersScope = await CustomerModel.countDocuments({
    ...baseScopeFilter,
    isArchived: false,
  });

  const items = docs.map((c) => {
    const rep = c.assignedRepId as unknown as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      email: string;
      employeeCode: string;
      territory?: string;
    } | null;
    const contact = c.primaryContactId as unknown as {
      _id: Types.ObjectId;
      fullName: string;
      designation?: string;
      email: string;
      phone: string;
    } | null;

    return {
      id: String(c._id),
      customerCode: c.customerCode,
      companyName: c.companyName,
      website: c.website ?? null,
      industry: c.industry,
      tier: c.tier,
      annualRevenue: c.annualRevenue ?? null,
      status: c.status,
      isArchived: c.isArchived,
      address: {
        street: c.address.street,
        city: c.address.city,
        state: c.address.state ?? null,
        postalCode: c.address.postalCode ?? null,
        country: c.address.country,
        geofenceRadiusMeters: c.address.geofenceRadiusMeters,
        coordinates: c.address.location?.coordinates
          ? {
              longitude: c.address.location.coordinates[0],
              latitude: c.address.location.coordinates[1],
            }
          : null,
      },
      primaryContact: contact
        ? {
            id: String(contact._id),
            fullName: contact.fullName,
            designation: contact.designation ?? null,
            email: contact.email,
            phone: contact.phone,
          }
        : null,
      assignedRep: rep
        ? {
            id: String(rep._id),
            fullName: `${rep.firstName} ${rep.lastName}`.trim(),
            email: rep.email,
            employeeCode: rep.employeeCode,
            territory: rep.territory ?? null,
          }
        : null,
      strategicNotes: c.strategicNotes ?? null,
      lastMeetingAt: c.lastMeetingAt ?? null,
      createdAt: c.createdAt,
    };
  });

  return {
    items,
    stats: {
      totalCustomers: totalCustomersScope,
      activeCustomers: totalActive,
      newThisMonth,
      customersWithFollowUps: openFollowUpCustomerIds.length,
    },
    pagination: buildPaginationMeta(total, query.page, query.limit),
  };
}

export async function getCustomerDetails(
  actor: AuthenticatedActor,
  customerId: string,
) {
  const customer = await CustomerModel.findById(customerId)
    .populate('assignedRepId', 'firstName lastName email employeeCode territory')
    .lean();

  if (!customer) {
    throw ApiError.notFound('Customer account not found');
  }

  await assertCanAccessUserScopedRecord(actor, customer.assignedRepId._id);

  const [contacts, meetings, followUps, auditLogs] = await Promise.all([
    ContactModel.find({ customerId: customer._id, deletedAt: null })
      .sort({ isPrimary: -1, createdAt: 1 })
      .lean(),
    MeetingModel.find({ customerId: customer._id, isDeleted: false })
      .populate('assignedRepId', 'firstName lastName employeeCode')
      .sort({ currentScheduledStart: -1 })
      .limit(20)
      .lean(),
    FollowUpTaskModel.find({ customerId: customer._id, isDeleted: false })
      .populate('ownerId', 'firstName lastName employeeCode')
      .sort({ dueDate: 1 })
      .limit(20)
      .lean(),
    AuditLogModel.find({
      entityType: 'CUSTOMER',
      entityId: String(customer._id),
    })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
  ]);

  const rep = customer.assignedRepId as unknown as {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    employeeCode: string;
    territory?: string;
  };

  return {
    id: String(customer._id),
    customerCode: customer.customerCode,
    companyName: customer.companyName,
    website: customer.website ?? null,
    industry: customer.industry,
    tier: customer.tier,
    annualRevenue: customer.annualRevenue ?? null,
    status: customer.status,
    isArchived: customer.isArchived,
    archiveReason: customer.archiveReason ?? null,
    address: {
      street: customer.address.street,
      city: customer.address.city,
      state: customer.address.state ?? null,
      postalCode: customer.address.postalCode ?? null,
      country: customer.address.country,
      geofenceRadiusMeters: customer.address.geofenceRadiusMeters,
      coordinates: customer.address.location?.coordinates
        ? {
            longitude: customer.address.location.coordinates[0],
            latitude: customer.address.location.coordinates[1],
          }
        : null,
    },
    assignedRep: {
      id: String(rep._id),
      fullName: `${rep.firstName} ${rep.lastName}`.trim(),
      email: rep.email,
      employeeCode: rep.employeeCode,
      territory: rep.territory ?? null,
    },
    strategicNotes: customer.strategicNotes ?? null,
    lastMeetingAt: customer.lastMeetingAt ?? null,
    createdAt: customer.createdAt,
    contacts: contacts.map((ct) => ({
      id: String(ct._id),
      fullName: ct.fullName,
      designation: ct.designation ?? null,
      email: ct.email,
      phone: ct.phone,
      department: ct.department ?? null,
      isPrimary: ct.isPrimary,
    })),
    meetings: meetings.map((m) => {
      const mRep = m.assignedRepId as unknown as {
        firstName: string;
        lastName: string;
        employeeCode: string;
      } | null;
      return {
        id: String(m._id),
        meetingCode: m.meetingCode,
        title: m.title,
        status: m.status,
        meetingType: m.meetingType,
        scheduledStart: m.currentScheduledStart,
        scheduledEnd: m.currentScheduledEnd,
        totalActualDurationMinutes: m.totalActualDurationMinutes,
        assignedRepName: mRep
          ? `${mRep.firstName} ${mRep.lastName}`.trim()
          : 'Unassigned',
      };
    }),
    followUps: followUps.map((f) => {
      const owner = f.ownerId as unknown as {
        firstName: string;
        lastName: string;
      } | null;
      return {
        id: String(f._id),
        taskCode: f.taskCode,
        title: f.title,
        dueDate: f.dueDate,
        priority: f.priority,
        status: f.status,
        ownerName: owner
          ? `${owner.firstName} ${owner.lastName}`.trim()
          : 'Unassigned',
      };
    }),
    auditLogs: auditLogs.map((a) => ({
      id: String(a._id),
      auditCode: a.auditCode,
      action: a.action,
      reason: a.reason ?? null,
      integrityHash: a.integrityHash,
      createdAt: a.createdAt,
    })),
  };
}

export async function updateCustomer(
  actor: AuthenticatedActor,
  customerId: string,
  input: UpdateCustomerInput,
  ipAddress?: string | null,
) {
  const customer = await CustomerModel.findById(customerId);
  if (!customer) {
    throw ApiError.notFound('Customer account not found');
  }

  await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);

  if (customer.isArchived) {
    throw ApiError.unprocessable(
      'Archived customer records cannot be edited directly.',
    );
  }

  const beforeSnapshot = {
    companyName: customer.companyName,
    status: customer.status,
    tier: customer.tier,
    assignedRepId: String(customer.assignedRepId),
  };

  if (input.companyName !== undefined) customer.companyName = input.companyName;
  if (input.website !== undefined) customer.website = input.website;
  if (input.industry !== undefined) customer.industry = input.industry;
  if (input.tier !== undefined) customer.tier = input.tier;
  if (input.annualRevenue !== undefined)
    customer.annualRevenue = input.annualRevenue;
  if (input.status !== undefined) customer.status = input.status;
  if (input.strategicNotes !== undefined)
    customer.strategicNotes = input.strategicNotes;

  if (input.assignedRepId && String(input.assignedRepId) !== String(customer.assignedRepId)) {
    if (actor.roleCode === ROLE_CODES.SALES_EMPLOYEE) {
      throw ApiError.forbidden('Sales Employees cannot reassign customer ownership');
    }
    await assertCanAccessUserScopedRecord(actor, input.assignedRepId);
    customer.assignedRepId = input.assignedRepId as unknown as Types.ObjectId;
  }

  if (input.address) {
    customer.address = {
      street: input.address.street,
      city: input.address.city,
      state: input.address.state,
      postalCode: input.address.postalCode,
      country: input.address.country,
      geofenceRadiusMeters: input.address.geofenceRadiusMeters,
      ...(input.address.coordinates
        ? {
            location: {
              type: 'Point',
              coordinates: [
                input.address.coordinates.longitude,
                input.address.coordinates.latitude,
              ],
            },
          }
        : customer.address.location
          ? { location: customer.address.location }
          : {}),
    };
  }

  await customer.save();

  if (input.primaryContact && customer.primaryContactId) {
    await ContactModel.findByIdAndUpdate(customer.primaryContactId, {
      $set: input.primaryContact,
    });
  }

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'CUSTOMER_UPDATED',
    entityType: 'CUSTOMER',
    entityId: customer._id,
    beforeSnapshot,
    afterSnapshot: {
      companyName: customer.companyName,
      status: customer.status,
      tier: customer.tier,
      assignedRepId: String(customer.assignedRepId),
    },
    ipAddress,
  });

  return getCustomerDetails(actor, String(customer._id));
}

export async function addCustomerContact(
  actor: AuthenticatedActor,
  customerId: string,
  input: ContactInput,
) {
  const customer = await CustomerModel.findById(customerId);
  if (!customer) {
    throw ApiError.notFound('Customer account not found');
  }
  await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);

  if (input.isPrimary) {
    await ContactModel.updateMany(
      { customerId: customer._id },
      { $set: { isPrimary: false } },
    );
  }

  const contact = await ContactModel.create({
    customerId: customer._id,
    fullName: input.fullName,
    designation: input.designation,
    email: input.email,
    phone: input.phone,
    department: input.department,
    notes: input.notes,
    isPrimary: Boolean(input.isPrimary),
  });

  if (contact.isPrimary) {
    customer.primaryContactId = contact._id;
    await customer.save();
  }

  return {
    id: String(contact._id),
    fullName: contact.fullName,
    designation: contact.designation ?? null,
    email: contact.email,
    phone: contact.phone,
    department: contact.department ?? null,
    isPrimary: contact.isPrimary,
  };
}

export async function archiveCustomer(
  actor: AuthenticatedActor,
  customerId: string,
  input: ArchiveCustomerInput,
  ipAddress?: string | null,
) {
  const customer = await CustomerModel.findById(customerId);
  if (!customer) {
    throw ApiError.notFound('Customer account not found');
  }

  await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);

  if (customer.isArchived) {
    throw ApiError.conflict('Customer is already archived');
  }

  customer.isArchived = true;
  customer.status = CUSTOMER_STATUS.ARCHIVED;
  customer.archivedAt = new Date();
  customer.archivedBy = actor.userId;
  customer.archiveReason = input.reason;
  await customer.save();

  await writeAuditLog({
    actorId: actor.userId,
    actorRole: actor.roleCode,
    action: 'CUSTOMER_ARCHIVED',
    entityType: 'CUSTOMER',
    entityId: customer._id,
    reason: input.reason,
    ipAddress,
  });

  return {
    id: String(customer._id),
    customerCode: customer.customerCode,
    status: customer.status,
    isArchived: customer.isArchived,
  };
}
