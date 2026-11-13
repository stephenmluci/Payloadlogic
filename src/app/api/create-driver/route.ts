import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { isOwnerEmail, PRIVATE_TESTING_RESTRICTION_MESSAGE } from '@/lib/authConfig';
import { provisionDriverViewAccount } from '@/lib/driverAccountProvisioner';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email,
      phone,
      password,
      name,
      adminUid,
      driverUid,
      companyName,
      driverProfileData,
    } = body;

    if (!name || !adminUid) {
      return NextResponse.json(
        { error: 'Driver Name and Admin UID are required.' },
        { status: 400 }
      );
    }

    // Verify owner authorization if token provided
    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (authHeader) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader);
        if (!isOwnerEmail(decoded.email)) {
          return NextResponse.json(
            { error: PRIVATE_TESTING_RESTRICTION_MESSAGE },
            { status: 403 }
          );
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (
          !msg.includes('default credentials') &&
          !msg.includes('SERVICE_ACCOUNT') &&
          !msg.includes('Could not load')
        ) {
          return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
        }
      }
    }

    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    const effectiveEmail = (email || driverProfileData?.email || '').trim();
    const effectivePhone = (phone || driverProfileData?.phone || '').trim();

    const provisioned = await provisionDriverViewAccount({
      adminUid,
      driverUid,
      name: String(name).trim(),
      email: effectiveEmail,
      phone: effectivePhone,
      explicitPassword: password,
      companyName: companyName || 'PayloadLogic Fleet',
      baseUrl,
      profileData: {
        ...(driverProfileData || {}),
        status: driverProfileData?.status || 'active',
        cdlStatus: driverProfileData?.cdlStatus || 'Non-CDL',
        estimatedHosRemaining: driverProfileData?.estimatedHosRemaining ?? 11.0,
      },
    });

    return NextResponse.json({
      success: true,
      uid: provisioned.driverUid,
      authUid: provisioned.authUid,
      email: provisioned.loginEmail,
      loginEmail: provisioned.loginEmail,
      tempPassword: provisioned.tempPassword,
      driverAccessToken: provisioned.driverAccessToken,
      driverPortalUrl: provisioned.driverPortalUrl,
      loginUrl: provisioned.loginUrl,
      passwordResetLink: provisioned.passwordResetLink,
      emailSent: provisioned.emailSent,
      emailSimulated: provisioned.emailSimulated,
      smsShareUrl: provisioned.smsShareUrl,
      smsBody: provisioned.smsBody,
      profile: provisioned.profile,
      message: `Limited Driver View account created for ${name}.`,
    });
  } catch (error: any) {
    console.error('Error in /api/create-driver:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create driver account.' },
      { status: 500 }
    );
  }
}
