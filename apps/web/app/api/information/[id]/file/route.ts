import { NextResponse } from 'next/server';

const NEST_API_URL = process.env.NEST_API_URL || 'http://127.0.0.1:3019/api';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await fetch(`${NEST_API_URL}/information/public/${encodeURIComponent(id)}/file`, { cache: 'no-store' });
    if (!response.ok) return new NextResponse(null, { status: response.status });
    const headers = new Headers();
    for (const key of ['content-type', 'content-length', 'content-disposition', 'cache-control', 'etag']) {
      const value = response.headers.get(key);
      if (value) headers.set(key, value);
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    return new NextResponse(response.body, { status: 200, headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
