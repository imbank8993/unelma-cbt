import { nestFetchInternal } from '@/lib/nest-api';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, body } = await nestFetchInternal<Record<string, unknown>>(`/information/public/${encodeURIComponent(id)}`);
  return NextResponse.json(status === 200 ? { success: true, ...body } :
    { success: false, error: body?.message || body?.error || 'Informasi tidak ditemukan.' }, { status });
}
