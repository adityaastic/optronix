import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PERMISSIONS, objectIdSchema } from '../../shared/index.js';
import { ApiError } from '../../common/ApiError.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { generateEntityCode, writeAuditLog } from '../../common/audit.service.js';
import { paramId, sendSuccess } from '../../common/response.js';
import { authenticate, getAuthActor } from '../../middleware/auth.middleware.js';
import {
  assertCanAccessUserScopedRecord,
  requirePermissions,
} from '../../middleware/rbac.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.middleware.js';
import {
  ATTACHMENT_CATEGORIES,
  AttachmentModel,
} from '../../models/Attachment.model.js';
import { CustomerModel } from '../../models/Customer.model.js';
import { MeetingModel } from '../../models/Meeting.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const attachmentQuerySchema = z.object({
  meetingId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
});

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES);

const BLOCKED_EXTENSIONS_REGEX =
  /\.(exe|bat|cmd|sh|ps1|msi|dll|js|mjs|cjs|html|htm|svg|php|py|rb)$/i;

const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const code = generateEntityCode('ATT');
      const safeBase = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${code}_${safeBase}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      BLOCKED_EXTENSIONS_REGEX.test(file.originalname) ||
      file.originalname.includes('..') ||
      !ALLOWED_MIME_SET.has(file.mimetype)
    ) {
      cb(
        ApiError.badRequest(
          'Unsupported or unsafe file type. Upload PDF, PNG, JPG, WEBP, CSV, TXT, or Office documents up to 15 MB.',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

const createAttachmentSchema = z.object({
  originalName: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine(
      (name) => !BLOCKED_EXTENSIONS_REGEX.test(name) && !name.includes('..'),
      'Executable, script, or path-traversal file names are prohibited',
    ),
  mimeType: z
    .enum(ALLOWED_ATTACHMENT_MIME_TYPES)
    .default('application/pdf'),
  sizeBytes: z.number().int().min(0).max(25_000_000),
  category: z
    .enum([
      ATTACHMENT_CATEGORIES.NDA,
      ATTACHMENT_CATEGORIES.PROPOSAL,
      ATTACHMENT_CATEGORIES.SITE_PHOTO,
      ATTACHMENT_CATEGORIES.WHITEBOARD,
      ATTACHMENT_CATEGORIES.TRANSCRIPT,
      ATTACHMENT_CATEGORIES.CONTRACT,
      ATTACHMENT_CATEGORIES.GENERAL,
    ])
    .default(ATTACHMENT_CATEGORIES.GENERAL),
  meetingId: objectIdSchema.optional().nullable(),
  visitSessionId: objectIdSchema.optional().nullable(),
  customerId: objectIdSchema.optional().nullable(),
  geoStamp: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      capturedAt: z.coerce.date().optional(),
    })
    .optional()
    .nullable(),
});

export const attachmentsRouter: Router = Router();
attachmentsRouter.use(authenticate);

attachmentsRouter.get(
  '/',
  requirePermissions(PERMISSIONS.MEETINGS_READ),
  validateQuery(attachmentQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const query = req.validatedQuery as z.infer<typeof attachmentQuerySchema>;

    if (!query.meetingId && !query.customerId) {
      throw ApiError.badRequest(
        'Either meetingId or customerId query parameter is required',
      );
    }

    if (query.meetingId) {
      const meeting = await MeetingModel.findOne({
        _id: query.meetingId,
        isDeleted: false,
      }).lean();
      if (!meeting) throw ApiError.notFound('Meeting not found');
      await assertCanAccessUserScopedRecord(actor, meeting.assignedRepId);
    }

    if (query.customerId) {
      const customer = await CustomerModel.findOne({
        _id: query.customerId,
      }).lean();
      if (!customer) throw ApiError.notFound('Customer not found');
      await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);
    }

    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.meetingId) filter.meetingId = query.meetingId;
    if (query.customerId) filter.customerId = query.customerId;

    const docs = await AttachmentModel.find(filter)
      .populate('uploadedBy', 'firstName lastName employeeCode')
      .sort({ createdAt: -1 })
      .lean();

    return sendSuccess(res, {
      attachments: docs.map((a) => {
        const hasBinary = Boolean(a.storageKey?.startsWith('disk:'));
        return {
          id: String(a._id),
          fileName: a.fileName,
          originalName: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          category: a.category,
          hasBinary,
          downloadPath: `/api/v1/attachments/${String(a._id)}/download`,
          meetingId: a.meetingId ? String(a.meetingId) : null,
          customerId: a.customerId ? String(a.customerId) : null,
          geoStamp: a.geoStamp ?? null,
          createdAt: a.createdAt,
        };
      }),
    });
  }),
);

