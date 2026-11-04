import { extractRequestToken } from '@/lib/app-jwt';
import { nestFetchAsUser, nestFetchInternal } from '@/lib/nest-api';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const token = extractRequestToken(request);

    if (token) {
      const { status, body } = await nestFetchAsUser<any>('/tokens/payments/create', token, {
        method: 'POST',
        body: bodyText,
      });
      return NextResponse.json(body || { success: false }, { status });
    } else {
      const { status, body } = await nestFetchInternal<any>('/tokens/payments/create', {
        method: 'POST',
        body: bodyText,
      });
      return NextResponse.json(body || { success: false }, { status });
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Gagal memproses pembayaran.' },
      { status: 500 },
    );
  }
}
