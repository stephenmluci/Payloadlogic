import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppNotification } from '@/types';

export interface SendDriverNotificationParams {
  driverId: string;
  title: string;
  message: string;
  loadId?: string;
}

/**
 * 100% Free in-app notification creator using Firestore.
 * Adds a document into the `notifications` collection.
 */
export async function sendDriverNotification({
  driverId,
  title,
  message,
  loadId,
}: SendDriverNotificationParams): Promise<string> {
  if (!driverId || driverId === 'none') {
    throw new Error('Valid driverId is required to send notification.');
  }

  const notifData = {
    driverId,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
    ...(loadId ? { loadId } : {}),
  };

  const colRef = collection(db, 'notifications');
  const docRef = await addDoc(colRef, notifData);
  return docRef.id;
}

/**
 * Marks a notification as read in Firestore.
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  if (!notificationId) return;
  const docRef = doc(db, 'notifications', notificationId);
  await updateDoc(docRef, {
    isRead: true,
  });
}

/**
 * Real-time listener for a driver's notifications using onSnapshot.
 * Listens to `notifications` where driverId == targetDriverId.
 */
export function subscribeToDriverNotifications(
  driverId: string,
  onUpdate: (notifications: AppNotification[]) => void,
  onError?: (error: any) => void
): () => void {
  if (!driverId) {
    onUpdate([]);
    return () => {};
  }

  const colRef = collection(db, 'notifications');
  const q = query(
    colRef,
    where('driverId', '==', driverId),
    limit(50)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: AppNotification[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          driverId: data.driverId || driverId,
          title: data.title || '',
          message: data.message || '',
          isRead: Boolean(data.isRead),
          createdAt: data.createdAt || new Date().toISOString(),
          loadId: data.loadId || undefined,
        };
      });

      // Sort client-side by date descending
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(items);
    },
    (err) => {
      console.warn('Notifications snapshot error:', err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}
