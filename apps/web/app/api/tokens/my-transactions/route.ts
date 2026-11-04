import { proxyGet } from '@/lib/nest-proxy';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const res = await proxyGet(request, '/tokens/my-transactions');
  const data = await res.json();
  if (data.success && Array.isArray(data.data)) {
    return NextResponse.json({ success: true, transactions: data.data });
  }
  return NextResponse.json(data, { status: res.status });
}
