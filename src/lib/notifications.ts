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
import { sendDriverPushNotification } from '@/lib/pushNotification';
import type { AppNotification, DriverProfile, Load } from '@/types';

export interface SendDriverNotificationParams {
  driverId: string;
  title: string;
  message: string;
  loadId?: string;
  actionUrl?: string;
}

/**
 * Builds the direct link to the driver's view of a specific load.
 * Prefers the driver's restricted magic-link portal when available.
 */
export function buildDriverLoadViewUrl(
  driver: Partial<DriverProfile> | null | undefined,
  loadId: string,
  originBase?: string
): string {
  const base =
    originBase ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const encodedLoadId = encodeURIComponent(loadId);

  if (driver?.driverPortalUrl) {
    const sep = driver.driverPortalUrl.includes('?') ? '&' : '?';
    return `${driver.driverPortalUrl}${sep}loadId=${encodedLoadId}`;
  }

  if (driver?.driverAccessToken) {
    return `${base}/driver-portal/${encodeURIComponent(driver.driverAccessToken)}?loadId=${encodedLoadId}`;
  }

  return `${base}/dashboard?tab=driver-dashboard&loadId=${encodedLoadId}`;
}

/**
 * Formats a concise origin, destination, and pickup time summary for dispatch alerts.
 */
export function formatLoadPickupSummary(load: Partial<Load>): {
  originText: string;
  destText: string;
  pickupText: string;
} {
  const originText =
    [load.origin?.city, load.origin?.state].filter(Boolean).join(', ') ||
    load.origin?.street ||
    'Origin';
  const destText =
    [load.destination?.city, load.destination?.state].filter(Boolean).join(', ') ||
    load.destination?.street ||
    'Destination';

  const rawPickup = load.pickupDateTime || '';
  let pickupText = 'Scheduled';
  if (rawPickup) {
    const parsed = new Date(rawPickup);
    if (!Number.isNaN(parsed.getTime())) {
      pickupText = parsed.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } else {
      pickupText = rawPickup;
    }
  }

  return { originText, destText, pickupText };
}

/**
 * Builds a mobile-friendly `sms:` URI when a driver phone number has at least 10 digits.
 */
export function buildDispatchSmsUrl(
  phone: string | undefined | null,
  message: string
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `sms:${digits}?body=${encodeURIComponent(message)}`;
}

/**
 * Sends in-app + push dispatch notifications and returns an SMS URI if the driver has a phone number.
 */
export function dispatchDriverAssignmentAlert(params: {
  driverId: string;
  driver?: DriverProfile | null;
  loadId: string;
  loadData: Partial<Load>;
  isDispatched: boolean;
}): {
  smsUrl: string | null;
  summaryMsg: string;
  driverName: string;
  driverLoadUrl: string;
} {
  const { driverId, driver, loadId, loadData, isDispatched } = params;
  const driverLoadUrl = buildDriverLoadViewUrl(driver, loadId);
  const { originText, destText, pickupText } = formatLoadPickupSummary(loadData);
  const loadLabel = loadData.loadNumber || loadId.substring(0, 8);
  const summaryMsg = `Load #${loadLabel}: ${originText} → ${destText} (Pickup: ${pickupText}).`;
  const smsUrl = buildDispatchSmsUrl(
    driver?.phone,
    `${summaryMsg} View load: ${driverLoadUrl}`
  );

  sendDriverNotification({
    driverId,
    title: isDispatched ? 'Load Dispatched to You' : 'New Load Assigned',
    message: `${summaryMsg} Open Driver View to accept & track.`,
    loadId,
    actionUrl: driverLoadUrl,
  }).catch((err) => console.warn('Failed to send in-app driver notification:', err));

  if (driver) {
    sendDriverPushNotification({
      driver,
      originCity: loadData.origin?.city,
      originState: loadData.origin?.state,
      clickActionUrl: driverLoadUrl,
    }).catch((err) => console.warn('Failed to send push driver notification:', err));
  }

  return {
    smsUrl,
    summaryMsg,
    driverName: driver?.name || 'Driver',
    driverLoadUrl,
  };
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
  actionUrl,
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
    ...(actionUrl ? { actionUrl } : {}),
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
          actionUrl: data.actionUrl || undefined,
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
