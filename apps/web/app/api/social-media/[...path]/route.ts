import { proxyGet, proxyJson } from '@/lib/nest-proxy';
import { NextRequest, NextResponse } from 'next/server';

const allowed: Record<string, RegExp[]> = {
  GET: [/^channels\/[^/]+\/settings$/],
  PUT: [/^settings$/, /^channels\/[^/]+\/settings$/, /^posts\/[0-9a-f-]+(?:\/reference)?$/i],
  POST: [/^channels\/sync$/, /^posts\/[0-9a-f-]+\/(publish|sync)$/i],
  DELETE: [/^posts\/[0-9a-f-]+$/i],
};
async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joined = path.join('/');
  if (path.some(part => part.includes('/') || part.includes('\\') || part === '.' || part === '..') ||
    !allowed[request.method]?.some(pattern => pattern.test(joined))) return NextResponse.json({ success: false, error: 'Endpoint tidak ditemukan.' }, { status: 404 });
  const target = `/social-media/${path.map(encodeURIComponent).join('/')}`;
  return request.method === 'GET' ? proxyGet(request, target) : proxyJson(request, target, request.method as 'POST' | 'PUT' | 'DELETE');
}
export { forward as GET, forward as PUT, forward as POST, forward as DELETE };
