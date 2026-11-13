import { NextRequest, NextResponse } from 'next/server';
import {
  getOnboardingInvite,
  updateOnboardingInvite,
  getDriverProfileForOnboarding,
  saveDriverProfileFromOnboarding,
} from '@/lib/onboardingStore';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'missing_token', message: 'No onboarding token provided.' },
        { status: 400 }
      );
    }

    const invite = await getOnboardingInvite(token);

    if (!invite) {
      return NextResponse.json(
        {
          valid: false,
          error: 'not_found',
          message: 'This onboarding link is invalid or does not exist.',
        },
        { status: 404 }
      );
    }

    // Check if already completed / single-use
    if (invite.status === 'completed') {
      return NextResponse.json({
        valid: false,
        error: 'used',
        message: 'This onboarding link has already been completed and is no longer active.',
        companyName: invite.companyName || 'PayloadLogic',
      });
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invite.expiresAt);
    if (expiresAt < now || invite.status === 'expired') {
      if (invite.status !== 'expired') {
        await updateOnboardingInvite(token, { status: 'expired' }).catch(() => {});
        if (invite.adminUid && invite.driverUid) {
          await saveDriverProfileFromOnboarding(invite.adminUid, invite.driverUid, {
            onboardingStatus: 'expired',
          }).catch(() => {});
        }
      }
      return NextResponse.json({
        valid: false,
        error: 'expired',
        message: 'This onboarding link has expired. Links are valid for 7 days. Please ask your dispatcher for a new invite link.',
        companyName: invite.companyName || 'PayloadLogic',
      });
    }

    // Fetch existing driver profile to pre-fill known fields
    let existingProfile: Record<string, any> = {};
    if (invite.adminUid && invite.driverUid) {
      const pDoc = await getDriverProfileForOnboarding(invite.adminUid, invite.driverUid);
      if (pDoc) {
        existingProfile = pDoc;
      }
    }

    return NextResponse.json({
      valid: true,
      data: {
        token,
        companyName: invite.companyName || 'PayloadLogic',
        driverName: existingProfile.name || invite.driverName || '',
        driverEmail: existingProfile.email || invite.driverEmail || '',
        driverPhone: existingProfile.phone || invite.driverPhone || '',
        cdlStatus: existingProfile.cdlStatus || 'Non-CDL',
        cdlNumber: existingProfile.cdlNumber || existingProfile.idNumber || '',
        licenseIssuingState: existingProfile.licenseIssuingState || '',
        cdlExpirationDate: existingProfile.cdlExpirationDate || '',
        medicalCardExpirationDate: existingProfile.medicalCardExpirationDate || '',
        endorsements: Array.isArray(existingProfile.endorsements) ? existingProfile.endorsements : [],
        additionalEndorsements: existingProfile.additionalEndorsements || '',
        licenseFrontUrl: existingProfile.licenseFrontUrl || '',
        licenseFrontName: existingProfile.licenseFrontName || '',
        licenseBackUrl: existingProfile.licenseBackUrl || '',
        licenseBackName: existingProfile.licenseBackName || '',
        medicalCardUrl: existingProfile.medicalCardUrl || '',
        medicalCardName: existingProfile.medicalCardName || '',
        emergencyContactName: existingProfile.emergencyContactName || '',
        emergencyContactPhone: existingProfile.emergencyContactPhone || '',
        emergencyContactRelationship: existingProfile.emergencyContactRelationship || '',
        homeAddress: existingProfile.homeAddress || '',
        homeCity: existingProfile.homeCity || '',
        homeState: existingProfile.homeState || '',
        homeZip: existingProfile.homeZip || '',
        driverNotes: existingProfile.driverNotes || '',
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('Error verifying driver onboarding token:', error);
    return NextResponse.json(
      { valid: false, error: 'server_error', message: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}
