import { nestFetchInternal } from '@/lib/nest-api';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const { status, body } = await nestFetchInternal<any[]>('/tokens/packages', { method: 'GET' });
  if (status >= 200 && status < 300) {
    return NextResponse.json({ success: true, packages: body || [] });
  }
  return NextResponse.json({ success: false, packages: [], error: 'Gagal mengambil paket token.' }, { status });
}
