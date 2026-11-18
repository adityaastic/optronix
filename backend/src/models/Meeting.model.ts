import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  MEETING_STATUS,
  MEETING_TYPE,
  PRIORITY_LEVEL,
  type MeetingStatus,
  type MeetingType,
  type PriorityLevel,
} from '../shared/index.js';

export interface ITargetCoordinates {
  latitude: number;
  longitude: number;
}

export interface IMeeting {
  _id: Types.ObjectId;
  meetingCode: string;
  title: string;
  purpose: string;
  customerId: Types.ObjectId;
  contactId?: Types.ObjectId | null;
  assignedRepId: Types.ObjectId;
  coHostIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  meetingType: MeetingType;
  priority: PriorityLevel;
  status: MeetingStatus;
  originalScheduledStart: Date;
  originalScheduledEnd: Date;
  currentScheduledStart: Date;
  currentScheduledEnd: Date;
  timezone: string;
  currentScheduleRevision: number;
  currentScheduleId?: Types.ObjectId | null;
  locationText: string;
  targetCoordinates?: ITargetCoordinates | null;
  agenda?: string;
  tags: string[];
  activeVisitSessionId?: Types.ObjectId | null;
  visitSessionCount: number;
  completedSessionCount: number;
  totalActualDurationMinutes: number;
  firstCheckInAt?: Date | null;
  lastCheckOutAt?: Date | null;
  outcomeId?: Types.ObjectId | null;
  lockedAt?: Date | null;
  lockedBy?: Types.ObjectId | null;
  reopenCount: number;
  lastReopenedAt?: Date | null;
  lastReopenedBy?: Types.ObjectId | null;
  lastReopenReason?: string | null;
  cancelledAt?: Date | null;
  cancelledBy?: Types.ObjectId | null;
  cancellationReason?: string | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MeetingDocument = Document<Types.ObjectId, object, IMeeting> &
  IMeeting;

const targetCoordinatesSchema = new Schema<ITargetCoordinates>(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const meetingSchema = new Schema<IMeeting>(
  {
    meetingCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 24,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      default: null,
    },
    assignedRepId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    coHostIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    meetingType: {
      type: String,
      enum: Object.values(MEETING_TYPE),
      default: MEETING_TYPE.IN_PERSON,
    },
    priority: {
      type: String,
      enum: Object.values(PRIORITY_LEVEL),
      default: PRIORITY_LEVEL.MEDIUM,
    },
    status: {
      type: String,
      enum: Object.values(MEETING_STATUS),
      default: MEETING_STATUS.SCHEDULED,
    },
    // Immutable original schedule preserved forever regardless of rescheduling
    originalScheduledStart: {
      type: Date,
      required: true,
      immutable: true,
    },
    originalScheduledEnd: {
      type: Date,
      required: true,
      immutable: true,
    },
    currentScheduledStart: {
      type: Date,
      required: true,
    },
    currentScheduledEnd: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: 'Asia/Kolkata',
    },
    currentScheduleRevision: {
      type: Number,
      default: 1,
      min: 1,
    },
    currentScheduleId: {
      type: Schema.Types.ObjectId,
      ref: 'MeetingSchedule',
      default: null,
    },
    locationText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    targetCoordinates: {
      type: targetCoordinatesSchema,
      default: null,
    },
    agenda: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 40,
      },
    ],
    activeVisitSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'VisitSession',
      default: null,
    },
    visitSessionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedSessionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalActualDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    firstCheckInAt: {
      type: Date,
      default: null,
    },
    lastCheckOutAt: {
      type: Date,
      default: null,
    },
    outcomeId: {
      type: Schema.Types.ObjectId,
      ref: 'MeetingOutcome',
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reopenCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastReopenedAt: {
      type: Date,
      default: null,
    },
    lastReopenedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastReopenReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

meetingSchema.index({ assignedRepId: 1, isDeleted: 1, currentScheduledStart: -1 });
meetingSchema.index({ isDeleted: 1, currentScheduledStart: -1, status: 1 });
meetingSchema.index({ status: 1, currentScheduledStart: 1 });
meetingSchema.index({ customerId: 1, createdAt: -1 });
meetingSchema.index({ title: 'text', meetingCode: 'text', locationText: 'text' });

export const MeetingModel =
  (mongoose.models.Meeting as mongoose.Model<IMeeting>) ||
  mongoose.model<IMeeting>('Meeting', meetingSchema);
