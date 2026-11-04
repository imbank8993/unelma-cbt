import { proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    const { userId } = await context.params;
    return proxyJson(request, `/auth/admin/users/${encodeURIComponent(userId)}/role`, 'POST');
}