// Real Binary Multipart File Upload
attachmentsRouter.post(
  '/upload',
  requirePermissions(PERMISSIONS.MEETINGS_UPDATE),
  uploadMiddleware.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const uploaded = req.file;
    if (!uploaded) {
      throw ApiError.badRequest('Select a file to upload');
    }

    const cleanupFile = () => {
      try {
        if (fs.existsSync(uploaded.path)) fs.unlinkSync(uploaded.path);
      } catch {
        // Ignore cleanup error
      }
    };

    try {
      const meetingId =
        typeof req.body?.meetingId === 'string' && req.body.meetingId.trim()
          ? req.body.meetingId.trim()
          : null;
      const customerId =
        typeof req.body?.customerId === 'string' && req.body.customerId.trim()
          ? req.body.customerId.trim()
          : null;
      const rawCat =
        typeof req.body?.category === 'string'
          ? req.body.category.toUpperCase()
          : ATTACHMENT_CATEGORIES.GENERAL;

      if (!meetingId && !customerId) {
        cleanupFile();
        throw ApiError.badRequest(
          'Attachment must reference a meetingId or customerId',
        );
      }

      if (meetingId) {
        const meeting = await MeetingModel.findOne({
          _id: meetingId,
          isDeleted: false,
        }).lean();
        if (!meeting) {
          cleanupFile();
          throw ApiError.notFound('Meeting not found');
        }
        await assertCanAccessUserScopedRecord(actor, meeting.assignedRepId);
      }

      if (customerId) {
        const customer = await CustomerModel.findOne({
          _id: customerId,
        }).lean();
        if (!customer) {
          cleanupFile();
          throw ApiError.notFound('Customer not found');
        }
        await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);
      }

      const validCategories = Object.values(ATTACHMENT_CATEGORIES) as string[];
      const category = validCategories.includes(rawCat)
        ? (rawCat as (typeof ATTACHMENT_CATEGORIES)[keyof typeof ATTACHMENT_CATEGORIES])
        : ATTACHMENT_CATEGORIES.GENERAL;

      const lat = req.body?.latitude ? Number(req.body.latitude) : NaN;
      const lng = req.body?.longitude ? Number(req.body.longitude) : NaN;

      const doc = await AttachmentModel.create({
        fileName: uploaded.filename,
        originalName: uploaded.originalname,
        mimeType: uploaded.mimetype,
        sizeBytes: uploaded.size,
        storageKey: `disk:${uploaded.filename}`,
        category,
        meetingId,
        customerId,
        geoStamp:
          !Number.isNaN(lat) && !Number.isNaN(lng)
            ? {
                latitude: lat,
                longitude: lng,
                capturedAt: new Date(),
              }
            : null,
        uploadedBy: actor.userId,
      });

      await writeAuditLog({
        actorId: actor.userId,
        actorRole: actor.roleCode,
        action: 'ATTACHMENT_UPLOADED',
        entityType: 'ATTACHMENT',
        entityId: doc._id,
        afterSnapshot: {
          fileName: doc.fileName,
          originalName: doc.originalName,
          category: doc.category,
          sizeBytes: doc.sizeBytes,
        },
        ipAddress: req.ip ?? null,
      });

      return sendSuccess(
        res,
        {
          attachment: {
            id: String(doc._id),
            fileName: doc.fileName,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            category: doc.category,
            sizeBytes: doc.sizeBytes,
            hasBinary: true,
            downloadPath: `/api/v1/attachments/${String(doc._id)}/download`,
            createdAt: doc.createdAt,
          },
        },
        201,
      );
    } catch (err) {
      cleanupFile();
      throw err;
    }
  }),
);

