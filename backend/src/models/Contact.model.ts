import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IContact {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  fullName: string;
  designation?: string;
  email: string;
  phone: string;
  department?: string;
  isPrimary: boolean;
  notes?: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactDocument = Document<Types.ObjectId, object, IContact> &
  IContact;

const contactSchema = new Schema<IContact>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    designation: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
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

contactSchema.index({ customerId: 1, isPrimary: -1 });
contactSchema.index({ email: 1 });

export const ContactModel =
  (mongoose.models.Contact as mongoose.Model<IContact>) ||
  mongoose.model<IContact>('Contact', contactSchema);
