import { proxyGet, proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    return proxyGet(request, '/auth/profile');
}

export async function PATCH(request: NextRequest) {
    return proxyJson(request, '/auth/profile', 'PATCH');
}
