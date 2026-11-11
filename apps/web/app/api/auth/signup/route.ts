import { encodeSessionCookie, sessionCookieName, sessionCookieOptions } from '@/lib/app-jwt';
import { nestFetchInternal } from '@/lib/nest-api';
import { NextRequest, NextResponse } from 'next/server';

const TWELVE_HOURS = 12 * 60 * 60;

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({}));
    const { email, name, schoolName, password, avatarUrl, credential } = body;

    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    if (!email || !name || !schoolName) {
        return NextResponse.json(
            { success: false, error: 'Email, Nama Lengkap, dan Asal Sekolah wajib diisi.' },
            { status: 400 },
        );
    }

    const { status, body: resBody } = await nestFetchInternal<{
        access_token?: string;
        user?: unknown;
        error?: string;
        message?: string;
    }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
            email,
            name,
            schoolName,
            password: password || undefined,
            avatarUrl: avatarUrl || undefined,
            credential: typeof credential === 'string' && credential ? credential : undefined,
            ipAddress,
            userAgent,
        }),
    });

    if (status !== 201 && status !== 200 || !resBody?.access_token) {
        return NextResponse.json(
            { success: false, error: resBody?.error || resBody?.message || 'Pendaftaran gagal.' },
            { status: status >= 400 ? status : 400 },
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
}
