/**
 * Stripe server helpers (server-only). Uses Stripe's REST API directly via fetch, so no SDK dependency.
 * Everything is dormant until STRIPE_SECRET_KEY is set; callers get `not_configured` and the app
 * falls back to its existing plan-selection behaviour.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_PRICE_{STARTER|FLEET_PRO}_{MONTHLY|SIX_MONTH|ANNUAL}   (6 price IDs)
 *   NEXT_PUBLIC_APP_URL   (optional, used for return URLs)
 */
import crypto from 'crypto';
import { stripePriceEnvVar } from '@/lib/stripe';
import { BILLING_INTERVALS, type BillingInterval } from '@/lib/pricing';
import type { SubscriptionTier } from '@/lib/planLimits';

export const isStripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

export function getPriceId(tier: SubscriptionTier, interval: BillingInterval): string | null {
  return process.env[stripePriceEnvVar(tier, interval)] || null;
}

/** Reverse lookup. Unknown (e.g. legacy/custom) prices return null so entitlements are never changed by guesswork. */
export function planFromPriceId(priceId: string | null | undefined): { tier: SubscriptionTier; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const tier of ['starter', 'fleetPro'] as const) {
    for (const interval of BILLING_INTERVALS) {
      if (getPriceId(tier, interval) === priceId) return { tier, interval };
    }
  }
  return null;
}

function encodeForm(params: Record<string, any>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...encodeForm(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripeApi<T = any>(method: 'GET' | 'POST', path: string, params: Record<string, any> = {}): Promise<T> {
  const body = encodeForm(params).join('&');
  const url = `https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(json?.error?.message || `Stripe error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json as T;
}

/** Verifies the `Stripe-Signature` header (HMAC-SHA256, 5-minute tolerance). */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export function appOrigin(reqOrigin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || reqOrigin).replace(/\/$/, '');
}
