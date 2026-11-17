import { proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export function POST(request: NextRequest) { return proxyJson(request, '/information/admin/folders', 'POST'); }
