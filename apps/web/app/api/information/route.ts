import { nestFetchInternal } from '@/lib/nest-api';
import { NextResponse } from 'next/server';

export async function GET() {
  const { status, body } = await nestFetchInternal<Record<string, unknown>>('/information/public');
  return NextResponse.json(status === 200 ? { success: true, ...body } :
    { success: false, error: body?.message || body?.error || 'Informasi belum dapat dimuat.' }, { status });
}
