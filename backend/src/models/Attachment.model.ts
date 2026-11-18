import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const ATTACHMENT_CATEGORIES = {
  NDA: 'NDA',
  PROPOSAL: 'PROPOSAL',
  SITE_PHOTO: 'SITE_PHOTO',
  WHITEBOARD: 'WHITEBOARD',
  TRANSCRIPT: 'TRANSCRIPT',
  CONTRACT: 'CONTRACT',
  GENERAL: 'GENERAL',
} as const;

export type AttachmentCategory =
  (typeof ATTACHMENT_CATEGORIES)[keyof typeof ATTACHMENT_CATEGORIES];

export interface IGeoStamp {
  latitude: number;
  longitude: number;
  capturedAt: Date;
}

export interface IAttachment {
  _id: Types.ObjectId;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  category: AttachmentCategory;
  meetingId?: Types.ObjectId | null;
  visitSessionId?: Types.ObjectId | null;
  customerId?: Types.ObjectId | null;
  geoStamp?: IGeoStamp | null;
  uploadedBy: Types.ObjectId;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AttachmentDocument = Document<Types.ObjectId, object, IAttachment> &
  IAttachment;

const geoStampSchema = new Schema<IGeoStamp>(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    capturedAt: { type: Date, required: true },
  },
  { _id: false },
);

const attachmentSchema = new Schema<IAttachment>(
  {
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: Object.values(ATTACHMENT_CATEGORIES),
      default: ATTACHMENT_CATEGORIES.GENERAL,
    },
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null,
    },
    visitSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'VisitSession',
      default: null,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    geoStamp: {
      type: geoStampSchema,
      default: null,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

attachmentSchema.index({ meetingId: 1, createdAt: -1 });
attachmentSchema.index({ customerId: 1, createdAt: -1 });

export const AttachmentModel =
  (mongoose.models.Attachment as mongoose.Model<IAttachment>) ||
  mongoose.model<IAttachment>('Attachment', attachmentSchema);
