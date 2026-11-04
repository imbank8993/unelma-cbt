import { proxyGet, proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return proxyGet(request, '/tokens/admin/midtrans-config');
}

export async function POST(request: NextRequest) {
  return proxyJson(request, '/tokens/admin/midtrans-config', 'POST');
}
