import { NextRequest, NextResponse } from 'next/server';
import { isStripeConfigured, stripeApi, appOrigin } from '@/lib/stripeServer';
import { requireUid, getBilling } from '@/lib/billingServer';

export const runtime = 'nodejs';

/** Opens the Stripe Customer Portal (payment method, invoices, cancel, billing period) for the signed-in account. */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ code: 'not_configured' }, { status: 501 });

  try {
    const billing = await getBilling(uid);
    if (!billing?.stripeCustomerId) {
      return NextResponse.json({ code: 'no_subscription', error: 'No paid subscription yet — choose a plan to get started.' }, { status: 404 });
    }
    const portal = await stripeApi('POST', '/billing_portal/sessions', {
      customer: billing.stripeCustomerId,
      return_url: `${appOrigin(req.nextUrl.origin)}/?billing=updated`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err: any) {
    console.error('[billing/portal] failed:', err?.message);
    return NextResponse.json({ error: "We couldn't open the billing portal just now. Please try again." }, { status: 502 });
  }
}
