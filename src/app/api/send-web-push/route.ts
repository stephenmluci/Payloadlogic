import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:support@payloadlogic.app';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function POST(req: NextRequest) {
  try {
    const { subscription, title, message, url, loadId } = await req.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing push subscription' }, { status: 400 });
    }

    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'VAPID keys not configured on server' }, { status: 500 });
    }

    const payload = JSON.stringify({
      title: title || 'New Load Assigned',
      body: message || 'You have received a new dispatch assignment.',
      url: url || '/?tab=driver-dashboard',
      loadId: loadId || null,
    });

    await webpush.sendNotification(subscription, payload);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in /api/send-web-push:', error);
    // If subscription is 410 (Gone) or 404 (Not Found), client has unsubscribed/expired
    return NextResponse.json(
      { error: error?.message || 'Failed to send web push notification', statusCode: error?.statusCode },
      { status: error?.statusCode || 500 }
    );
  }
}
