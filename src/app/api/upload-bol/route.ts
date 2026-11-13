import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const loadId = (formData.get('loadId') as string) || 'bol';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name?.split('.').pop() || (file.type?.includes('pdf') ? 'pdf' : file.type?.includes('png') ? 'png' : 'jpg');
    const safeName = `signed_bol_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'bols');
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, safeName);

    await writeFile(filePath, buffer);

    // Public URL served directly by Next.js static asset server
    const publicUrl = `/uploads/bols/${safeName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: safeName,
      size: file.size,
      loadId,
    });
  } catch (error: any) {
    console.error('BOL upload failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save BOL document locally' },
      { status: 500 }
    );
  }
}
