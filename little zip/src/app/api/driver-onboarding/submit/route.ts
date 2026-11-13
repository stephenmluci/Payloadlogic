import { NextRequest, NextResponse } from 'next/server';
import {
  getOnboardingInvite,
  updateOnboardingInvite,
} from '@/lib/onboardingStore';
import { provisionDriverViewAccount } from '@/lib/driverAccountProvisioner';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, driverData } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Onboarding token is required.' },
        { status: 400 }
      );
    }

    if (!driverData || !driverData.name || !driverData.name.trim()) {
      return NextResponse.json(
        { error: 'Full name is required.' },
        { status: 400 }
      );
    }

    if (!driverData.licenseIssuingState || !driverData.licenseIssuingState.trim()) {
      return NextResponse.json(
        { error: 'License Issuing State is required.' },
        { status: 400 }
      );
    }

    const invite = await getOnboardingInvite(token);
    if (!invite) {
      return NextResponse.json(
        { error: 'This onboarding link is invalid or no longer exists.' },
        { status: 404 }
      );
    }

    if (invite.status === 'completed') {
      return NextResponse.json(
        { error: 'This onboarding link has already been used and is no longer active.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const expiresAt = new Date(invite.expiresAt);
    if (expiresAt < now || invite.status === 'expired') {
      await updateOnboardingInvite(token, { status: 'expired' }).catch(() => {});
      return NextResponse.json(
        { error: 'This onboarding link has expired. Please contact your company administrator for a new invite.' },
        { status: 400 }
      );
    }

    const completedAt = now.toISOString();

    // Prepare driver profile updates
    const updates: Record<string, any> = {
      name: driverData.name.trim(),
      email: (driverData.email || invite.driverEmail || '').trim().toLowerCase(),
      phone: (driverData.phone || invite.driverPhone || '').trim(),
      cdlStatus: driverData.cdlStatus === 'Class A CDL' ? 'Class A CDL' : 'Non-CDL',
      cdlNumber: (driverData.cdlNumber || '').trim(),
      idNumber: (driverData.cdlNumber || '').trim(),
      licenseIssuingState: (driverData.licenseIssuingState || '').trim().toUpperCase(),
      cdlExpirationDate: driverData.cdlExpirationDate || '',
      medicalCardExpirationDate: driverData.medicalCardExpirationDate || '',
      endorsements: Array.isArray(driverData.endorsements)
        ? driverData.endorsements.filter((e: any) => typeof e === 'string' && e.trim().length > 0)
        : [],
      additionalEndorsements: (driverData.additionalEndorsements || '').trim(),
      licenseFrontUrl: driverData.licenseFrontUrl || '',
      licenseFrontName: (driverData.licenseFrontName || '').trim(),
      licenseBackUrl: driverData.licenseBackUrl || '',
      licenseBackName: (driverData.licenseBackName || '').trim(),
      medicalCardUrl: driverData.medicalCardUrl || '',
      medicalCardName: (driverData.medicalCardName || '').trim(),
      emergencyContactName: (driverData.emergencyContactName || '').trim(),
      emergencyContactPhone: (driverData.emergencyContactPhone || '').trim(),
      emergencyContactRelationship: (driverData.emergencyContactRelationship || '').trim(),
      homeAddress: (driverData.homeAddress || '').trim(),
      homeCity: (driverData.homeCity || '').trim(),
      homeState: (driverData.homeState || '').trim(),
      homeZip: (driverData.homeZip || '').trim(),
      driverNotes: (driverData.driverNotes || '').trim(),
      onboardingStatus: 'completed',
      onboardingCompletedAt: completedAt,
      updatedAt: completedAt,
    };

    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    // Automatically provision the limited Driver View account & send credentials / magic link
    const provisioned = await provisionDriverViewAccount({
      adminUid: invite.adminUid,
      driverUid: invite.driverUid,
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      companyName: invite.companyName || 'PayloadLogic Fleet',
      baseUrl,
      profileData: updates,
    });

    // Mark invite token as completed (single-use)
    await updateOnboardingInvite(token, {
      status: 'completed',
      usedAt: completedAt,
      submittedDataSummary: {
        name: updates.name,
        email: updates.email,
        phone: updates.phone,
        cdlStatus: updates.cdlStatus,
        driverPortalUrl: provisioned.driverPortalUrl,
        loginEmail: provisioned.loginEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Your driver profile and limited Driver View account have been created.',
      companyName: invite.companyName || 'PayloadLogic',
      driverAccount: {
        driverUid: provisioned.driverUid,
        loginEmail: provisioned.loginEmail,
        tempPassword: provisioned.tempPassword,
        driverPortalUrl: provisioned.driverPortalUrl,
        loginUrl: provisioned.loginUrl,
        emailSent: provisioned.emailSent,
        smsShareUrl: provisioned.smsShareUrl,
      },
    });
  } catch (error: any) {
    console.error('Error submitting driver onboarding data:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to submit driver profile.' },
      { status: 500 }
    );
  }
}
