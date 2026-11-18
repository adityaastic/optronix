import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { VISIT_SESSION_STATUS, type VisitSessionStatus } from '../shared/index.js';

export interface IVisitGeoTelemetry {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  distanceFromTargetMeters?: number;
  withinGeofence?: boolean;
  geofenceOverrideReason?: string;
}

export interface IPauseSegment {
  pausedAt: Date;
  resumedAt?: Date | null;
  durationMinutes?: number;
  reason?: string;
}

export interface IVisitSession {
  _id: Types.ObjectId;
  meetingId: Types.ObjectId;
  repId: Types.ObjectId;
  scheduleRevisionNumber: number;
  sessionNumber: number;
  status: VisitSessionStatus;
  checkInAt: Date;
  checkInTelemetry: IVisitGeoTelemetry;
  checkOutAt?: Date | null;
  checkOutTelemetry?: IVisitGeoTelemetry | null;
  pauseSegments: IPauseSegment[];
  grossDurationMinutes: number;
  pausedDurationMinutes: number;
  netDurationMinutes: number;
  arrivalNotes?: string;
  fieldNotes?: string;
  signatureDataUrl?: string;
  integrityHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type VisitSessionDocument = Document<
  Types.ObjectId,
  object,
  IVisitSession
> &
  IVisitSession;

const visitGeoTelemetrySchema = new Schema<IVisitGeoTelemetry>(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    accuracyMeters: { type: Number, min: 0 },
    distanceFromTargetMeters: { type: Number, min: 0 },
    withinGeofence: { type: Boolean },
    geofenceOverrideReason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const pauseSegmentSchema = new Schema<IPauseSegment>(
  {
    pausedAt: { type: Date, required: true },
    resumedAt: { type: Date, default: null },
    durationMinutes: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const visitSessionSchema = new Schema<IVisitSession>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      immutable: true,
    },
    repId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    scheduleRevisionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    sessionNumber: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
    },
    status: {
      type: String,
      enum: Object.values(VISIT_SESSION_STATUS),
      default: VISIT_SESSION_STATUS.ACTIVE,
    },
    checkInAt: {
      type: Date,
      required: true,
      immutable: true,
    },
    checkInTelemetry: {
      type: visitGeoTelemetrySchema,
      required: true,
      immutable: true,
    },
    checkOutAt: {
      type: Date,
      default: null,
    },
    checkOutTelemetry: {
      type: visitGeoTelemetrySchema,
      default: null,
    },
    pauseSegments: {
      type: [pauseSegmentSchema],
      default: [],
    },
    grossDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    pausedDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    netDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    arrivalNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    fieldNotes: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    signatureDataUrl: {
      type: String,
      maxlength: 150000,
    },
    integrityHash: {
      type: String,
      trim: true,
      maxlength: 128,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

visitSessionSchema.index({ meetingId: 1, sessionNumber: 1 }, { unique: true });
visitSessionSchema.index({ repId: 1, checkInAt: -1 });

// Partial unique index guaranteeing at most ONE open (ACTIVE or PAUSED) session per meeting
visitSessionSchema.index(
  { meetingId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [VISIT_SESSION_STATUS.ACTIVE, VISIT_SESSION_STATUS.PAUSED] },
    },
    name: 'unique_open_visit_session_per_meeting',
  },
);

export const VisitSessionModel =
  (mongoose.models.VisitSession as mongoose.Model<IVisitSession>) ||
  mongoose.model<IVisitSession>('VisitSession', visitSessionSchema);
