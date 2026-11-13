import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';

// Initialize firebase-admin singleton
let adminApp: App;
const existingApps = getApps();

if (existingApps.length > 0) {
  adminApp = existingApps[0];
} else {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', e);
      adminApp = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  } else {
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fcmToken, title, body, click_action } = await req.json();

    if (!fcmToken) {
      return NextResponse.json(
        { error: 'Missing fcmToken in request body' },
        { status: 400 }
      );
    }

    const payload: Message = {
      token: fcmToken,
      notification: {
        title: title || 'New Load Assigned',
        body: body || 'You have been assigned a new load.',
      },
      webpush: {
        fcmOptions: {
          link: click_action || '/',
        },
        notification: {
          icon: '/favicon.ico',
          clickAction: click_action || '/',
        },
      },
      data: {
        title: title || 'New Load Assigned',
        body: body || 'You have been assigned a new load.',
        click_action: click_action || '/',
      },
    };

    const messaging = getMessaging(adminApp);
    const response = await messaging.send(payload);
    return NextResponse.json({ success: true, messageId: response });
  } catch (error: any) {
    console.error('Error sending push notification via FCM:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send push notification' },
      { status: 500 }
    );
  }
}
