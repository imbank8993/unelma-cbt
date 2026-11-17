import { proxy, proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(request, `/information/admin/documents/${encodeURIComponent(id)}`, 'PATCH');
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(request, `/information/admin/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
