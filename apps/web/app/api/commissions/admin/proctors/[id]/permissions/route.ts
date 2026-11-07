import { proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJson(request, `/commissions/admin/proctors/${id}/permissions`, 'PUT');
}
