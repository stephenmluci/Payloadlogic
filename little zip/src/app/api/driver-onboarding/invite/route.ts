import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendOnboardingInviteEmail } from '@/lib/onboardingEmail';
import { saveOnboardingInvite, saveDriverProfileFromOnboarding } from '@/lib/onboardingStore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      adminUid,
      driverUid,
      driverName,
      driverEmail,
      driverPhone,
      companyName,
    } = body;

    if (!adminUid) {
      return NextResponse.json(
        { error: 'Admin UID is required.' },
        { status: 400 }
      );
    }

    if (!driverName || !driverName.trim()) {
      return NextResponse.json(
        { error: "Driver's name is required to send an onboarding link." },
        { status: 400 }
      );
    }

    const cleanName = driverName.trim();
    const cleanEmail = driverEmail ? String(driverEmail).trim().toLowerCase() : '';
    const cleanPhone = driverPhone ? String(driverPhone).trim() : '';

    if (!cleanEmail && !cleanPhone) {
      return NextResponse.json(
        { error: 'Either driver email or driver phone number is required.' },
        { status: 400 }
      );
    }

    // Determine target driverUid (use provided or generate new)
    const targetDriverUid = driverUid || `driver-${Date.now()}`;

    // Generate secure 48-character hex token (24 random bytes)
    const token = crypto.randomBytes(24).toString('hex');

    // 7 days expiration
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createdAt = now.toISOString();

    // Determine public base URL
    const originHeader = req.headers.get('origin');
    const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const protoHeader = req.headers.get('x-forwarded-proto') || 'https';
    
    let baseUrl = originHeader;
    if (!baseUrl && hostHeader) {
      baseUrl = `${protoHeader}://${hostHeader}`;
    }
    if (!baseUrl) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://payloadlogic.app';
    }
    // Clean trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');

    const onboardingLink = `${baseUrl}/onboard/${token}`;
    const carrier = companyName?.trim() || 'PayloadLogic';

    // 1. Store invite record
    await saveOnboardingInvite(token, {
      token,
      adminUid,
      driverUid: targetDriverUid,
      driverName: cleanName,
      driverEmail: cleanEmail,
      driverPhone: cleanPhone,
      companyName: carrier,
      status: 'pending',
      createdAt,
      expiresAt,
    });

    // 2. Update the driver profile record
    const driverUpdates: Record<string, any> = {
      uid: targetDriverUid,
      name: cleanName,
      status: 'active',
      cdlStatus: 'Non-CDL',
      estimatedHosRemaining: 11.0,
      onboardingStatus: 'pending',
      onboardingToken: token,
      onboardingSentAt: createdAt,
      onboardingExpiresAt: expiresAt,
      onboardingLink,
      updatedAt: createdAt,
    };
    if (cleanEmail) driverUpdates.email = cleanEmail;
    if (cleanPhone) driverUpdates.phone = cleanPhone;

    await saveDriverProfileFromOnboarding(adminUid, targetDriverUid, driverUpdates);

    // 3. Dispatch email if email address is provided
    let emailResult: { success: boolean; previewUrl?: string; messageId?: string } = { success: false };
    if (cleanEmail) {
      emailResult = await sendOnboardingInviteEmail({
        recipientEmail: cleanEmail,
        driverName: cleanName,
        companyName: carrier,
        onboardingLink,
      });
    }

    return NextResponse.json({
      success: true,
      token,
      driverUid: targetDriverUid,
      inviteUrl: onboardingLink,
      expiresAt,
      emailSent: emailResult.success,
      previewUrl: emailResult.previewUrl,
      companyName: carrier,
    });
  } catch (error: any) {
    console.error('Error generating driver onboarding invite:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate driver onboarding link.' },
      { status: 500 }
    );
  }
}
