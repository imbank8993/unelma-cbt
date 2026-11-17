import { proxyGet, proxyJson } from '@/lib/nest-proxy';
import { NextRequest, NextResponse } from 'next/server';

const allowed: Record<string, RegExp[]> = {
  GET: [/^channels\/[^/]+\/settings$/, /^media\/storage$/],
  PUT: [/^settings$/, /^channels\/[^/]+\/settings$/, /^posts\/[0-9a-f-]+(?:\/reference)?$/i],
  POST: [/^channels\/sync$/, /^posts\/[0-9a-f-]+\/(publish|sync)$/i, /^media\/cleanup$/],
  DELETE: [/^posts\/[0-9a-f-]+$/i],
};
async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joined = path.join('/');
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if (['GET', 'HEAD'].includes(request.method) && new RegExp(`^media/${uuid}/${uuid}\\.(jpg|png|mp4)$`, 'i').test(joined)) {
    const signature = request.nextUrl.searchParams.get('signature') || '';
    if (!/^[a-f0-9]{64}$/.test(signature)) return new NextResponse(null, { status: 404 });
    try {
      const response = await fetch(`${process.env.NEST_API_URL || 'http://127.0.0.1:3019/api'}/social-media/${joined}?signature=${signature}`, {
        method: request.method, headers: request.headers.has('range') ? { Range: request.headers.get('range')! } : {}, cache: 'no-store',
      });
      const headers = new Headers();
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control', 'x-content-type-options']) {
        const value = response.headers.get(name); if (value) headers.set(name, value);
      }
      return new NextResponse(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
    } catch { return new NextResponse(null, { status: 503 }); }
  }
  if (path.some(part => part.includes('/') || part.includes('\\') || part === '.' || part === '..') ||
    !allowed[request.method]?.some(pattern => pattern.test(joined))) return NextResponse.json({ success: false, error: 'Endpoint tidak ditemukan.' }, { status: 404 });
  const target = `/social-media/${path.map(encodeURIComponent).join('/')}`;
  return request.method === 'GET' ? proxyGet(request, target) : proxyJson(request, target, request.method as 'POST' | 'PUT' | 'DELETE');
}
export { forward as GET, forward as HEAD, forward as PUT, forward as POST, forward as DELETE };
