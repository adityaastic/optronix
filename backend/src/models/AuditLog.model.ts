import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { ROLE_CODES, type RoleCode } from '../shared/index.js';

export interface IAuditLog {
  _id: Types.ObjectId;
  auditCode: string;
  actorId?: Types.ObjectId | null;
  actorRole?: RoleCode | 'SYSTEM' | null;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | string | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  previousHash: string;
  integrityHash: string;
  createdAt: Date;
}

export type AuditLogDocument = Document<Types.ObjectId, object, IAuditLog> &
  IAuditLog;

const auditLogSchema = new Schema<IAuditLog>(
  {
    auditCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 36,
      immutable: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },
    actorRole: {
      type: String,
      enum: [...Object.values(ROLE_CODES), 'SYSTEM', null],
      default: null,
      immutable: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
      immutable: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 64,
      immutable: true,
    },
    entityId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
      immutable: true,
    },
    beforeSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
    },
    afterSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
      immutable: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
      immutable: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
      immutable: true,
    },
    previousHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      default: 'GENESIS',
      immutable: true,
    },
    integrityHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

function blockAuditMutation(next: (err?: Error) => void) {
  next(new Error('AuditLog entries are immutable and cannot be modified or deleted.'));
}

auditLogSchema.pre('updateOne', blockAuditMutation);
auditLogSchema.pre('updateMany', blockAuditMutation);
auditLogSchema.pre('findOneAndUpdate', blockAuditMutation);
auditLogSchema.pre('deleteOne', blockAuditMutation);
auditLogSchema.pre('deleteMany', blockAuditMutation);
auditLogSchema.pre('findOneAndDelete', blockAuditMutation);

export const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<IAuditLog>) ||
  mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
