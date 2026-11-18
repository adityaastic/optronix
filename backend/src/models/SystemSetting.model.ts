import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ISystemSetting {
  _id: Types.ObjectId;
  singletonKey: 'DEFAULT';
  organizationName: string;
  defaultTimezone: string;
  defaultCurrency: 'INR' | 'USD' | 'EUR' | 'GBP';
  smtpSenderEmail: string;
  defaultGeofenceRadiusMeters: number;
  enforceGeofenceOnCheckIn: boolean;
  allowGeofenceOverrideWithReason: boolean;
  checkInBufferMinutes: number;
  minimumVisitDurationMinutes: number;
  requireManagerPinOnReopen: boolean;
  followUpReminderHoursBefore: number;
  enableSlaEscalationAlerts: boolean;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SystemSettingDocument = Document<
  Types.ObjectId,
  object,
  ISystemSetting
> &
  ISystemSetting;

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    singletonKey: {
      type: String,
      enum: ['DEFAULT'],
      default: 'DEFAULT',
      unique: true,
      immutable: true,
    },
    organizationName: {
      type: String,
      trim: true,
      maxlength: 160,
      default: 'OPTRONIX Technologies Inc.',
    },
    defaultTimezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: 'Asia/Kolkata',
    },
    defaultCurrency: {
      type: String,
      enum: ['INR', 'USD', 'EUR', 'GBP'],
      default: 'INR',
    },
    smtpSenderEmail: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    defaultGeofenceRadiusMeters: {
      type: Number,
      min: 25,
      max: 5000,
      default: 100,
    },
    enforceGeofenceOnCheckIn: {
      type: Boolean,
      default: true,
    },
    allowGeofenceOverrideWithReason: {
      type: Boolean,
      default: true,
    },
    checkInBufferMinutes: {
      type: Number,
      min: 0,
      max: 240,
      default: 15,
    },
    minimumVisitDurationMinutes: {
      type: Number,
      min: 0,
      max: 480,
      default: 30,
    },
    requireManagerPinOnReopen: {
      type: Boolean,
      default: false,
    },
    followUpReminderHoursBefore: {
      type: Number,
      min: 1,
      max: 168,
      default: 4,
    },
    enableSlaEscalationAlerts: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const SystemSettingModel =
  (mongoose.models.SystemSetting as mongoose.Model<ISystemSetting>) ||
  mongoose.model<ISystemSetting>('SystemSetting', systemSettingSchema);
