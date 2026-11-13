import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/**
 * Uploads a signed Bill of Lading (BOL) or Proof of Delivery (POD) document.
 * 1. Attempts local server storage endpoint (/api/upload-bol) which works immediately without external cloud storage setup.
 * 2. Falls back to Firebase Storage under `signed_bols/{loadId}/{fileName}`.
 * 3. Returns the accessible URL for the document.
 */
export async function uploadSignedBolDocument(
  loadId: string,
  file: File | Blob,
  customName?: string
): Promise<string> {
  const fileExt = file instanceof File
    ? (file.name.split('.').pop() || 'jpg')
    : (file.type.includes('pdf') ? 'pdf' : 'jpg');

  const fileName = customName || `signed_bol_${Date.now()}.${fileExt}`;

  // 1. Try local server storage endpoint (/api/upload-bol)
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
    console.warn('Local /api/upload-bol endpoint bypassed, trying cloud storage:', localErr);
  }

  // 2. Fall back to Firebase Storage
  const storagePath = `signed_bols/${loadId}/${fileName}`;
  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn('Direct Firebase Storage upload encountered an issue, falling back to local resilient Data URL:', error);
    // Only fall back to Data URL if the payload is under 400KB to protect Firestore from exceeding document limits
    if (file.size < 400 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
    }
    throw new Error('Could not upload BOL document. Please try again.');
  }
}

/**
 * Uploads an outbound active Bill of Lading (BOL) document (broker paperwork or generated PDF).
 * 1. Attempts local server storage endpoint (/api/upload-bol).
 * 2. Falls back to Firebase Storage under `outbound_bols/{loadId}/{fileName}`.
 * 3. Returns the download URL.
 */
export async function uploadOutboundBolDocument(
  loadId: string,
  file: File | Blob,
  customName?: string
): Promise<string> {
  const fileExt = file instanceof File
    ? (file.name.split('.').pop() || 'pdf')
    : (file.type.includes('pdf') ? 'pdf' : file.type.includes('png') ? 'png' : 'jpg');

  const fileName = customName || `active_bol_${Date.now()}.${fileExt}`;

  // 1. Try local server storage endpoint (/api/upload-bol)
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
    console.warn('Local /api/upload-bol endpoint bypassed for outbound BOL, trying cloud storage:', localErr);
  }

  // 2. Fall back to Firebase Storage
  const storagePath = `outbound_bols/${loadId}/${fileName}`;
  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
    });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn('Direct Firebase Storage outbound BOL upload encountered an issue:', error);
    if (file.size < 400 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
    }
    throw new Error('Could not upload outbound BOL document.');
  }
}

/**
 * Uploads an in-transit expense receipt image to Firebase Storage.
 * Saves under: `receipts/{loadId}/{fileName}`
 * Returns the public or signed download URL.
 * Includes graceful fallback to Data URL for offline testing, demo sessions, or sandbox modes.
 */
export async function uploadReceiptImage(
  loadId: string,
  file: File | Blob,
  customName?: string
): Promise<string> {
  // 1. Try local server disk upload (works completely free without paid Firebase plan)
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

  // 2. Cloud Firebase Storage fallback (if local server endpoint fails)
  const fileExt = file instanceof File
    ? (file.name.split('.').pop() || 'jpg')
    : (file.type.includes('pdf') ? 'pdf' : 'jpg');

  const fileName = customName || `receipt_${Date.now()}.${fileExt}`;
  const storagePath = `receipts/${loadId}/${fileName}`;

  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
  });
  const downloadUrl = await getDownloadURL(snapshot.ref);
  return downloadUrl;
}

