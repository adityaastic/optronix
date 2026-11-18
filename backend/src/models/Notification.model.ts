import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { publishRealtimeEvent } from '../common/realtime.service.js';

export const NOTIFICATION_TYPES = {
  MEETING_ASSIGNED: 'MEETING_ASSIGNED',
  MEETING_CONFIRMED: 'MEETING_CONFIRMED',
  MEETING_RESCHEDULED: 'MEETING_RESCHEDULED',
  MEETING_REOPENED: 'MEETING_REOPENED',
  MEETING_CANCELLED: 'MEETING_CANCELLED',
  FOLLOWUP_ASSIGNED: 'FOLLOWUP_ASSIGNED',
  FOLLOWUP_OVERDUE: 'FOLLOWUP_OVERDUE',
  SLA_GOVERNANCE_ALERT: 'SLA_GOVERNANCE_ALERT',
  SYSTEM_ANNOUNCEMENT: 'SYSTEM_ANNOUNCEMENT',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface INotification {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = Document<
  Types.ObjectId,
  object,
  INotification
> &
  INotification;

const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    entityType: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    entityId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

notificationSchema.post('save', (doc) => {
  publishRealtimeEvent({
    event: 'NOTIFICATION_CREATED',
    recipientUserId: String(doc.recipientId),
    entityId: doc.entityId ?? null,
    title: doc.title,
  });
});

export const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<INotification>) ||
  mongoose.model<INotification>('Notification', notificationSchema);
