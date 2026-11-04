import { proxy } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
) {
    const { userId } = await context.params;
    return proxy(request, `/auth/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
