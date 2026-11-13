import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string[] }> }
) {
  try {
    const { file } = await params;
    const fileName = file.join('/');
    const safeFileName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), 'public', 'brand', safeFileName);

    if (!fs.existsSync(filePath)) {
      return new NextResponse('Brand asset not found', { status: 404 });
    }

    const ext = path.extname(safeFileName).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'image/png';
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse('Brand asset error', { status: 500 });
  }
}
