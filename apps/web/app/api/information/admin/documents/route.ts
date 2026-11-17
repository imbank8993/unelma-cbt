import { extractRequestToken } from '@/lib/app-jwt';
import { rejectCrossOriginMutation } from '@/lib/nest-proxy';
import { NextRequest, NextResponse } from 'next/server';

const NEST_API_URL = process.env.NEST_API_URL || 'http://127.0.0.1:3019/api';

export async function POST(request: NextRequest) {
  const originError = rejectCrossOriginMutation(request, 'POST');
  if (originError) return originError;
  const token = extractRequestToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'Silakan masuk sebagai Admin.' }, { status: 401 });
  try {
    const response = await fetch(`${NEST_API_URL}/information/admin/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': request.headers.get('content-type') || 'multipart/form-data',
      },
      body: request.body as BodyInit,
      // @ts-expect-error Node fetch requires duplex for streamed multipart requests.
      duplex: 'half',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(response.ok ? { success: true, ...data } :
      { success: false, error: data.message || data.error || 'Unggah PDF gagal.' }, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, error: 'Backend tidak dapat dihubungi.' }, { status: 503 });
  }
}
