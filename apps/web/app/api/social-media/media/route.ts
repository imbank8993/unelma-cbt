import { extractRequestToken } from '@/lib/app-jwt';
import { rejectCrossOriginMutation } from '@/lib/nest-proxy';
import { resolvePublicOrigin } from '@/lib/public-origin';
import { NextRequest, NextResponse } from 'next/server';

const NEST_API_URL = process.env.NEST_API_URL || 'http://127.0.0.1:3019/api';

export async function POST(request: NextRequest) {
  const originError = rejectCrossOriginMutation(request, 'POST');
  if (originError) return originError;
  const token = extractRequestToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'Silakan masuk sebagai Admin.' }, { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) return NextResponse.json({ success: false, error: 'Gunakan unggahan berkas.' }, { status: 400 });
  try {
    const response = await fetch(`${NEST_API_URL}/social-media/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': request.headers.get('content-type')!, 'x-social-public-origin': resolvePublicOrigin(request) },
      body: request.body as BodyInit,
      // @ts-expect-error Node fetch requires duplex for streamed multipart requests.
      duplex: 'half',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(response.ok ? { ...data, success: true } :
      { success: false, error: response.status === 413 ? 'Ukuran berkas maksimal 25 MB; gambar maksimal 8 MB.' : data.message || data.error || 'Unggah media gagal.' }, { status: response.status });
  } catch { return NextResponse.json({ success: false, error: 'Backend tidak dapat dihubungi.' }, { status: 503 }); }
}
