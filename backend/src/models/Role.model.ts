import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { ROLE_CODES, type RoleCode } from '../shared/index.js';

export interface IRole {
  _id: Types.ObjectId;
  code: RoleCode;
  name: string;
  description: string;
  tier: number;
  permissionIds: Types.ObjectId[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RoleDocument = Document<Types.ObjectId, object, IRole> & IRole;

const roleSchema = new Schema<IRole>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: Object.values(ROLE_CODES),
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 400,
    },
    tier: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    permissionIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Permission',
      },
    ],
    isSystem: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const RoleModel =
  (mongoose.models.Role as mongoose.Model<IRole>) ||
  mongoose.model<IRole>('Role', roleSchema);
