/**
 * PayloadLogic Pricing — single source of truth
 * ──────────────────────────────────────────────────────────────────────────────
 * Every price shown in the app (Billing & Plan, onboarding, public pricing page)
 * and every Stripe price mapping derives from the two tables below.
 * To change pricing, edit BASE_MONTHLY_USD or INTERVAL_CONFIG only.
 *
 * Plan LIMITS/FEATURES live in planLimits.ts and do NOT vary by billing interval.
 *
 * Final amounts (all land on exact cents, no rounding needed):
 *   Starter    Monthly $49.00/mo | 6-Month $264.60 ($44.10/mo) | Annual $470.40 ($39.20/mo)
 *   Fleet Pro  Monthly $99.00/mo | 6-Month $534.60 ($89.10/mo) | Annual $950.40 ($79.20/mo)
 */
import type { SubscriptionTier } from '@/lib/planLimits';

export type BillingInterval = 'monthly' | 'sixMonth' | 'annual';

export const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'sixMonth', 'annual'];
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'monthly';

export const BASE_MONTHLY_USD: Record<SubscriptionTier, number> = {
  starter: 49,
  fleetPro: 99,
};

/** Fleet Pro per-extra-truck add-on, monthly. Prepaid add-ons get the same discount as the base plan. */
export const EXTRA_TRUCK_MONTHLY_USD = 25;

export const INTERVAL_CONFIG: Record<BillingInterval, {
  /** Months covered by one payment. */
  months: number;
  /** Fractional discount vs. paying monthly (0.2 = 20%). */
  discount: number;
  label: string;
  /** Short phrase shown under the price. */
  billedLabel: string;
  /** Stripe recurring config (Stripe supports interval_count, so 6-month is a true 6-month cycle). */
  stripe: { interval: 'month' | 'year'; interval_count: number };
}> = {
  monthly:  { months: 1,  discount: 0,    label: 'Monthly',  billedLabel: 'Billed monthly',       stripe: { interval: 'month', interval_count: 1 } },
  sixMonth: { months: 6,  discount: 0.10, label: '6-Month',  billedLabel: 'Billed every 6 months', stripe: { interval: 'month', interval_count: 6 } },
  annual:   { months: 12, discount: 0.20, label: 'Annual',   billedLabel: 'Billed annually',       stripe: { interval: 'year',  interval_count: 1 } },
};

export interface PlanPrice {
  tier: SubscriptionTier;
  interval: BillingInterval;
  months: number;
  /** Amount charged per billing period, in cents (this is the Stripe unit_amount). */
  totalCents: number;
  /** Effective per-month price, in cents (may be fractional only if config changes). */
  effectiveMonthlyCents: number;
  /** What the same months would cost on the monthly plan, in cents. */
  monthlyEquivalentTotalCents: number;
  savingsCents: number;
  savingsPercent: number;
  /** Months of the monthly price saved (e.g. 2.4 for annual at 20%). */
  freeMonths: number;
  billedLabel: string;
}

function priceFromMonthly(monthlyUsd: number, interval: BillingInterval) {
  const cfg = INTERVAL_CONFIG[interval];
  const monthlyEquivalentTotalCents = Math.round(monthlyUsd * 100 * cfg.months);
  const totalCents = Math.round(monthlyEquivalentTotalCents * (1 - cfg.discount));
  return { cfg, monthlyEquivalentTotalCents, totalCents };
}

export function getPlanPrice(tier: SubscriptionTier, interval: BillingInterval = 'monthly'): PlanPrice {
  const { cfg, monthlyEquivalentTotalCents, totalCents } = priceFromMonthly(BASE_MONTHLY_USD[tier], interval);
  return {
    tier,
    interval,
    months: cfg.months,
    totalCents,
    effectiveMonthlyCents: totalCents / cfg.months,
    monthlyEquivalentTotalCents,
    savingsCents: monthlyEquivalentTotalCents - totalCents,
    savingsPercent: Math.round(cfg.discount * 100),
    freeMonths: Math.round(cfg.discount * cfg.months * 10) / 10,
    billedLabel: cfg.billedLabel,
  };
}

export function getExtraTruckPrice(interval: BillingInterval = 'monthly') {
  const { cfg, totalCents } = priceFromMonthly(EXTRA_TRUCK_MONTHLY_USD, interval);
  return { totalCents, effectiveMonthlyCents: totalCents / cfg.months, months: cfg.months };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** $49, $44.10, $1,188 — drops ".00" for whole dollars. */
export function formatUsd(cents: number): string {
  const whole = Math.abs(cents % 100) < 0.005;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Annual → "Save 2 months" style copy; 6-month → "Save 10%". */
export function savingsBadgeText(interval: BillingInterval): string | null {
  const cfg = INTERVAL_CONFIG[interval];
  if (cfg.discount === 0) return null;
  const percent = Math.round(cfg.discount * 100);
  const freeMonths = Math.floor(cfg.discount * cfg.months);
  return interval === 'annual' && freeMonths >= 2 ? `Save ${percent}% · ${freeMonths}+ months free` : `Save ${percent}%`;
}

export function intervalLabel(interval: BillingInterval): string {
  return INTERVAL_CONFIG[interval].label;
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'sixMonth' || value === 'annual';
}

/** "Fleet Pro · Annual · $950.40/yr" */
export function describePlanChoice(tier: SubscriptionTier, interval: BillingInterval): string {
  const p = getPlanPrice(tier, interval);
  const name = tier === 'fleetPro' ? 'Fleet Pro' : 'Starter';
  const per = interval === 'monthly' ? '/mo' : interval === 'sixMonth' ? ' / 6 months' : '/yr';
  return `${name} · ${intervalLabel(interval)} · ${formatUsd(p.totalCents)}${per}`;
}
