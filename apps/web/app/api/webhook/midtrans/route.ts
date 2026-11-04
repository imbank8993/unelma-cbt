import { nestFetchInternal } from '@/lib/nest-api';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const { status, body } = await nestFetchInternal<any>('/tokens/payments/webhook', {
      method: 'POST',
      body: bodyText,
    });
    return NextResponse.json(body || { status: 'ok' }, { status });
  } catch (err) {
    console.error('[Midtrans Webhook Error]:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
