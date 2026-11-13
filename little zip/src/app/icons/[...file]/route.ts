import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string[] }> }
) {
  try {
    const { file } = await params;
    const fileName = file.join('/');
    const safeFileName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), 'public', 'icons', safeFileName);

    if (!fs.existsSync(filePath)) {
      return new NextResponse('Icon not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse('Icon error', { status: 500 });
  }
}
