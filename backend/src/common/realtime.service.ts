import type { Response } from 'express';
import { ROLE_CODES, type RoleCode } from '../shared/index.js';

export interface RealtimePayload {
  event:
    | 'NOTIFICATION_CREATED'
    | 'MEETING_UPDATED'
    | 'VISIT_ACTIVITY'
    | 'REP_LOCATION_UPDATED'
    | 'SETTINGS_UPDATED';
  recipientUserId?: string | null;
  actorId?: string | null;
  entityId?: string | null;
  title?: string;
  timestamp?: string;
}

interface SseClient {
  id: string;
  userId: string;
  roleCode: RoleCode;
  res: Response;
}

const clients = new Map<string, SseClient>();

export function registerSseClient(params: {
  userId: string;
  roleCode: RoleCode;
  res: Response;
}): () => void {
  const id = `${params.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  clients.set(id, { id, ...params });

  const heartbeat = setInterval(() => {
    try {
      params.res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      clients.delete(id);
    }
  }, 25_000);

  return () => {
    clearInterval(heartbeat);
    clients.delete(id);
  };
}

export function publishRealtimeEvent(payload: RealtimePayload): void {
  const enriched = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };
  const serialized = `data: ${JSON.stringify(enriched)}\n\n`;

  for (const client of clients.values()) {
    // Deliver global events (SETTINGS_UPDATED), direct recipient events, or manager/admin operational events
    const isGlobal = payload.event === 'SETTINGS_UPDATED';
    const isDirect =
      payload.recipientUserId && payload.recipientUserId === client.userId;
    const isManagerFeed =
      !payload.recipientUserId &&
      (client.roleCode === ROLE_CODES.ADMIN ||
        client.roleCode === ROLE_CODES.SALES_MANAGER ||
        payload.actorId === client.userId);

    if (isGlobal || isDirect || isManagerFeed) {
      try {
        client.res.write(serialized);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}
