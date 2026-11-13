import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'receipt';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name?.split('.').pop() || (file.type?.includes('pdf') ? 'pdf' : 'jpg');
    const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'receipts');
    const filePath = path.join(uploadDir, safeName);

    await writeFile(filePath, buffer);

    // Public URL served directly by Next.js static asset server
    const publicUrl = `/uploads/receipts/${safeName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: safeName,
      size: file.size,
    });
  } catch (error: any) {
    console.error('Local receipt upload failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save receipt locally' },
      { status: 500 }
    );
  }
}
