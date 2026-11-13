import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
    const content = fs.readFileSync(manifestPath, 'utf8');
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    return new NextResponse(JSON.stringify({ error: 'Manifest not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
