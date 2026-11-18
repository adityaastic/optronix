import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getForwardedHost(req: NextRequest): string {
  const raw =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl.host;
  return (raw.split(',')[0] ?? '').trim();
}

function getForwardedProto(req: NextRequest): string {
  const raw =
    req.headers.get('x-forwarded-proto') ||
    req.nextUrl.protocol.replace(':', '');
  return (raw.split(',')[0] ?? 'http').trim().toLowerCase();
}

function resolveCandidateTargets(req: NextRequest): Array<{
  connectHost: string;
  connectPort: number;
  protocol: 'http:' | 'https:';
  hostHeader: string;
}> {
  const origins: string[] = [];
  const configured = process.env.BACKEND_URL?.trim();
  if (configured) {
    origins.push(configured.replace(/\/+$/, '').replace(/\/api\/v1$/i, ''));
  }

  const publicHost = getForwardedHost(req);
  if (publicHost.endsWith('.sslip.io') && !publicHost.startsWith('optronix-api.')) {
    const suffix = publicHost.replace(/^[^.]+\./, '');
    origins.push(`http://optronix-api.${suffix}`);
  }

  if (process.env.NODE_ENV !== 'production' || origins.length === 0) {
    origins.push('http://127.0.0.1:4000');
  }

  const targets: Array<{
    connectHost: string;
    connectPort: number;
    protocol: 'http:' | 'https:';
    hostHeader: string;
  }> = [];

  for (const origin of Array.from(new Set(origins))) {
    try {
      const parsed = new URL(origin);
      const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
      const defaultPort = protocol === 'https:' ? 443 : 80;
      const connectPort = parsed.port ? Number(parsed.port) : defaultPort;

      // If running inside Coolify Docker network, try internal coolify-proxy first for sslip.io hosts to avoid WAN Hairpin NAT timeouts
      if (
        process.env.NODE_ENV === 'production' &&
        protocol === 'http:' &&
        parsed.hostname.endsWith('.sslip.io')
      ) {
        targets.push({
          connectHost: 'coolify-proxy',
          connectPort: 80,
          protocol: 'http:',
          hostHeader: parsed.host,
        });
      }

      targets.push({
        connectHost: parsed.hostname,
        connectPort,
        protocol,
        hostHeader: parsed.host,
      });
    } catch {
      // Ignore malformed candidate origin
    }
  }

  return targets;
}

function sendUpstream(
  target: {
    connectHost: string;
    connectPort: number;
    protocol: 'http:' | 'https:';
    hostHeader: string;
  },
  pathAndQuery: string,
  method: string,
  headers: Record<string, string>,
  bodyBuffer?: Buffer,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http;
    const reqHeaders: Record<string, string | number> = {
      ...headers,
      host: target.hostHeader,
    };
    if (bodyBuffer !== undefined) {
      reqHeaders['content-length'] = bodyBuffer.byteLength;
    }

    const upstreamReq = transport.request(
      {
        hostname: target.connectHost,
        port: target.connectPort,
        path: pathAndQuery,
        method,
        headers: reqHeaders,
        timeout: 6000,
      },
      (res) => resolve(res),
    );

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy(new Error('Upstream connection timeout'));
    });
    upstreamReq.on('error', (err) => reject(err));

    if (bodyBuffer !== undefined && bodyBuffer.byteLength > 0) {
      upstreamReq.write(bodyBuffer);
    }
    upstreamReq.end();
  });
}

async function proxyRequest(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const method = req.method.toUpperCase();
  const publicHost = getForwardedHost(req);
  const publicProto = getForwardedProto(req);

  // Enforce same-origin CSRF protection using reverse-proxy aware Host header
  if (!SAFE_METHODS.has(method)) {
    const origin = req.headers.get('origin');
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      if (
        originHost !== publicHost &&
        origin !== req.nextUrl.origin
      ) {
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
  }

  const { path } = await context.params;
  const subPath = path.join('/');
  const pathAndQuery = `/api/v1/${subPath}${req.nextUrl.search}`;

  const forwardHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower === 'transfer-encoding' ||
      lower === 'accept-encoding'
    ) {
      return;
    }
    forwardHeaders[lower] = value;
  });
  forwardHeaders['x-forwarded-proto'] = publicProto;
  forwardHeaders['x-forwarded-host'] = publicHost;

  const bodyBuffer = !SAFE_METHODS.has(method)
    ? Buffer.from(await req.arrayBuffer())
    : undefined;

  const candidates = resolveCandidateTargets(req);
  let upstreamRes: http.IncomingMessage | null = null;

  for (const candidate of candidates) {
    try {
      upstreamRes = await sendUpstream(
        candidate,
        pathAndQuery,
        method,
        forwardHeaders,
        bodyBuffer,
      );
      break;
    } catch {
      // Try next candidate target
    }
  }

  if (!upstreamRes) {
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

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(upstreamRes.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (
      lower === 'set-cookie' ||
      lower === 'content-encoding' ||
      lower === 'transfer-encoding' ||
      lower === 'connection'
    ) {
      continue;
    }
    responseHeaders.set(
      key,
      Array.isArray(value) ? value.join(', ') : String(value),
    );
  }

  const rawCookies = upstreamRes.headers['set-cookie'];
  if (Array.isArray(rawCookies)) {
    for (const cookie of rawCookies) {
      responseHeaders.append('set-cookie', cookie);
    }
  } else if (typeof rawCookies === 'string') {
    responseHeaders.append('set-cookie', rawCookies);
  }

  const webStream = Readable.toWeb(upstreamRes) as unknown as ReadableStream;
  return new Response(webStream, {
    status: upstreamRes.statusCode ?? 200,
    statusText: upstreamRes.statusMessage ?? 'OK',
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
