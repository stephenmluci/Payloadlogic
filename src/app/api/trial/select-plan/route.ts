import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { selectPlanForUser } from '@/lib/trialServer';
import { isBillingInterval } from '@/lib/pricing';

export const runtime = 'nodejs';

/**
 * Records the plan an account committed to (Starter / Fleet Pro) on its trial record.
 * The plan applies when the trial ends (immediately if it already ended).
 *
 * NOTE: Stripe checkout is not wired yet (see src/lib/stripe.ts). When it is, this
 * must be invoked from the Stripe webhook / after a successful checkout session
 * instead of directly from the Billing buttons.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* validated below */ }
  const tier = body?.tier;
  if (tier !== 'starter' && tier !== 'fleetPro') {
    return NextResponse.json({ error: 'Choose Starter or Fleet Pro.' }, { status: 400 });
  }

  try {
    const interval = isBillingInterval(body?.interval) ? body.interval : 'monthly';
    const trial = await selectPlanForUser(uid, tier, interval);
    return NextResponse.json({ trial });
  } catch (err: any) {
    console.error('[trial/select-plan] failed:', err?.message);
    return NextResponse.json({ error: "We couldn't save your plan. Please try again." }, { status: 503 });
  }
}
