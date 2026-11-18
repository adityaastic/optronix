import { apiFetch } from './api-client';

const STORAGE_KEY = 'optronix_offline_visit_queue_v1';

export interface QueuedVisitAction {
  id: string;
  meetingId: string;
  meetingCode?: string;
  action: 'check-in' | 'check-out';
  payload: Record<string, unknown>;
  queuedAt: string;
}

export function getOfflineVisitQueue(meetingId?: string): QueuedVisitAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedVisitAction[];
    if (!Array.isArray(parsed)) return [];
    return meetingId
      ? parsed.filter((item) => item.meetingId === meetingId)
      : parsed;
  } catch {
    return [];
  }
}

export function enqueueOfflineVisitAction(
  item: Omit<QueuedVisitAction, 'id' | 'queuedAt'>,
): QueuedVisitAction {
  const entry: QueuedVisitAction = {
    ...item,
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queuedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    const existing = getOfflineVisitQueue();
    existing.push(entry);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent('optronix:offline-queue-changed'));
  }
  return entry;
}

export async function flushOfflineVisitQueue(): Promise<{
  synced: number;
  remaining: number;
}> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { synced: 0, remaining: getOfflineVisitQueue().length };
  }

  const queue = getOfflineVisitQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const remaining: QueuedVisitAction[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await apiFetch(`/meetings/${item.meetingId}/${item.action}`, {
        method: 'POST',
        body: item.payload,
      });
      synced += 1;
    } catch (err) {
      // Keep network-level failures in queue; drop 4xx business conflicts so queue never deadlocks
      const isNetworkFailure =
        err instanceof TypeError ||
        (typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          Number((err as { status: number }).status) === 0);
      if (isNetworkFailure) {
        remaining.push(item);
      }
    }
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('optronix:offline-queue-changed'));
  return { synced, remaining: remaining.length };
}
