import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  LOCATION_PING_SOURCE,
  type LocationPingSource,
} from '../shared/index.js';

export interface IRepLocationPing {
  _id: Types.ObjectId;
  repId: Types.ObjectId;
  meetingId?: Types.ObjectId | null;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  speedMps?: number | null;
  heading?: number | null;
  batteryPercent?: number | null;
  source: LocationPingSource;
  recordedAt: Date;
  createdAt: Date;
}

export type RepLocationPingDocument = Document<
  Types.ObjectId,
  object,
  IRepLocationPing
> &
  IRepLocationPing;

const repLocationPingSchema = new Schema<IRepLocationPing>(
  {
    repId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      default: null,
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    accuracyMeters: {
      type: Number,
      min: 0,
      default: 10,
    },
    speedMps: {
      type: Number,
      min: 0,
      default: null,
    },
    heading: {
      type: Number,
      min: 0,
      max: 360,
      default: null,
    },
    batteryPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    source: {
      type: String,
      enum: Object.values(LOCATION_PING_SOURCE),
      default: LOCATION_PING_SOURCE.HEARTBEAT,
    },
    recordedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

repLocationPingSchema.index({ repId: 1, recordedAt: -1 });
// Automatic 30-day retention TTL on granular GPS breadcrumbs
repLocationPingSchema.index(
  { recordedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);

export const RepLocationPingModel =
  (mongoose.models.RepLocationPing as mongoose.Model<IRepLocationPing>) ||
  mongoose.model<IRepLocationPing>('RepLocationPing', repLocationPingSchema);
