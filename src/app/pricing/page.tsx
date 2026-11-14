'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Shield,
  Sparkles,
  Truck,
  HelpCircle,
} from 'lucide-react';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import {
  BILLING_INTERVALS,
  EXTRA_TRUCK_MONTHLY_USD,
  formatUsd,
  getExtraTruckPrice,
  getPlanPrice,
  intervalLabel,
  savingsBadgeText,
  type BillingInterval,
} from '@/lib/pricing';
import { PLAN_CONFIG } from '@/lib/planLimits';

interface ComparisonRow {
  feature: string;
  starter: string | boolean;
  fleetPro: string | boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: 'Power Units (Trucks)', starter: '1 Truck', fleetPro: '3 Trucks included (+$25/mo per extra)' },
  { feature: 'Trailers', starter: 'Unlimited', fleetPro: 'Unlimited' },
  { feature: 'Driver Logins & HOS Tracking', starter: '1 Driver', fleetPro: 'Unlimited Drivers' },
  { feature: 'Load Management & Partial Freight Consolidation', starter: true, fleetPro: true },
  { feature: 'Deck Space & Payload Capacity Calculators', starter: true, fleetPro: true },
  { feature: 'BOLs, Rate Agreements & Invoice PDFs', starter: true, fleetPro: true },
  { feature: 'Expense Ledger & Profit Tracking', starter: true, fleetPro: true },
  { feature: 'AI Assistant (Create Loads, Answer Questions & Track Profit)', starter: true, fleetPro: true },
  { feature: 'Live Operations Dispatch Command Center', starter: false, fleetPro: true },
  { feature: 'Client Portal (Direct Load Requests)', starter: false, fleetPro: true },
  { feature: 'Multi-Truck Driver Settlements', starter: false, fleetPro: true },
];

