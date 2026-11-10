import { proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyJson(request, `/tokens/admin/packages/${encodeURIComponent(id)}`, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyJson(request, `/tokens/admin/packages/${encodeURIComponent(id)}`, 'DELETE');
}
