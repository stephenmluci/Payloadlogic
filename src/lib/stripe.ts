/**
 * Stripe plan catalogue (client-safe — no secrets here).
 * Amounts come from pricing.ts so there is only one place to change prices.
 * Server-side price-ID mapping and API calls live in stripeServer.ts.
 */
import { BILLING_INTERVALS, INTERVAL_CONFIG, getPlanPrice } from '@/lib/pricing';

export const STRIPE_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter · Single Rig',
    amount: getPlanPrice('starter', 'monthly').totalCents, // monthly base, cents
    interval: 'month' as const,
    truckLimit: 1,
    description: 'Solo owner-operator, 1 truck, all core features.',
  },
  fleetPro: {
    id: 'fleet-pro',
    name: 'Fleet Pro',
    amount: getPlanPrice('fleetPro', 'monthly').totalCents, // monthly base, cents
    interval: 'month' as const,
    truckLimit: 3,      // +$25/truck above 3
    addonAmount: 2500,
    description: 'Multi-truck dispatching, unlimited drivers, live ops center.',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    amount: null,
    interval: null,
    truckLimit: null,
    description: 'Custom fleet size, volume pricing, dedicated support.',
  },
} as const;

export type StripePlanId = keyof typeof STRIPE_PLANS;

/**
 * The six Stripe Prices PayloadLogic needs (2 plans × 3 billing periods), as shown in the
 * Stripe Dashboard. Create them once (or via `scripts`/Dashboard) and put their IDs in the env vars named here.
 * Monthly prices are the ones existing subscribers are already on — reuse them, don't recreate them.
 */
export function describeStripePriceCatalogue() {
  const rows: { envVar: string; unitAmountCents: number; recurring: { interval: 'month' | 'year'; interval_count: number } }[] = [];
  for (const tier of ['starter', 'fleetPro'] as const) {
    for (const interval of BILLING_INTERVALS) {
      rows.push({
        envVar: stripePriceEnvVar(tier, interval),
        unitAmountCents: getPlanPrice(tier, interval).totalCents,
        recurring: INTERVAL_CONFIG[interval].stripe,
      });
    }
  }
  return rows;
}

export function stripePriceEnvVar(tier: 'starter' | 'fleetPro', interval: 'monthly' | 'sixMonth' | 'annual'): string {
  const t = tier === 'fleetPro' ? 'FLEET_PRO' : 'STARTER';
  const i = interval === 'sixMonth' ? 'SIX_MONTH' : interval === 'annual' ? 'ANNUAL' : 'MONTHLY';
  return `STRIPE_PRICE_${t}_${i}`;
}
