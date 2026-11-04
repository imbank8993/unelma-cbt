import { proxyGet } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  return proxyGet(request, `/tokens/check-access${search}`);
}
