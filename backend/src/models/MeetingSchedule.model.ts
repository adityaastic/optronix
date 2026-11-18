import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IMeetingSchedule {
  _id: Types.ObjectId;
  meetingId: Types.ObjectId;
  revisionNumber: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  isOriginal: boolean;
  previousScheduleId?: Types.ObjectId | null;
  changedBy: Types.ObjectId;
  changeReason?: string | null;
  createdAt: Date;
}

export type MeetingScheduleDocument = Document<
  Types.ObjectId,
  object,
  IMeetingSchedule
> &
  IMeetingSchedule;

const meetingScheduleSchema = new Schema<IMeetingSchedule>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      immutable: true,
    },
    revisionNumber: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
    },
    scheduledStart: {
      type: Date,
      required: true,
      immutable: true,
    },
    scheduledEnd: {
      type: Date,
      required: true,
      immutable: true,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: 'Asia/Kolkata',
      immutable: true,
    },
    isOriginal: {
      type: Boolean,
      required: true,
      immutable: true,
    },
    previousScheduleId: {
      type: Schema.Types.ObjectId,
      ref: 'MeetingSchedule',
      default: null,
      immutable: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    changeReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

meetingScheduleSchema.index({ meetingId: 1, revisionNumber: 1 }, { unique: true });

function blockScheduleMutation(next: (err?: Error) => void) {
  next(new Error('MeetingSchedule records are immutable and cannot be modified or deleted.'));
}

meetingScheduleSchema.pre('updateOne', blockScheduleMutation);
meetingScheduleSchema.pre('updateMany', blockScheduleMutation);
meetingScheduleSchema.pre('findOneAndUpdate', blockScheduleMutation);
meetingScheduleSchema.pre('deleteOne', blockScheduleMutation);
meetingScheduleSchema.pre('deleteMany', blockScheduleMutation);
meetingScheduleSchema.pre('findOneAndDelete', blockScheduleMutation);

export const MeetingScheduleModel =
  (mongoose.models.MeetingSchedule as mongoose.Model<IMeetingSchedule>) ||
  mongoose.model<IMeetingSchedule>('MeetingSchedule', meetingScheduleSchema);
