import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  archiveCustomerSchema,
  contactInputSchema,
  createCustomerSchema,
  customerListQuerySchema,
  objectIdSchema,
  updateCustomerSchema,
} from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { sendSuccess } from '../../common/response.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.middleware.js';
import {
  addCustomerContactController,
  archiveCustomerController,
  createCustomerController,
  getCustomerDetailsController,
  listCustomersController,
  updateCustomerController,
} from './customers.controller.js';

const idParamSchema = z.object({ id: objectIdSchema });

export const customersRouter: Router = Router();

customersRouter.use(authenticate);

const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3).max(240),
});

customersRouter.get(
  '/geocode',
  requirePermissions(PERMISSIONS.CUSTOMERS_READ),
  validateQuery(geocodeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.validatedQuery as z.infer<typeof geocodeQuerySchema>;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
    try {
      const upstream = await fetch(url, {
        headers: {
          'User-Agent': 'OptronixSalesOperations/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!upstream.ok) {
        return sendSuccess(res, { results: [] });
      }
      const data = (await upstream.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
      }>;
      return sendSuccess(res, {
        results: data.map((item) => ({
          displayName: item.display_name,
          latitude: Number(Number(item.lat).toFixed(6)),
          longitude: Number(Number(item.lon).toFixed(6)),
        })),
      });
    } catch {
      return sendSuccess(res, { results: [] });
    }
  }),
);

customersRouter.get(
  '/',
  requirePermissions(PERMISSIONS.CUSTOMERS_READ),
  validateQuery(customerListQuerySchema),
  listCustomersController,
);

customersRouter.post(
  '/',
  requirePermissions(PERMISSIONS.CUSTOMERS_CREATE),
  validateBody(createCustomerSchema),
  createCustomerController,
);

customersRouter.get(
  '/:id',
  requirePermissions(PERMISSIONS.CUSTOMERS_READ),
  validateParams(idParamSchema),
  getCustomerDetailsController,
);

customersRouter.patch(
  '/:id',
  requirePermissions(PERMISSIONS.CUSTOMERS_UPDATE),
  validateParams(idParamSchema),
  validateBody(updateCustomerSchema),
  updateCustomerController,
);

customersRouter.post(
  '/:id/contacts',
  requirePermissions(PERMISSIONS.CUSTOMERS_UPDATE),
  validateParams(idParamSchema),
  validateBody(contactInputSchema),
  addCustomerContactController,
);

customersRouter.post(
  '/:id/archive',
  requirePermissions(PERMISSIONS.CUSTOMERS_ARCHIVE),
  validateParams(idParamSchema),
  validateBody(archiveCustomerSchema),
  archiveCustomerController,
);