const FAQ = [
  {
    q: 'How does the 14-day free trial work?',
    a: 'New companies get a full 14-day free trial of the selected plan with no credit card required. To start a trial, you must enter a real, active USDOT number verified in real time against the public FMCSA SAFER database.',
  },
  {
    q: 'Can the same DOT number be used for multiple trials?',
    a: 'No. Each verified USDOT number is eligible for one 14-day free trial, even if someone signs up with a different email address.',
  },
  {
    q: 'What happens after the 14-day trial ends?',
    a: 'Your loads, drivers, equipment, and clients remain safely saved. To continue using PayloadLogic after 14 days, simply choose Starter or Fleet Pro.',
  },
  {
    q: 'Can I switch between Starter and Fleet Pro later?',
    a: 'Yes. You can upgrade from Starter to Fleet Pro or add extra trucks at any time from Billing & Plan inside your dashboard.',
  },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="inline-flex items-center justify-center text-emerald-400" aria-label="Included">
        <CheckCircle2 className="h-5 w-5" />
      </span>
    ) : (
      <span className="inline-flex items-center justify-center text-slate-600" aria-label="Not included">
        <XCircle className="h-5 w-5" />
      </span>
    );
  }
  return <span className="text-xs sm:text-sm font-semibold text-slate-200">{value}</span>;
}

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const starterPrice = getPlanPrice('starter', interval);
  const fleetProPrice = getPlanPrice('fleetPro', interval);
  const extraTruckPrice = getExtraTruckPrice(interval);

  const periodSuffix =
    interval === 'monthly' ? '/mo' : interval === 'sixMonth' ? ' / 6 mos' : '/yr';

  return (
    <div className="min-h-screen bg-[#0c141f] text-white overflow-x-hidden">
      {/* ── NAV ───────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0c141f]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-95 transition-opacity">
              <PayloadLogicLogo variant="compact" iconSize={32} />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Home</span>
            </Link>
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium text-slate-300 hover:text-white transition-colors px-2 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] text-xs sm:text-sm font-bold transition-all"
            >
              Start Free Trial
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-10 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            14-Day Free Trial · Verified Active USDOT Required
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Simple, transparent pricing for hotshot fleets
          </h1>
          <p className="text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Choose <strong className="text-white">Starter</strong> for a solo truck or{' '}
            <strong className="text-white">Fleet Pro</strong> for multi-truck dispatch. Start with a{' '}
            <strong className="text-white">14-day free trial</strong> using your verified FMCSA USDOT number.
          </p>

          {/* Billing Interval Toggle */}
          <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-xl bg-white/5 border border-white/10">
            {BILLING_INTERVALS.map((iv) => {
              const active = interval === iv;
              const badge = savingsBadgeText(iv);
              return (
                <button
                  key={iv}
                  type="button"
                  onClick={() => setInterval(iv)}
                  className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{intervalLabel(iv)}</span>
                  {badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {iv === 'annual' ? 'Save 20%' : 'Save 10%'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TWO PLAN CARDS ────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 pb-14">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          {/* Starter Plan */}
          <div className="rounded-2xl border border-white/10 bg-[#111d2e]/80 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  {PLAN_CONFIG.starter.name}
                </h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-slate-300">
                  Solo Operator
                </span>
              </div>
              <p className="text-sm text-slate-400 mb-6">{PLAN_CONFIG.starter.tagline}</p>

              <div className="mb-6 pb-6 border-b border-white/10">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    {formatUsd(starterPrice.totalCents)}
                  </span>
                  <span className="text-slate-400 text-sm font-medium">{periodSuffix}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {starterPrice.billedLabel}
                  {interval !== 'monthly' && (
                    <span className="text-emerald-400 font-semibold ml-1.5">
                      ({formatUsd(starterPrice.effectiveMonthlyCents)}/mo equivalent)
                    </span>
                  )}
                </p>
              </div>

              <ul className="space-y-3 text-sm text-slate-300 mb-8">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>1 Power Unit (Truck)</strong> &amp; Unlimited Trailers</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>1 Driver</strong> login &amp; HOS tracking</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Core TMS: Loads, BOLs, Rates, Invoices, Expenses &amp; Clients</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Deck Space &amp; Payload Capacity Calculators</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>AI Assistant</strong> that helps you create loads, answer questions, and track profit</span>
                </li>
              </ul>
            </div>

            <Link
              href="/login?mode=signup&plan=starter"
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base transition-all"
            >
              Start 14-Day Free Trial (Starter)
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Fleet Pro Plan */}
          <div className="relative rounded-2xl border-2 border-blue-500/70 bg-gradient-to-b from-[#16243a] to-[#111d2e] p-6 sm:p-8 flex flex-col justify-between shadow-2xl shadow-blue-900/30">
            <div className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold uppercase tracking-wider shadow">
              {PLAN_CONFIG.fleetPro.badge || 'Recommended'}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2 mt-1">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  {PLAN_CONFIG.fleetPro.name}
                </h2>
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <Truck className="h-3.5 w-3.5" />
                  3 Trucks Included
                </span>
              </div>
              <p className="text-sm text-slate-300 mb-6">{PLAN_CONFIG.fleetPro.tagline}</p>

              <div className="mb-6 pb-6 border-b border-white/10">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl sm:text-5xl font-black text-white">
                    {formatUsd(fleetProPrice.totalCents)}
                  </span>
                  <span className="text-slate-400 text-sm font-medium">{periodSuffix}</span>
                </div>
                <p className="text-xs text-slate-300 mt-1.5">
                  {fleetProPrice.billedLabel}
                  {interval !== 'monthly' && (
                    <span className="text-emerald-400 font-semibold ml-1.5">
                      ({formatUsd(fleetProPrice.effectiveMonthlyCents)}/mo equivalent)
                    </span>
                  )}
                </p>
                <p className="text-xs text-amber-300 font-medium mt-1.5">
                  Need more than 3 trucks? +{formatUsd(extraTruckPrice.totalCents)}{periodSuffix} per extra truck
                  {interval !== 'monthly' ? ` (${formatUsd(EXTRA_TRUCK_MONTHLY_USD)}/mo base)` : ''}
                </p>
              </div>

              <ul className="space-y-3 text-sm text-slate-200 mb-8">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>3 Power Units (Trucks)</strong> included &amp; Unlimited Trailers</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Unlimited Driver</strong> logins &amp; HOS tracking</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Live Operations Dispatch Command Center</strong></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Client Portal</strong> &amp; <strong>Multi-Truck Settlements</strong></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>AI Assistant</strong> that helps you create loads, answer questions, and track profit</span>
                </li>
              </ul>
            </div>

            <Link
              href="/login?mode=signup&plan=fleetPro"
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] font-bold text-sm sm:text-base transition-all shadow-lg shadow-[#ffbe24]/25"
            >
              Start 14-Day Free Trial (Fleet Pro)
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Verified DOT Trial Notice */}
        <div className="max-w-5xl mx-auto mt-6 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 flex items-start sm:items-center gap-3 text-xs sm:text-sm text-blue-100">
          <Shield className="h-5 w-5 text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
          <p className="leading-relaxed">
            <strong>14-Day Free Trial Policy:</strong> Your trial only starts after your USDOT number is verified as{' '}
            <strong>real and active</strong> in the public FMCSA SAFER Company Snapshot database. One free trial is
            allowed per verified DOT number. After 14 days, choose a paid plan to continue.
          </p>
        </div>
      </section>

      {/* ── FEATURE COMPARISON TABLE ──────────────────────────────────────── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center mb-2">
            Plan &amp; Feature Comparison
          </h2>
          <p className="text-slate-400 text-sm text-center mb-8">
            Compare Starter and Fleet Pro side by side.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#111d2e]/80 shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04]">
                  <th className="py-4 px-4 sm:px-6 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Feature
                  </th>
                  <th className="py-4 px-4 sm:px-6 text-center text-xs font-bold uppercase tracking-wider text-slate-200">
                    Starter ({formatUsd(starterPrice.totalCents)}{periodSuffix})
                  </th>
                  <th className="py-4 px-4 sm:px-6 text-center text-xs font-bold uppercase tracking-wider text-blue-300">
                    Fleet Pro ({formatUsd(fleetProPrice.totalCents)}{periodSuffix})
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-white/5 ${idx % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
                  >
                    <td className="py-3.5 px-4 sm:px-6 text-xs sm:text-sm font-medium text-slate-200">
                      {row.feature}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-center">
                      <CellValue value={row.starter} />
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-center">
                      <CellValue value={row.fleetPro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="py-14 px-4 sm:px-6 lg:px-8 border-t border-white/10">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <HelpCircle className="h-7 w-7 text-blue-400 mx-auto mb-2" />
            <h2 className="text-2xl sm:text-3xl font-extrabold">Common Questions</h2>
          </div>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="text-white font-semibold text-sm sm:text-base mb-1.5">{q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8 bg-[#090e17]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={26} />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/login?mode=signup" className="hover:text-white transition-colors">Start Free Trial</Link>
            <Link href="/help" className="hover:text-white transition-colors">Help</Link>
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-white transition-colors">Terms</Link>
            <span>© {new Date().getFullYear()} PayloadLogic</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
