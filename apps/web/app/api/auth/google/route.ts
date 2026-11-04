import { encodeSessionCookie, sessionCookieName, sessionCookieOptions } from '@/lib/app-jwt';
import { nestFetchInternal } from '@/lib/nest-api';
import { NextRequest, NextResponse } from 'next/server';

const TWELVE_HOURS = 12 * 60 * 60;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { email, name, avatarUrl, googleId, schoolName, className } = body;

        if (!email) {
            return NextResponse.json(
                { success: false, error: 'Email akun Google wajib disertakan.' },
                { status: 400 },
            );
        }

        const { status, body: resBody } = await nestFetchInternal<{
            access_token?: string;
            user?: unknown;
            error?: string;
            message?: string;
        }>('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ email, name: name || 'Pengguna Google', avatarUrl, googleId, schoolName, className }),
        });

        if (status !== 200 || !resBody?.access_token) {
            return NextResponse.json(
                { success: false, error: resBody?.error || resBody?.message || 'Gagal autentikasi akun Google.' },
                { status: status === 200 ? 401 : status },
            );
        }

        const response = NextResponse.json({ success: true, user: resBody.user });
        response.cookies.set(
            sessionCookieName(),
            encodeSessionCookie(resBody.access_token),
            sessionCookieOptions(TWELVE_HOURS),
        );
        response.headers.set('Cache-Control', 'no-store');
        return response;
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message || 'Terjadi kesalahan sistem.' },
            { status: 500 },
        );
    }
}
