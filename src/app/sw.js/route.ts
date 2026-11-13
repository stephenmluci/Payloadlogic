import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    const content = fs.readFileSync(swPath, 'utf8');
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    return new NextResponse('// Service Worker not found', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }
}
