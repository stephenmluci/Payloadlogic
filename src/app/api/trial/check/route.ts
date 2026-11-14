import { NextRequest, NextResponse } from 'next/server';
import { validateDotFormat, TRIAL_MESSAGES, type DotVerificationStatus } from '@/lib/trial';
import { lookupDot } from '@/lib/fmcsa';
import { isDotTrialUsed } from '@/lib/trialServer';

export const runtime = 'nodejs';

/**
 * Pre-signup check (no auth required).
 * Returns authoritative, plain-language feedback for the DOT field:
 *   - 'valid_verified'   → Real active carrier verified in FMCSA / SAFER with name & state
 *   - 'valid_unverified' → Format valid, but external lookup failed/timed out (signup allowed)
 *   - 'invalid'          → Format invalid or lookup confirms NOT FOUND or INACTIVE in FMCSA
 *   - 'blocked_trial_used' → DOT format valid, but this DOT already consumed its trial
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }

  // 1. Format validation
  const format = validateDotFormat(body?.usdotNumber);
  if (!format.ok) {
    return NextResponse.json(
      {
        status: 'invalid' as DotVerificationStatus,
        error: format.error,
      },
      { status: 200 }
    );
  }

  // 2. Real carrier lookup (FMCSA API + live SAFER Company Snapshot)
  const lookup = await lookupDot(format.dot);
  if (lookup.status === 'invalid') {
    return NextResponse.json(
      {
        status: 'invalid' as DotVerificationStatus,
        dot: format.dot,
        error: lookup.error || TRIAL_MESSAGES.dotNotFound,
      },
      { status: 200 }
    );
  }

  if (lookup.status !== 'valid_verified') {
    return NextResponse.json(
      {
        status: 'invalid' as DotVerificationStatus,
        dot: format.dot,
        error: TRIAL_MESSAGES.dotUnverified,
      },
      { status: 200 }
    );
  }

  // 3. One-trial-per-DOT Anti-Abuse Registry check
  let trialAvailable: boolean | null = null;
  try {
    trialAvailable = !(await isDotTrialUsed(format.dot));
  } catch (err) {
    console.warn('[trial/check] registry lookup error:', (err as Error)?.message);
  }

  if (trialAvailable === false) {
    return NextResponse.json(
      {
        status: 'blocked_trial_used' as DotVerificationStatus,
        dot: format.dot,
        trialAvailable: false,
        carrier: lookup.carrier,
        carrierLegalName: lookup.carrier.legalName,
        error: TRIAL_MESSAGES.dotAlreadyUsed,
        nextStep: TRIAL_MESSAGES.dotAlreadyUsedNextStep,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    status: lookup.status as DotVerificationStatus,
    dot: format.dot,
    carrier: lookup.carrier,
    carrierLegalName: lookup.carrier.legalName,
    trialAvailable,
  });
}
