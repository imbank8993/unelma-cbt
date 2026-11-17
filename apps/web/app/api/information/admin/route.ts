import { proxyGet } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

export function GET(request: NextRequest) { return proxyGet(request, '/information/admin'); }
