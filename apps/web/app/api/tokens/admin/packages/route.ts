import { proxyGet, proxyJson } from '@/lib/nest-proxy';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const res = await proxyGet(request, '/tokens/admin/packages');
  const data = await res.json();
  if (Array.isArray(data)) {
    return NextResponse.json({ success: true, packages: data });
  }
  if (data.success && Array.isArray(data.data)) {
    return NextResponse.json({ success: true, packages: data.data });
  }
  if (data.success && Array.isArray(data.packages)) {
    return NextResponse.json(data);
  }
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  return proxyJson(request, '/tokens/admin/packages', 'POST');
}
