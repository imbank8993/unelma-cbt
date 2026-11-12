import { proxyGet } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

/** Katalog jenis ujian kustom (Pengaturan → Jenis Ujian). */
export async function GET(request: NextRequest) {
    return proxyGet(request, '/settings/exam-types');
}
