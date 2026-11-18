import {
  clearTokens,
  getDefaultApiBaseUrl,
  loadSavedApiBaseUrl,
  loadTokens,
  saveTokens,
} from './storage';

export class MobileApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'MobileApiError';
    this.status = status;
    this.code = code;
  }
}

let cachedBaseUrl: string | null = null;

export async function getActiveApiBaseUrl(): Promise<string> {
  if (!cachedBaseUrl) {
    cachedBaseUrl = await loadSavedApiBaseUrl();
  }
  return cachedBaseUrl;
}

export function setCachedApiBaseUrl(url: string): void {
  cachedBaseUrl = url.trim().replace(/\/+$/, '') || getDefaultApiBaseUrl();
}

export interface ApiEnvelope<T, M = undefined> {
  success: boolean;
  data: T;
  meta?: M;
}

function buildQuery(
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

let refreshInFlight: Promise<string | null> | null = null;

async function attemptMobileRefresh(baseUrl: string): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const { refreshToken } = await loadTokens();
      if (!refreshToken) return null;

      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        await clearTokens();
        return null;
      }

      const payload = (await res.json()) as {
        data?: { tokens?: { accessToken: string; refreshToken: string } };
      };
      const nextTokens = payload.data?.tokens;
      if (!nextTokens?.accessToken) {
        await clearTokens();
        return null;
      }

      await saveTokens(nextTokens.accessToken, nextTokens.refreshToken);
      return nextTokens.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function mobileApiFetch<T, M = undefined>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    skipAuthRefresh?: boolean;
  } = {},
): Promise<ApiEnvelope<T, M>> {
  const baseUrl = await getActiveApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}${buildQuery(options.query)}`;

  const execute = async (overrideToken?: string | null) => {
    const { accessToken } = await loadTokens();
    const tokenToUse = overrideToken !== undefined ? overrideToken : accessToken;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Platform': 'mobile',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (tokenToUse) {
      headers.Authorization = `Bearer ${tokenToUse}`;
    }

    return fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body !== undefined
          ? typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body)
          : undefined,
    });
  };

  let res: Response;
  try {
    res = await execute();
  } catch {
    throw new MobileApiError(
      0,
      'NETWORK_ERROR',
      `Cannot reach OPTRONIX API (${baseUrl}). Verify the backend is running and check the Server URL setting.`,
    );
  }

  if (res.status === 401 && !options.skipAuthRefresh) {
    const refreshedAccess = await attemptMobileRefresh(baseUrl);
    if (refreshedAccess) {
      res = await execute(refreshedAccess);
    }
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON error response
  }

  if (!res.ok) {
    const errObj = (
      json as { error?: { code?: string; message?: string } } | null
    )?.error;
    throw new MobileApiError(
      res.status,
      errObj?.code ?? 'API_ERROR',
      errObj?.message ?? `Request failed (${res.status})`,
    );
  }

  return json as ApiEnvelope<T, M>;
}
