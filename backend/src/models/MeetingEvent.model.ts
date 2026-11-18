import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  MEETING_EVENT_TYPE,
  MEETING_STATUS,
  type MeetingEventType,
  type MeetingStatus,
} from '../shared/index.js';

export interface IMeetingEventTelemetry {
  ipAddress?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  sha256Hash?: string;
}

export interface IMeetingEvent {
  _id: Types.ObjectId;
  meetingId: Types.ObjectId;
  visitSessionId?: Types.ObjectId | null;
  eventType: MeetingEventType;
  fromStatus?: MeetingStatus | null;
  toStatus: MeetingStatus;
  actorId: Types.ObjectId;
  reason?: string | null;
  telemetry?: IMeetingEventTelemetry | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type MeetingEventDocument = Document<
  Types.ObjectId,
  object,
  IMeetingEvent
> &
  IMeetingEvent;

const telemetrySubSchema = new Schema<IMeetingEventTelemetry>(
  {
    ipAddress: { type: String, trim: true, maxlength: 64 },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    accuracyMeters: { type: Number, min: 0 },
    sha256Hash: { type: String, trim: true, maxlength: 128 },
  },
  { _id: false },
);

const meetingEventSchema = new Schema<IMeetingEvent>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      immutable: true,
    },
    visitSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'VisitSession',
      default: null,
      immutable: true,
    },
    eventType: {
      type: String,
      enum: Object.values(MEETING_EVENT_TYPE),
      required: true,
      immutable: true,
    },
    fromStatus: {
      type: String,
      enum: [...Object.values(MEETING_STATUS), null],
      default: null,
      immutable: true,
    },
    toStatus: {
      type: String,
      enum: Object.values(MEETING_STATUS),
      required: true,
      immutable: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
      immutable: true,
    },
    telemetry: {
      type: telemetrySubSchema,
      default: null,
      immutable: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

meetingEventSchema.index({ meetingId: 1, createdAt: 1 });
meetingEventSchema.index({ actorId: 1, createdAt: -1 });

function blockEventMutation(next: (err?: Error) => void) {
  next(new Error('MeetingEvent records are immutable and cannot be updated or deleted.'));
}

meetingEventSchema.pre('updateOne', blockEventMutation);
meetingEventSchema.pre('updateMany', blockEventMutation);
meetingEventSchema.pre('findOneAndUpdate', blockEventMutation);
meetingEventSchema.pre('deleteOne', blockEventMutation);
meetingEventSchema.pre('deleteMany', blockEventMutation);
meetingEventSchema.pre('findOneAndDelete', blockEventMutation);

export const MeetingEventModel =
  (mongoose.models.MeetingEvent as mongoose.Model<IMeetingEvent>) ||
  mongoose.model<IMeetingEvent>('MeetingEvent', meetingEventSchema);
