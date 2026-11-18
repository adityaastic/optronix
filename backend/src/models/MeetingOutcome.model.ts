import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { OUTCOME_TYPE, type OutcomeType } from '../shared/index.js';

export interface ICommercialSpecs {
  estimatedValue?: number;
  currency: string;
  targetCloseDate?: Date | null;
  productsDiscussed: string[];
}

export interface IOutcomeRevisionSnapshot {
  version: number;
  outcomeType: OutcomeType;
  summary: string;
  minutes?: string;
  recordedBy: Types.ObjectId;
  recordedAt: Date;
}

export interface IMeetingOutcome {
  _id: Types.ObjectId;
  meetingId: Types.ObjectId;
  version: number;
  outcomeType: OutcomeType;
  summary: string;
  minutes?: string;
  clientFeedback?: string;
  commercialSpecs?: ICommercialSpecs | null;
  disqualificationReason?: string;
  competitorNotes?: string;
  recordedBy: Types.ObjectId;
  recordedAt: Date;
  revisionHistory: IOutcomeRevisionSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

export type MeetingOutcomeDocument = Document<
  Types.ObjectId,
  object,
  IMeetingOutcome
> &
  IMeetingOutcome;

const commercialSpecsSchema = new Schema<ICommercialSpecs>(
  {
    estimatedValue: { type: Number, min: 0 },
    currency: { type: String, trim: true, maxlength: 8, default: 'USD' },
    targetCloseDate: { type: Date, default: null },
    productsDiscussed: [{ type: String, trim: true, maxlength: 100 }],
  },
  { _id: false },
);

const outcomeRevisionSnapshotSchema = new Schema<IOutcomeRevisionSnapshot>(
  {
    version: { type: Number, required: true },
    outcomeType: {
      type: String,
      enum: Object.values(OUTCOME_TYPE),
      required: true,
    },
    summary: { type: String, required: true, trim: true, maxlength: 4000 },
    minutes: { type: String, trim: true, maxlength: 10000 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

const meetingOutcomeSchema = new Schema<IMeetingOutcome>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
      unique: true,
      immutable: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    outcomeType: {
      type: String,
      enum: Object.values(OUTCOME_TYPE),
      required: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    minutes: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    clientFeedback: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    commercialSpecs: {
      type: commercialSpecsSchema,
      default: null,
    },
    disqualificationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    competitorNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    revisionHistory: {
      type: [outcomeRevisionSnapshotSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

meetingOutcomeSchema.index({ outcomeType: 1, recordedAt: -1 });

export const MeetingOutcomeModel =
  (mongoose.models.MeetingOutcome as mongoose.Model<IMeetingOutcome>) ||
  mongoose.model<IMeetingOutcome>('MeetingOutcome', meetingOutcomeSchema);
