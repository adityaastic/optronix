import type { Request, Response } from 'express';
import type { CustomerListQuery } from '../../shared/index.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { paramId, sendSuccess } from '../../common/response.js';
import { getAuthActor } from '../../middleware/auth.middleware.js';
import {
  addCustomerContact,
  archiveCustomer,
  createCustomer,
  getCustomerDetails,
  listCustomers,
  updateCustomer,
} from './customers.service.js';

export const createCustomerController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const customer = await createCustomer(actor, req.body, req.ip ?? null);
    return sendSuccess(res, { customer }, 201);
  },
);

export const listCustomersController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const query = req.validatedQuery as CustomerListQuery;
    const result = await listCustomers(actor, query);
    return sendSuccess(
      res,
      { customers: result.items, stats: result.stats },
      200,
      result.pagination,
    );
  },
);

export const getCustomerDetailsController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const customer = await getCustomerDetails(actor, paramId(req.params.id));
    return sendSuccess(res, { customer });
  },
);

export const updateCustomerController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const customer = await updateCustomer(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { customer });
  },
);

export const addCustomerContactController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const contact = await addCustomerContact(actor, paramId(req.params.id), req.body);
    return sendSuccess(res, { contact }, 201);
  },
);

export const archiveCustomerController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = getAuthActor(req);
    const archived = await archiveCustomer(
      actor,
      paramId(req.params.id),
      req.body,
      req.ip ?? null,
    );
    return sendSuccess(res, { customer: archived });
  },
);
