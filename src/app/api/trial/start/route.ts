import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { validateDotFormat, TRIAL_MESSAGES } from '@/lib/trial';
import { lookupDot } from '@/lib/fmcsa';
import { startTrialForUser } from '@/lib/trialServer';
import { isOwnerEmail, PRIVATE_TESTING_RESTRICTION_MESSAGE } from '@/lib/authConfig';

export const runtime = 'nodejs';

/**
 * Activates the 14-day trial for the signed-in account (idempotent).
 * Auth: `Authorization: Bearer <Firebase ID token>`; the uid comes from the token, never the body.
 * Body: { usdotNumber, mcNumber? }
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let uid: string;
  let decodedEmail: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    decodedEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  // Private Testing Mode: Only the owner is permitted
  if (!isOwnerEmail(decodedEmail)) {
    return NextResponse.json(
      { error: PRIVATE_TESTING_RESTRICTION_MESSAGE, code: 'private_testing_restricted' },
      { status: 403 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* validated below */
  }

  const format = validateDotFormat(body?.usdotNumber);
  if (!format.ok) return NextResponse.json({ error: format.error, code: 'invalid_dot' }, { status: 400 });

  const lookup = await lookupDot(format.dot);
  if (lookup.status === 'invalid') {
    return NextResponse.json(
      { error: lookup.error || TRIAL_MESSAGES.dotNotFound, code: 'dot_invalid' },
      { status: 400 }
    );
  }

  try {
    const isVerified = lookup.status === 'valid_verified';
    const { outcome, record } = await startTrialForUser({
      uid,
      dot: format.dot,
      mcNumber: typeof body?.mcNumber === 'string' ? body.mcNumber.trim().slice(0, 20) || undefined : undefined,
      dotVerification: isVerified ? 'verified' : 'unverified',
      verificationStatus: lookup.status,
      carrierSnapshot: isVerified ? lookup.carrier : undefined,
      carrierLegalName: isVerified ? lookup.carrier.legalName : undefined,
    });

    return NextResponse.json({
      outcome,
      trial: record,
      ...(outcome === 'dot_already_used'
        ? { error: TRIAL_MESSAGES.dotAlreadyUsed, nextStep: TRIAL_MESSAGES.dotAlreadyUsedNextStep }
        : {}),
    });
  } catch (err: any) {
    console.error('[trial/start] failed:', err?.message);
    return NextResponse.json(
      { error: "We couldn't activate your trial just now. We'll retry automatically.", code: 'trial_service_unavailable' },
      { status: 503 }
    );
  }
}
