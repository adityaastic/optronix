import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { USER_STATUS, type UserStatus } from '../shared/index.js';

export interface IUser {
  _id: Types.ObjectId;
  employeeCode: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  roleId: Types.ObjectId;
  managerId?: Types.ObjectId | null;
  territory?: string;
  department?: string;
  status: UserStatus;
  tokenVersion: number;
  managerPinHash?: string | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  invitationTokenHash?: string | null;
  invitationExpiresAt?: Date | null;
  invitedBy?: Types.ObjectId | null;
  invitedAt?: Date | null;
  activatedAt?: Date | null;
  lastLoginAt?: Date | null;
  lastActiveAt?: Date | null;
  isFieldDutyActive?: boolean;
  lastKnownLocation?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    source?: string;
    updatedAt: Date;
  } | null;
  deactivatedAt?: Date | null;
  deactivationReason?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = Document<Types.ObjectId, object, IUser> & IUser;

const userSchema = new Schema<IUser>(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 24,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    territory: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    managerPinHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
      default: null,
    },
    invitationTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    invitationExpiresAt: {
      type: Date,
      select: false,
      default: null,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    invitedAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    isFieldDutyActive: {
      type: Boolean,
      default: false,
    },
    lastKnownLocation: {
      type: new Schema(
        {
          latitude: { type: Number, required: true, min: -90, max: 90 },
          longitude: { type: Number, required: true, min: -180, max: 180 },
          accuracyMeters: { type: Number, min: 0 },
          source: { type: String, trim: true, maxlength: 32 },
          updatedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deactivationReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
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

userSchema.index({ managerId: 1, status: 1 });
userSchema.index({ roleId: 1, status: 1 });
userSchema.index({ invitationTokenHash: 1 }, { sparse: true });
userSchema.index({ firstName: 'text', lastName: 'text', email: 'text', employeeCode: 'text' });

export const UserModel =
  (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>('User', userSchema);
