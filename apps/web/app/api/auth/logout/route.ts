import { SECURE_SESSION_COOKIE,SESSION_COOKIE,sessionCookieOptions } from '@/lib/app-jwt';
import { resolvePublicOrigin } from '@/lib/public-origin';
import { NextRequest, NextResponse } from 'next/server';

function clearSession(response: NextResponse): NextResponse {
    // Opsi lainnya harus sama persis dengan saat cookie diterbitkan, jika
    // tidak browser membuat cookie kedua alih-alih menimpa yang lama.
    response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
    response.cookies.set(SECURE_SESSION_COOKIE, '', { ...sessionCookieOptions(0), secure: true });
    response.headers.set('Cache-Control', 'no-store');
    return response;
}

export async function POST() {
    const response = NextResponse.json({ success: true });
    return clearSession(response);
}

/** Keluar lewat tautan: hapus sesi lalu kembali ke halaman login Unelma CBT sendiri. */
export async function GET(request: NextRequest) {
    const destination = new URL('/login?logged_out=1', resolvePublicOrigin(request));
    const response = NextResponse.redirect(destination);
    response.headers.set('Cache-Control', 'no-store');
    return clearSession(response);
}
