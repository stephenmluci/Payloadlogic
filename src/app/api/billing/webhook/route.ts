import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature, stripeApi, planFromPriceId } from '@/lib/stripeServer';
import { setBilling, findUidByCustomer, applyEntitlement } from '@/lib/billingServer';

export const runtime = 'nodejs';

const ENTITLED = ['active', 'trialing', 'past_due'];

/** Syncs a Stripe subscription onto the account. Unknown prices never change entitlements. */
async function syncSubscription(sub: any, uidHint?: string | null) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const uid = uidHint || sub.metadata?.uid || (customerId ? await findUidByCustomer(customerId) : null);
  if (!uid) {
    console.warn('[billing/webhook] no account for subscription', sub.id);
    return;
  }
  const plan = planFromPriceId(sub.items?.data?.[0]?.price?.id);
  await setBilling(uid, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    ...(plan ? { tier: plan.tier, interval: plan.interval } : {}),
    ...(sub.current_period_end ? { currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString() } : {}),
  });
  if (plan && ENTITLED.includes(sub.status)) {
    await applyEntitlement(uid, plan.tier, plan.interval);
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ code: 'not_configured' }, { status: 501 });

  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const event = JSON.parse(raw);
    const obj = event.data?.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription' || !obj.subscription) break;
        const uid = obj.client_reference_id || obj.metadata?.uid;
        const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id;
        const sub = await stripeApi('GET', `/subscriptions/${subId}`);
        await syncSubscription(sub, uid);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(obj);
        break;
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[billing/webhook] handler failed:', err?.message);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 }); // Stripe will retry
  }
}
