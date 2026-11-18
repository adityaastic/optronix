import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IPermission {
  _id: Types.ObjectId;
  key: string;
  module: string;
  description: string;
  isElevated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PermissionDocument = Document<Types.ObjectId, object, IPermission> &
  IPermission;

const permissionSchema = new Schema<IPermission>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    isElevated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const PermissionModel =
  (mongoose.models.Permission as mongoose.Model<IPermission>) ||
  mongoose.model<IPermission>('Permission', permissionSchema);
