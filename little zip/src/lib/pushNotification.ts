import type { DriverProfile } from '@/types';

interface SendDriverPushParams {
  driver?: DriverProfile | null;
  originCity?: string;
  originState?: string;
  clickActionUrl?: string;
}

/**
 * Triggers a push notification to the assigned driver via Web Push Service Worker or FCM.
 */
export async function sendDriverPushNotification({
  driver,
  originCity,
  originState,
  clickActionUrl,
}: SendDriverPushParams): Promise<boolean> {
  const originText = [originCity, originState].filter(Boolean).join(', ') || 'Assigned Location';
  const defaultUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/dashboard?tab=driver-dashboard`
    : '/dashboard?tab=driver-dashboard';
  const targetUrl = clickActionUrl || defaultUrl;

  let sent = false;

  // 1. Try standard Web Push Service Worker (100% Free, native browser/lock-screen banner)
  if (driver?.webPushSubscription) {
    try {
      const wpRes = await fetch('/api/send-web-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: driver.webPushSubscription,
          title: 'New Load Assigned',
          message: `Pickup: ${originText}. Click to view route.`,
          url: targetUrl,
        }),
      });
      if (wpRes.ok) {
        sent = true;
      }
    } catch (wpErr) {
      console.warn('Web push delivery attempt failed:', wpErr);
    }
  }

  // 2. Fall back to / alongside FCM if available
  if (driver?.fcmToken) {
    try {
      const res = await fetch('/api/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fcmToken: driver.fcmToken,
          title: 'New Load Assigned',
          body: `Pickup: ${originText}. Click to view route.`,
          click_action: targetUrl,
        }),
      });

      if (res.ok) {
        sent = true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.warn('Failed to send FCM push notification:', errorData);
      }
    } catch (error) {
      console.error('Error invoking /api/send-push:', error);
    }
  }

  return sent;
}

