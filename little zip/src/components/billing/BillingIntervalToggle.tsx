'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  BILLING_INTERVALS,
  INTERVAL_CONFIG,
  getPlanPrice,
  formatUsd,
  savingsBadgeText,
  type BillingInterval,
} from '@/lib/pricing';
import type { SubscriptionTier } from '@/lib/planLimits';

/** Monthly / 6-Month / Annual segmented control. Savings badges are always visible so they're easy to scan. */
export function BillingIntervalToggle({
  value,
  onChange,
  className,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className={cn('inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1', className)}
    >
      {BILLING_INTERVALS.map((interval) => {
        const active = value === interval;
        const badge = savingsBadgeText(interval);
        return (
          <button
            key={interval}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(interval)}
            className={cn(
              'px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex flex-col items-center leading-tight min-w-[84px]',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            <span>{INTERVAL_CONFIG[interval].label}</span>
            {badge ? (
              <span className={cn('text-[10px] font-bold', active ? 'text-emerald-600' : 'text-emerald-600/80')}>
                {badge.split(' · ')[0]}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">Flexible</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Price block for one plan + billing period: effective monthly, total billed, and the savings callout. */
export function PlanPriceBlock({ tier, interval }: { tier: SubscriptionTier; interval: BillingInterval }) {
  const p = getPlanPrice(tier, interval);
  const monthly = getPlanPrice(tier, 'monthly');
  const prepaid = interval !== 'monthly';

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        {prepaid && (
          <span className="text-sm text-slate-400 line-through font-medium">{formatUsd(monthly.totalCents)}</span>
        )}
        <span className="text-3xl font-extrabold text-slate-900 tabular-nums">{formatUsd(p.effectiveMonthlyCents)}</span>
        <span className="text-xs text-slate-500 font-medium">/mo{prepaid ? ' effective' : ''}</span>
      </div>
      <p className="text-xs text-slate-600">
        {prepaid ? (
          <>
            <span className="font-semibold text-slate-800">{formatUsd(p.totalCents)}</span> {p.billedLabel.toLowerCase()}
          </>
        ) : (
          p.billedLabel
        )}
      </p>
      {prepaid && (
        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2 py-0.5">
          {savingsBadgeText(interval)} · you keep {formatUsd(p.savingsCents)}
        </span>
      )}
    </div>
  );
}