// Authenticated Binary File Download / Preview
attachmentsRouter.get(
  '/:id/download',
  requirePermissions(PERMISSIONS.MEETINGS_READ),
  validateParams(z.object({ id: objectIdSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const doc = await AttachmentModel.findOne({
      _id: paramId(req.params.id),
      deletedAt: null,
    }).lean();
    if (!doc) throw ApiError.notFound('Attachment not found');

    if (doc.meetingId) {
      const meeting = await MeetingModel.findById(doc.meetingId).lean();
      if (meeting) {
        await assertCanAccessUserScopedRecord(actor, meeting.assignedRepId);
      }
    } else if (doc.customerId) {
      const customer = await CustomerModel.findById(doc.customerId).lean();
      if (customer) {
        await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);
      }
    } else {
      await assertCanAccessUserScopedRecord(actor, doc.uploadedBy);
    }

    const rawFile = doc.storageKey.replace(/^disk:/, '');
    const diskPath = path.resolve(UPLOADS_DIR, path.basename(rawFile));
    if (fs.existsSync(diskPath)) {
      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(doc.originalName)}"`,
      );
      fs.createReadStream(diskPath).pipe(res);
      return;
    }

    // Fallback summary for metadata-only / seeded entries
    const summaryContent = `OPTRONIX Document Record\nFile: ${doc.originalName}\nCategory: ${doc.category}\nSize: ${doc.sizeBytes} bytes\nRecorded: ${doc.createdAt.toISOString()}\n`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.originalName)}.txt"`,
    );
    res.send(summaryContent);
  }),
);

// Metadata-only registration (kept for backward compatibility & automated tests)
attachmentsRouter.post(
  '/',
  requirePermissions(PERMISSIONS.MEETINGS_UPDATE),
  validateBody(createAttachmentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const input = req.body as z.infer<typeof createAttachmentSchema>;

    if (!input.meetingId && !input.customerId) {
      throw ApiError.badRequest(
        'Attachment must reference a meetingId or customerId',
      );
    }

    if (input.meetingId) {
      const meeting = await MeetingModel.findOne({
        _id: input.meetingId,
        isDeleted: false,
      }).lean();
      if (!meeting) throw ApiError.notFound('Meeting not found');
      await assertCanAccessUserScopedRecord(actor, meeting.assignedRepId);
    }

    if (input.customerId) {
      const customer = await CustomerModel.findOne({
        _id: input.customerId,
      }).lean();
      if (!customer) throw ApiError.notFound('Customer not found');
      await assertCanAccessUserScopedRecord(actor, customer.assignedRepId);
    }

    const code = generateEntityCode('ATT');
    const safeBase = input.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${code}_${safeBase}`;
    const storageKey = `vault/${new Date().getFullYear()}/${fileName}`;

    const doc = await AttachmentModel.create({
      fileName,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey,
      category: input.category,
      meetingId: input.meetingId ?? null,
      visitSessionId: input.visitSessionId ?? null,
      customerId: input.customerId ?? null,
      geoStamp: input.geoStamp
        ? {
            latitude: input.geoStamp.latitude,
            longitude: input.geoStamp.longitude,
            capturedAt: input.geoStamp.capturedAt ?? new Date(),
          }
        : null,
      uploadedBy: actor.userId,
    });

    await writeAuditLog({
      actorId: actor.userId,
      actorRole: actor.roleCode,
      action: 'ATTACHMENT_REGISTERED',
      entityType: 'ATTACHMENT',
      entityId: doc._id,
      afterSnapshot: {
        fileName: doc.fileName,
        category: doc.category,
        sizeBytes: doc.sizeBytes,
      },
      ipAddress: req.ip ?? null,
    });

    return sendSuccess(
      res,
      {
        attachment: {
          id: String(doc._id),
          fileName: doc.fileName,
          originalName: doc.originalName,
          category: doc.category,
          sizeBytes: doc.sizeBytes,
          createdAt: doc.createdAt,
        },
      },
      201,
    );
  }),
);

attachmentsRouter.delete(
  '/:id',
  requirePermissions(PERMISSIONS.MEETINGS_UPDATE),
  validateParams(z.object({ id: objectIdSchema })),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const doc = await AttachmentModel.findOne({
      _id: paramId(req.params.id),
      deletedAt: null,
    });
    if (!doc) throw ApiError.notFound('Attachment not found');

    await assertCanAccessUserScopedRecord(actor, doc.uploadedBy);
    doc.deletedAt = new Date();
    await doc.save();

    if (doc.storageKey?.startsWith('disk:')) {
      const diskFile = path.resolve(
        UPLOADS_DIR,
        path.basename(doc.storageKey.replace(/^disk:/, '')),
      );
      try {
        if (fs.existsSync(diskFile)) fs.unlinkSync(diskFile);
      } catch {
        // Non-blocking file cleanup
      }
    }

    return sendSuccess(res, { deleted: true });
  }),
);
