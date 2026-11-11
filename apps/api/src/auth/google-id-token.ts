import { UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Verifikasi ID token Google (kredensial Google Identity Services) DI SERVER.
 *
 * Sebelumnya browser membaca token sendiri lalu hanya mengirim `email`, dan
 * server membuat sesi untuk email itu tanpa bukti apa pun — siapa pun bisa
 * masuk sebagai akun mana pun (termasuk Superadmin) dengan satu POST.
 * Sekarang identitas HANYA diambil dari token yang tanda tangannya cocok
 * dengan kunci publik Google dan ditujukan untuk Client ID aplikasi ini.
 */

/** Client ID publik yang juga dipakai halaman login (NEXT_PUBLIC_GOOGLE_CLIENT_ID). */
export const DEFAULT_GOOGLE_CLIENT_ID = '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export interface VerifiedGoogleIdentity {
    email: string;
    name: string;
    picture: string | null;
    sub: string;
}

let jwks: JWTVerifyGetKey | null = null;
/** Hanya untuk test: ganti sumber kunci publik. */
export function setGoogleJwksForTest(keySet: JWTVerifyGetKey | null) {
    jwks = keySet;
}

export function googleClientIds(): string[] {
    const configured = [process.env.GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID]
        .flatMap((value) => (value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean);
    return configured.length ? Array.from(new Set(configured)) : [DEFAULT_GOOGLE_CLIENT_ID];
}

export async function verifyGoogleIdToken(credential: unknown): Promise<VerifiedGoogleIdentity> {
    if (typeof credential !== 'string' || credential.split('.').length !== 3 || credential.length > 4096) {
        throw new UnauthorizedException('Kredensial Google tidak valid. Silakan masuk ulang dengan Google.');
    }
    if (!jwks) jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

    let payload: Record<string, unknown>;
    try {
        ({ payload } = await jwtVerify(credential, jwks, {
            issuer: GOOGLE_ISSUERS,
            audience: googleClientIds(),
            algorithms: ['RS256'],
            clockTolerance: 60,
        }));
    } catch {
        throw new UnauthorizedException('Kredensial Google tidak valid atau kedaluwarsa. Silakan masuk ulang dengan Google.');
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    if (!email || !verified) {
        throw new UnauthorizedException('Email akun Google belum terverifikasi.');
    }
    return {
        email,
        name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 150) : email.split('@')[0],
        picture: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture : null,
        sub: typeof payload.sub === 'string' ? payload.sub : '',
    };
}
