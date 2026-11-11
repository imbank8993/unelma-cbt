import { proxyGet } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') || 'pending';
  return proxyGet(request, `/commissions/admin/applications?status=${encodeURIComponent(status)}`);
}
