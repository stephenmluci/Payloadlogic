import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';

/**
 * Compresses large mobile camera photos into a legible JPEG (~200-500KB, max 2000px)
 * so uploads succeed quickly on cellular connections without hitting payload limits.
 * Leaves PDFs and small images untouched.
 */
async function optimizeBolFileForUpload(file: File | Blob): Promise<{ blob: File | Blob; ext: string }> {
  const origExt =
    file instanceof File
      ? (file.name.split('.').pop()?.toLowerCase() || (file.type.includes('pdf') ? 'pdf' : 'jpg'))
      : file.type.includes('pdf')
        ? 'pdf'
        : 'jpg';

  const isPdf = origExt === 'pdf' || file.type === 'application/pdf';
  const isImage = !isPdf && (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(origExt));

  if (
    !isImage ||
    file.size <= 800 * 1024 ||
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return { blob: file, ext: origExt };
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    const safetyTimer = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      resolve({ blob: file, ext: origExt });
    }, 4000);

    img.onload = () => {
      clearTimeout(safetyTimer);
      try {
        const MAX_DIM = 2000;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve({ blob: file, ext: origExt });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (compressed) => {
            URL.revokeObjectURL(objectUrl);
            if (compressed && compressed.size < file.size) {
              const baseName = file instanceof File ? file.name.replace(/\.[^.]+$/, '') : `signed_bol_${Date.now()}`;
              const outFile = new File([compressed], `${baseName}.jpg`, { type: 'image/jpeg' });
              resolve({ blob: outFile, ext: 'jpg' });
            } else {
              resolve({ blob: file, ext: origExt });
            }
          },
          'image/jpeg',
          0.82,
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve({ blob: file, ext: origExt });
      }
    };

    img.onerror = () => {
      clearTimeout(safetyTimer);
      URL.revokeObjectURL(objectUrl);
      resolve({ blob: file, ext: origExt });
    };

    img.src = objectUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads a signed Bill of Lading (BOL) or Proof of Delivery (POD) document.
 * 1. Compresses large mobile camera photos for fast cellular upload.
 * 2. Uploads to durable Firebase Cloud Storage (`signed_bols/{loadId}/{fileName}`) when signed in.
 * 3. Falls back to `/api/upload-bol` (Admin Cloud Storage or API-served storage).
 * 4. Falls back to resilient Data URL if under 750KB.
 */
export async function uploadSignedBolDocument(
  loadId: string,
  file: File | Blob,
  customName?: string,
): Promise<string> {
  const { blob: uploadPayload, ext: fileExt } = await optimizeBolFileForUpload(file);
  const safeBase = customName
    ? customName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    : `signed_bol_${Date.now()}`;
  const fileName = `${safeBase}.${fileExt}`;

  // 1. Durable Firebase Cloud Storage when authenticated
  if (storage && auth?.currentUser) {
    const storagePath = `signed_bols/${loadId}/${Date.now()}_${fileName}`;
    try {
      const storageRef = ref(storage, storagePath);
      const snapshot = await Promise.race([
        uploadBytes(storageRef, uploadPayload, {
          contentType: uploadPayload.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cloud Storage upload timed out')), 12000),
        ),
      ]);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      if (downloadUrl) return downloadUrl;
    } catch (cloudErr) {
      console.warn('Direct Firebase Storage upload bypassed, trying /api/upload-bol:', cloudErr);
    }
  }

  // 2. Server endpoint (/api/upload-bol) — supports unauthenticated magic-link portal & Admin SDK bucket
  try {
    const formData = new FormData();
    formData.append('file', uploadPayload, fileName);
    formData.append('loadId', loadId || 'bol');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const res = await fetch('/api/upload-bol', {
        method: 'POST',
        body: formData,
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) {
          return data.url;
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (localErr) {
    console.warn('Server /api/upload-bol endpoint failed, checking resilient fallback:', localErr);
  }

  // 3. Final try on Firebase Storage even if auth check was skipped
  if (storage && !auth?.currentUser) {
    try {
      const storageRef = ref(storage, `signed_bols/${loadId}/${Date.now()}_${fileName}`);
      const snapshot = await uploadBytes(storageRef, uploadPayload, {
        contentType: uploadPayload.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
      });
      return await getDownloadURL(snapshot.ref);
    } catch {
      // Fall through to Data URL if small enough
    }
  }

  // 4. Resilient Data URL fallback if under 750KB (keeps Firestore document well within 1MB limit)
  if (uploadPayload.size < 750 * 1024) {
    return await blobToDataUrl(uploadPayload);
  }

  throw new Error('Could not upload BOL document. Please check your connection and try again.');
}

/**
 * Uploads an outbound active Bill of Lading (BOL) document (broker paperwork or generated PDF).
 */
export async function uploadOutboundBolDocument(
  loadId: string,
  file: File | Blob,
  customName?: string,
): Promise<string> {
  const fileExt =
    file instanceof File
      ? (file.name.split('.').pop() || 'pdf')
      : file.type.includes('pdf')
        ? 'pdf'
        : file.type.includes('png')
          ? 'png'
          : 'jpg';

  const fileName = customName || `active_bol_${Date.now()}.${fileExt}`;

  if (storage && auth?.currentUser) {
    const storagePath = `outbound_bols/${loadId}/${Date.now()}_${fileName}`;
    try {
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
      });
      return await getDownloadURL(snapshot.ref);
    } catch (err) {
      console.warn('Direct Firebase Storage outbound BOL upload bypassed, trying /api/upload-bol:', err);
    }
  }

  try {
    const formData = new FormData();
    formData.append('file', file, fileName);
    formData.append('loadId', loadId || 'bol');

    const res = await fetch('/api/upload-bol', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.url) {
        return data.url;
      }
    }
  } catch (localErr) {
    console.warn('Local /api/upload-bol endpoint bypassed for outbound BOL:', localErr);
  }

  if (file.size < 750 * 1024) {
    return await blobToDataUrl(file);
  }

  throw new Error('Could not upload outbound BOL document.');
}

/**
 * Uploads an in-transit expense receipt image to Firebase Storage or server fallback.
 */
export async function uploadReceiptImage(
  loadId: string,
  file: File | Blob,
  customName?: string,
): Promise<string> {
  if (storage && auth?.currentUser) {
    const fileExt =
      file instanceof File
        ? (file.name.split('.').pop() || 'jpg')
        : file.type.includes('pdf')
          ? 'pdf'
          : 'jpg';
    const fileName = customName || `receipt_${Date.now()}.${fileExt}`;
    const storagePath = `receipts/${loadId}/${fileName}`;
    try {
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
      });
      return await getDownloadURL(snapshot.ref);
    } catch (err) {
      console.warn('Direct Firebase Storage receipt upload bypassed, trying /api/upload-receipt:', err);
    }
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', loadId || 'downtime');

    const res = await fetch('/api/upload-receipt', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.url) {
        return data.url;
      }
    }
  } catch (localErr) {
    console.warn('Local receipt upload endpoint bypassed, trying cloud storage:', localErr);
  }

  const fileExt =
    file instanceof File
      ? (file.name.split('.').pop() || 'jpg')
      : file.type.includes('pdf')
        ? 'pdf'
        : 'jpg';

  const fileName = customName || `receipt_${Date.now()}.${fileExt}`;
  const storagePath = `receipts/${loadId}/${fileName}`;

  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
  });
  return await getDownloadURL(snapshot.ref);
}
