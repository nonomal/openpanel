import { createHash } from 'node:crypto';
// adding .js next/script import fixes an issues
// with esm and nextjs (when using pages dir)
import { NextResponse } from 'next/server.js';

const IP_ADDRESS_HEADERS = [
  'x-client-ip',
  'x-forwarded-for',
  'cf-connecting-ip',
  'do-connecting-ip',
  'fastly-client-ip',
  'true-client-ip',
  'x-real-ip',
  'x-cluster-client-ip',
  'x-forwarded',
  'forwarded',
  'x-appengine-user-ip',
  'x-nf-client-connection-ip',
  'x-real-ip',
];

function getIpAddress(headers: Headers, customHeader?: string): string | null {
  const header =
    customHeader ?? IP_ADDRESS_HEADERS.find((name) => !!headers.get(name));

  if (!header) {
    return null;
  }

  const ip = headers.get(header) ? String(headers.get(header)) : null;

  if (!ip) {
    return null;
  }

  if (header === 'x-forwarded-for') {
    return ip?.split(',')?.[0]?.trim() ?? null;
  }

  if (header === 'forwarded') {
    const match = ip.match(/for=(\[?[0-9a-fA-F:.]+\]?)/);

    if (match) {
      return match[1] ?? null;
    }
  }

  return ip;
}

type CreateNextRouteHandlerOptions = {
  apiUrl?: string;
};

function createNextRouteHandler(options: CreateNextRouteHandlerOptions) {
  return async function POST(req: Request) {
    const apiUrl = options.apiUrl ?? 'https://api.openpanel.dev';
    const headers = new Headers(req.headers);
    const clientIp = getIpAddress(headers);
    try {
      console.log('debug:', {
        clientIp,
        userAgent: req.headers.get('user-agent'),
        ...IP_ADDRESS_HEADERS.reduce(
          (acc, name) => {
            acc[name] = getIpAddress(headers, name);
            return acc;
          },
          {} as Record<string, string | null>,
        ),
      });

      const res = await fetch(`${apiUrl}/track`, {
        method: 'POST',
        headers,
        body: JSON.stringify(await req.json()),
      });
      return NextResponse.json(await res.text(), { status: res.status });
    } catch (e) {
      return NextResponse.json(e);
    }
  };
}

function createScriptHandler() {
  return async function GET(req: Request) {
    if (!req.url.endsWith('op1.js')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const scriptUrl = 'https://openpanel.dev/op1.js';
    try {
      const res = await fetch(scriptUrl, {
        next: { revalidate: 86400 },
      });
      const text = await res.text();
      const etag = `"${createHash('md5').update(text).digest('hex')}"`;
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/javascript',
          'Cache-Control':
            'public, max-age=86400, stale-while-revalidate=86400',
          ETag: etag,
        },
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: 'Failed to fetch script',
          message: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      );
    }
  };
}

export const POST = createNextRouteHandler({});
export const GET = createScriptHandler();
