import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function resolveBackendOrigin(): string {
  const raw = (process.env.BACKEND_URL || 'http://127.0.0.1:4000').trim();
  return raw.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const method = req.method.toUpperCase();

  // Enforce same-origin CSRF protection at the Next.js proxy edge
  if (!SAFE_METHODS.has(method)) {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'CSRF_ORIGIN_MISMATCH',
            message: `Cross-origin state mutation blocked for origin: ${origin}`,
          },
        },
        { status: 403 },
      );
    }
  }

  const { path } = await context.params;
  const subPath = path.join('/');
  const targetUrl = `${resolveBackendOrigin()}/api/v1/${subPath}${req.nextUrl.search}`;

  const upstreamHeaders = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer' ||
      lower === 'connection' ||
      lower === 'content-length'
    ) {
      return;
    }
    upstreamHeaders.set(key, value);
  });

  if (!upstreamHeaders.has('x-forwarded-proto')) {
    upstreamHeaders.set(
      'x-forwarded-proto',
      req.nextUrl.protocol.replace(':', ''),
    );
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: upstreamHeaders,
    redirect: 'manual',
  };

  if (!SAFE_METHODS.has(method) && req.body) {
    init.body = req.body;
    init.duplex = 'half';
  }

  try {
    const upstreamRes = await fetch(targetUrl, init);

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        lower === 'set-cookie' ||
        lower === 'content-encoding' ||
        lower === 'transfer-encoding' ||
        lower === 'connection'
      ) {
        return;
      }
      responseHeaders.set(key, value);
    });

    const cookies = upstreamRes.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      responseHeaders.append('set-cookie', cookie);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message:
            'Unable to reach OPTRONIX backend service. Verify BACKEND_URL is running.',
        },
      },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
