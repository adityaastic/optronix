import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  FOLLOW_UP_STATUS,
  PRIORITY_LEVEL,
  type FollowUpStatus,
  type PriorityLevel,
} from '../shared/index.js';

export interface IFollowUpComment {
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}

export interface IFollowUpTask {
  _id: Types.ObjectId;
  taskCode: string;
  title: string;
  description?: string;
  customerId: Types.ObjectId;
  meetingId?: Types.ObjectId | null;
  ownerId: Types.ObjectId;
  assignedById: Types.ObjectId;
  dueDate: Date;
  priority: PriorityLevel;
  status: FollowUpStatus;
  completedAt?: Date | null;
  completedBy?: Types.ObjectId | null;
  comments: IFollowUpComment[];
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FollowUpTaskDocument = Document<
  Types.ObjectId,
  object,
  IFollowUpTask
> &
  IFollowUpTask;

const commentSubSchema = new Schema<IFollowUpComment>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const followUpTaskSchema = new Schema<IFollowUpTask>(
  {
    taskCode: {
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
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(PRIORITY_LEVEL),
      default: PRIORITY_LEVEL.MEDIUM,
    },
    status: {
      type: String,
      enum: Object.values(FOLLOW_UP_STATUS),
      default: FOLLOW_UP_STATUS.PENDING,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    comments: {
      type: [commentSubSchema],
      default: [],
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

followUpTaskSchema.index({ ownerId: 1, isDeleted: 1, status: 1, dueDate: 1 });
followUpTaskSchema.index({ customerId: 1, status: 1 });
followUpTaskSchema.index({ meetingId: 1 });
followUpTaskSchema.index({ title: 'text', taskCode: 'text', description: 'text' });

export const FollowUpTaskModel =
  (mongoose.models.FollowUpTask as mongoose.Model<IFollowUpTask>) ||
  mongoose.model<IFollowUpTask>('FollowUpTask', followUpTaskSchema);
