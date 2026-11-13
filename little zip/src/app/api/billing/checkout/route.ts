import { NextRequest, NextResponse } from 'next/server';
import { isStripeConfigured, getPriceId, stripeApi, appOrigin } from '@/lib/stripeServer';
import { requireUid, getBilling } from '@/lib/billingServer';
import { adminDb } from '@/lib/firebaseAdmin';
import { isBillingInterval, describePlanChoice } from '@/lib/pricing';

export const runtime = 'nodejs';

const LIVE_STATUSES = ['active', 'trialing', 'past_due'];
const MIN_TRIAL_END_MS = 2 * 24 * 60 * 60 * 1000 + 60_000; // Stripe requires trial_end ≥ 48h out

/**
 * Starts a plan change for the signed-in account.
 *  - New subscriber      → Stripe Checkout for the chosen plan + billing period.
 *  - Existing subscriber → Stripe Customer Portal "confirm subscription update" for the new price
 *                          (Stripe prorates; no second subscription is created, so nobody is double-billed).
 * Returns { url } to redirect to, or { code: 'not_configured' } while Stripe keys/prices aren't set up.
 */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* validated below */ }
  const { tier, interval } = body ?? {};
  if ((tier !== 'starter' && tier !== 'fleetPro') || !isBillingInterval(interval)) {
    return NextResponse.json({ error: 'Choose a plan and billing period.' }, { status: 400 });
  }

  const priceId = getPriceId(tier, interval);
  if (!isStripeConfigured() || !priceId) {
    return NextResponse.json({ code: 'not_configured' }, { status: 501 });
  }

  const origin = appOrigin(req.nextUrl.origin);
  try {
    const billing = await getBilling(uid);

    // ── Existing live subscription: switch it in place via the portal ──
    if (billing?.stripeCustomerId && billing.stripeSubscriptionId && LIVE_STATUSES.includes(billing.status ?? '')) {
      const sub = await stripeApi('GET', `/subscriptions/${billing.stripeSubscriptionId}`);
      const itemId = sub?.items?.data?.[0]?.id;
      if (!itemId) throw new Error('Subscription has no items.');
      const portal = await stripeApi('POST', '/billing_portal/sessions', {
        customer: billing.stripeCustomerId,
        return_url: `${origin}/?billing=updated`,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: billing.stripeSubscriptionId,
            items: [{ id: itemId, price: priceId, quantity: 1 }],
          },
        },
      });
      return NextResponse.json({ url: portal.url, mode: 'switch', summary: describePlanChoice(tier, interval) });
    }

    // ── New subscription: Checkout ──
    const subscriptionData: Record<string, any> = { metadata: { uid, tier, interval } };
    const trialSnap = await adminDb.doc(`trials/${uid}`).get();
    const trialEnd = trialSnap.exists && trialSnap.data()?.status === 'active' ? Date.parse(trialSnap.data()!.endsAt) : NaN;
    // Still in the free trial → first charge happens when the trial ends.
    if (!isNaN(trialEnd) && trialEnd - Date.now() > MIN_TRIAL_END_MS) {
      subscriptionData.trial_end = Math.floor(trialEnd / 1000);
    }

    const session = await stripeApi('POST', '/checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: uid,
      ...(billing?.stripeCustomerId ? { customer: billing.stripeCustomerId } : {}),
      metadata: { uid, tier, interval },
      subscription_data: subscriptionData,
      allow_promotion_codes: true,
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url, mode: 'checkout' });
  } catch (err: any) {
    console.error('[billing/checkout] failed:', err?.message);
    return NextResponse.json({ error: "We couldn't open checkout just now. Please try again." }, { status: 502 });
  }
}
