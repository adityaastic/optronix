import type { ApiResponse } from '@/shared';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function buildQueryString(
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, String(val));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuthRefresh?: boolean;
}

export async function apiFetch<T, M = Record<string, unknown>>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: M }> {
  const { body, query, skipAuthRefresh = false, headers, ...rest } = options;
  const url = `${API_BASE_URL}${path}${buildQueryString(query)}`;

  const execute = () =>
    fetch(url, {
      ...rest,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'OptronixWeb',
        ...(body !== undefined && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : typeof body === 'string'
              ? body
              : JSON.stringify(body),
    });

  let res = await execute();

  if (
    res.status === 401 &&
    !skipAuthRefresh &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      res = await execute();
    }
  }

  let json: ApiResponse<T, M> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T, M>;
  } catch {
    if (!res.ok) {
      throw new ApiClientError(
        res.status,
        'NETWORK_OR_PARSE_ERROR',
        `Request failed with HTTP ${res.status}`,
      );
    }
  }

  if (!res.ok || !json || json.success === false) {
    const errPayload =
      json && json.success === false
        ? json.error
        : { code: 'API_ERROR', message: `Request failed (${res.status})` };
    throw new ApiClientError(
      res.status,
      errPayload.code,
      errPayload.message,
      errPayload.details,
    );
  }

  return { data: json.data, meta: json.meta };
}
