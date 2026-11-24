import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, mkdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { adminApp } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'truckin-smart.firebasestorage.app';

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getContentTypeFromExt(ext: string, fallback?: string): string {
  const clean = ext.toLowerCase();
  if (clean === 'pdf') return 'application/pdf';
  if (clean === 'png') return 'image/png';
  if (clean === 'webp') return 'image/webp';
  if (clean === 'heic') return 'image/heic';
  if (clean === 'jpg' || clean === 'jpeg') return 'image/jpeg';
  return fallback || 'application/octet-stream';
}

export async function GET(request: NextRequest) {
  try {
    const rawName = request.nextUrl.searchParams.get('file') || '';
    const safeName = sanitizeFileName(rawName);
    if (!safeName) {
      return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
    }

    const candidatePaths = [
      path.join(os.tmpdir(), 'payloadlogic_bols', safeName),
      path.join(process.cwd(), 'public', 'uploads', 'bols', safeName),
    ];

    for (const candidate of candidatePaths) {
      try {
        const buf = await readFile(candidate);
        const ext = safeName.split('.').pop() || 'jpg';
        return new NextResponse(new Uint8Array(buf), {
          status: 200,
          headers: {
            'Content-Type': getContentTypeFromExt(ext),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      } catch {
        // Try next path
      }
    }

    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to read BOL document' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const rawLoadId = (formData.get('loadId') as string) || 'bol';
    const safeLoadId = rawLoadId.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const rawExt =
      file.name?.split('.').pop() ||
      (file.type?.includes('pdf')
        ? 'pdf'
        : file.type?.includes('png')
          ? 'png'
          : file.type?.includes('webp')
            ? 'webp'
            : 'jpg');
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
    const contentType = getContentTypeFromExt(ext, file.type);
    const safeName = `signed_bol_${safeLoadId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // 1. Prefer durable Firebase Cloud Storage via Admin SDK when credentials are available
    try {
      const bucket = getStorage(adminApp).bucket(STORAGE_BUCKET);
      const objectPath = `signed_bols/${safeLoadId}/${safeName}`;
      const downloadToken = crypto.randomUUID();
      const bucketFile = bucket.file(objectPath);

      await bucketFile.save(buffer, {
        resumable: false,
        contentType,
        metadata: {
          contentType,
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      const cloudUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
        bucket.name,
      )}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;

      return NextResponse.json({
        success: true,
        url: cloudUrl,
        fileName: safeName,
        size: file.size,
        loadId: rawLoadId,
      });
    } catch (cloudErr: any) {
      console.warn('[upload-bol] Admin Cloud Storage unavailable, using local/API fallback:', cloudErr?.message || cloudErr);
    }

    // 2. Fallback: write to OS temp dir (always writable on serverless/containers) and public dir if writable,
    // served reliably via GET /api/upload-bol?file=<safeName>
    const tmpUploadDir = path.join(os.tmpdir(), 'payloadlogic_bols');
    await mkdir(tmpUploadDir, { recursive: true });
    await writeFile(path.join(tmpUploadDir, safeName), buffer);

    try {
      const publicUploadDir = path.join(process.cwd(), 'public', 'uploads', 'bols');
      await mkdir(publicUploadDir, { recursive: true });
      await writeFile(path.join(publicUploadDir, safeName), buffer);
    } catch {
      // Non-fatal if container root filesystem is read-only
    }

    const apiUrl = `/api/upload-bol?file=${encodeURIComponent(safeName)}`;

    return NextResponse.json({
      success: true,
      url: apiUrl,
      fileName: safeName,
      size: file.size,
      loadId: rawLoadId,
    });
  } catch (error: any) {
    console.error('BOL upload failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save BOL document' },
      { status: 500 },
    );
  }
}
