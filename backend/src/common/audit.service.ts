import crypto from 'node:crypto';
import type { ClientSession, Types } from 'mongoose';
import type { RoleCode } from '../shared/index.js';
import { AuditLogModel } from '../models/AuditLog.model.js';
import { sha256Hex } from './crypto.js';

export interface WriteAuditLogParams {
  actorId?: Types.ObjectId | string | null;
  actorRole?: RoleCode | 'SYSTEM' | null;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | string | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  session?: ClientSession;
}

export function generateEntityCode(prefix: string): string {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

export function computeAuditDigest(input: {
  previousHash: string;
  auditCode: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
}): string {
  return sha256Hex(
    JSON.stringify({
      previousHash: input.previousHash,
      auditCode: input.auditCode.toUpperCase(),
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action.toUpperCase(),
      entityType: input.entityType.toUpperCase(),
      entityId: input.entityId,
      reason: input.reason,
    }),
  );
}

export async function writeAuditLog(params: WriteAuditLogParams) {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  const auditCode = `AUD-${year}-${suffix}`;

  const latestQuery = AuditLogModel.findOne({}, { integrityHash: 1 }).sort({
    _id: -1,
  });
  if (params.session) {
    latestQuery.session(params.session);
  }
  const latest = await latestQuery.lean();
  const previousHash = latest?.integrityHash ?? 'GENESIS';

  const normalizedAction = params.action.trim().toUpperCase();
  const normalizedEntityType = params.entityType.trim().toUpperCase();
  const actorIdStr = params.actorId ? String(params.actorId) : null;
  const entityIdStr = params.entityId ? String(params.entityId) : null;
  const reasonVal = params.reason ? params.reason.trim() : null;

  const integrityHash = computeAuditDigest({
    previousHash,
    auditCode,
    actorId: actorIdStr,
    actorRole: params.actorRole ?? null,
    action: normalizedAction,
    entityType: normalizedEntityType,
    entityId: entityIdStr,
    reason: reasonVal,
  });

  const [created] = await AuditLogModel.create(
    [
      {
        auditCode,
        actorId: params.actorId ?? null,
        actorRole: params.actorRole ?? null,
        action: normalizedAction,
        entityType: normalizedEntityType,
        entityId: entityIdStr,
        beforeSnapshot: params.beforeSnapshot ?? null,
        afterSnapshot: params.afterSnapshot ?? null,
        reason: reasonVal,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        previousHash,
        integrityHash,
      },
    ],
    params.session ? { session: params.session } : undefined,
  );

  return created;
}

/**
 * Cryptographically verifies the SHA-256 hash chain across AuditLog entries.
 */
export async function verifyAuditChainIntegrity(limit = 250): Promise<{
  valid: boolean;
  checkedCount: number;
}> {
  const entries = await AuditLogModel.find({})
    .sort({ _id: 1 })
    .limit(limit)
    .lean();

  let expectedPrev = 'GENESIS';
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    // Legacy seeded entries without explicit previousHash check digest self-consistency if present
    const storedPrev = entry.previousHash ?? expectedPrev;
    if (i > 0 && entry.previousHash && entry.previousHash !== expectedPrev) {
      return { valid: false, checkedCount: i + 1 };
    }
    const recomputed = computeAuditDigest({
      previousHash: storedPrev,
      auditCode: entry.auditCode,
      actorId: entry.actorId ? String(entry.actorId) : null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : null,
      reason: entry.reason ?? null,
    });
    if (recomputed !== entry.integrityHash) {
      return { valid: false, checkedCount: i + 1 };
    }
    expectedPrev = entry.integrityHash;
  }

  return { valid: true, checkedCount: entries.length };
}
