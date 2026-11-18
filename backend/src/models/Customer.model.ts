import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  CUSTOMER_STATUS,
  CUSTOMER_TIER,
  type CustomerStatus,
  type CustomerTier,
} from '../shared/index.js';

export interface ICustomerGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface ICustomerAddress {
  street: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  location?: ICustomerGeoPoint;
  geofenceRadiusMeters: number;
}

export interface ICustomer {
  _id: Types.ObjectId;
  customerCode: string;
  companyName: string;
  website?: string;
  industry: string;
  tier: CustomerTier;
  annualRevenue?: number;
  status: CustomerStatus;
  address: ICustomerAddress;
  assignedRepId: Types.ObjectId;
  primaryContactId?: Types.ObjectId | null;
  strategicNotes?: string;
  lastMeetingAt?: Date | null;
  isArchived: boolean;
  archivedAt?: Date | null;
  archivedBy?: Types.ObjectId | null;
  archiveReason?: string | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerDocument = Document<Types.ObjectId, object, ICustomer> &
  ICustomer;

const geoPointSchema = new Schema<ICustomerGeoPoint>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coords: number[]) =>
          Array.isArray(coords) &&
          coords.length === 2 &&
          coords[0]! >= -180 &&
          coords[0]! <= 180 &&
          coords[1]! >= -90 &&
          coords[1]! <= 90,
        message: 'GeoJSON Point coordinates must be [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

const customerAddressSchema = new Schema<ICustomerAddress>(
  {
    street: { type: String, required: true, trim: true, maxlength: 240 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 24 },
    country: { type: String, trim: true, maxlength: 80, default: 'India' },
    location: { type: geoPointSchema, required: false },
    geofenceRadiusMeters: {
      type: Number,
      min: 25,
      max: 5000,
      default: 100,
    },
  },
  { _id: false },
);

const customerSchema = new Schema<ICustomer>(
  {
    customerCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 24,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    website: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    industry: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    tier: {
      type: String,
      enum: Object.values(CUSTOMER_TIER),
      default: CUSTOMER_TIER.ENTERPRISE_T1,
    },
    annualRevenue: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(CUSTOMER_STATUS),
      default: CUSTOMER_STATUS.ACTIVE,
    },
    address: {
      type: customerAddressSchema,
      required: true,
    },
    assignedRepId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    primaryContactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      default: null,
    },
    strategicNotes: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    lastMeetingAt: {
      type: Date,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    archiveReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

customerSchema.index({ assignedRepId: 1, isArchived: 1, status: 1 });
customerSchema.index({ isArchived: 1, status: 1, tier: 1, createdAt: -1 });
customerSchema.index({ industry: 1, status: 1 });
customerSchema.index({ companyName: 'text', customerCode: 'text', industry: 'text' });
customerSchema.index({ 'address.location': '2dsphere' }, { sparse: true });

export const CustomerModel =
  (mongoose.models.Customer as mongoose.Model<ICustomer>) ||
  mongoose.model<ICustomer>('Customer', customerSchema);
