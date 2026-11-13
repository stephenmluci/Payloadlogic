/** Browser-side helpers for the Stripe billing routes. */
import type { BillingInterval } from '@/lib/pricing';

export interface BillingRedirectResult {
  ok: boolean;
  url?: string;
  /** 'not_configured' → Stripe isn't set up in this environment; caller falls back to the in-app plan switch. */
  code?: 'not_configured' | 'no_subscription';
  error?: string;
}

async function post(path: string, idToken: string, body: unknown): Promise<BillingRedirectResult> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.url) return { ok: true, url: json.url };
    return { ok: false, code: json.code, error: json.error };
  } catch {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

export const startCheckout = (idToken: string, tier: 'starter' | 'fleetPro', interval: BillingInterval) =>
  post('/api/billing/checkout', idToken, { tier, interval });

export const openBillingPortal = (idToken: string) => post('/api/billing/portal', idToken, {});
