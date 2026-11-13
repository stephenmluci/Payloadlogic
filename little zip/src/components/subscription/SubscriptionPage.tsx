'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Truck, CheckCircle2, ArrowRight, Zap, Shield, Star, Layers,
  TrendingUp, Radio, Users, BarChart3, Minus, Plus, HelpCircle,
} from 'lucide-react';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';

/* ─────────────────────────────────────────────────────────────────────────────
   PRICING DATA
───────────────────────────────────────────────────────────────────────────── */
const PRICING = {
  base: {
    monthly:  { price: 99,  period: '/mo',       note: 'Billed monthly'                },
    biannual: { price: 499, period: '/6 months', note: '~$83/mo · Save $95 vs monthly' },
    annual:   { price: 829, period: '/year',     note: '~$69/mo · Save $359 vs monthly' },
  },
  addon: {
    monthly:  { price: 25,  period: '/truck/mo'   },
    biannual: { price: 125, period: '/truck/6-mo' },
    annual:   { price: 199, period: '/truck/year' },
  },
};

const BASE_TRUCKS = 3;
const MAX_TRUCKS  = 20;

type Cycle = 'monthly' | 'biannual' | 'annual';

const CYCLE_LABELS: Record<Cycle, string> = {
  monthly:  'Monthly',
  biannual: '6-Month Pass',
  annual:   '1-Year Pass',
};

const CYCLE_BADGES: Record<Cycle, string | null> = {
  monthly:  null,
  biannual: 'Save $95',
  annual:   'Best Value',
};

const FEATURES = [
  { icon: Layers,     text: 'Full Load Management & Partial Freight Consolidation' },
  { icon: Radio,      text: 'Live Operational Dispatch Command Center' },
  { icon: TrendingUp, text: 'Real-Time Deck Space & Payload Capacity Calculators' },
  { icon: Users,      text: 'Driver & Equipment Asset Tracking' },
  { icon: BarChart3,  text: 'Per-Load Profit & Expense Tracking' },
  { icon: Shield,     text: 'CDL / Med Card Expiry Alerts' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   FLEET SLIDER
───────────────────────────────────────────────────────────────────────────── */
function FleetSizer({ count, onChange }: { count: number; onChange: (n: number) => void }) {
  const pct   = ((count - 1) / (MAX_TRUCKS - 1)) * 100;
  const clamp = (n: number) => Math.min(MAX_TRUCKS, Math.max(1, Math.round(n)));

  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-slate-400 text-sm font-medium mb-0.5">How many trucks are in your fleet?</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-white tabular-nums transition-all duration-200" aria-live="polite">
              {count}
            </span>
            <span className="text-slate-400 text-base">{count === 1 ? 'truck' : 'trucks'}</span>
            {count > BASE_TRUCKS && (
              <span className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                <Zap className="h-3 w-3" />
                {count - BASE_TRUCKS} add-on{count - BASE_TRUCKS > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(clamp(count - 1))}
            disabled={count <= 1}
            aria-label="Decrease fleet size"
            className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number" min={1} max={MAX_TRUCKS} value={count}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="w-14 text-center bg-white/5 border border-white/10 rounded-xl text-white font-bold text-sm py-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <button
            onClick={() => onChange(clamp(count + 1))}
            disabled={count >= MAX_TRUCKS}
            aria-label="Increase fleet size"
            className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative h-6 flex items-center">
        <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-white/5 border border-white/10" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 pointer-events-none transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
        {MAX_TRUCKS > BASE_TRUCKS && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/20 pointer-events-none rounded-full"
            style={{ left: `${((BASE_TRUCKS - 1) / (MAX_TRUCKS - 1)) * 100}%` }}
          />
        )}
        <input
          type="range" min={1} max={MAX_TRUCKS} value={count}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Fleet size slider"
          className="relative w-full h-6 appearance-none bg-transparent cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-500/40
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-400"
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-slate-600 font-medium select-none">
        <span>1</span>
        <span>Base plan includes up to {BASE_TRUCKS} trucks</span>
        <span>{MAX_TRUCKS}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   BILLING TOGGLE
───────────────────────────────────────────────────────────────────────────── */
function BillingToggle({ active, onChange }: { active: Cycle; onChange: (c: Cycle) => void }) {
  const cycles: Cycle[] = ['monthly', 'biannual', 'annual'];
  return (
    <div role="tablist" aria-label="Billing frequency"
      className="inline-flex items-center gap-1 p-1 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm"
    >
      {cycles.map((c) => (
        <button
          key={c} role="tab" aria-selected={active === c} onClick={() => onChange(c)}
          className={`relative px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
            active === c
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          {CYCLE_LABELS[c]}
          {CYCLE_BADGES[c] && active !== c && (
            <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold leading-none align-middle">
              {CYCLE_BADGES[c]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PRICE CARD
───────────────────────────────────────────────────────────────────────────── */
function PriceCard({
  cycle, fleetCount, extraTrucks, isHighlighted, onChoosePlan,
}: {
  cycle: Cycle;
  fleetCount: number;
  extraTrucks: number;
  isHighlighted?: boolean;
  onChoosePlan: (cycle: Cycle, trucks: number) => void;
}) {
  const base  = PRICING.base[cycle];
  const addon = PRICING.addon[cycle];
  const totalPrice = base.price + extraTrucks * addon.price;
  const savingsBadge = cycle === 'biannual' ? 'Save $95' : cycle === 'annual' ? 'Best Value · Save $359' : null;
  const perMonthEq =
    cycle === 'biannual' ? ((base.price + extraTrucks * addon.price) / 6).toFixed(0)
    : cycle === 'annual' ? ((base.price + extraTrucks * addon.price) / 12).toFixed(0)
    : null;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
        isHighlighted
          ? 'border-blue-500/50 bg-gradient-to-b from-blue-950/70 to-indigo-950/40 shadow-2xl shadow-blue-600/20 ring-1 ring-blue-500/20'
          : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      {isHighlighted && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-500" />
      )}
      {isHighlighted && (
        <div className="absolute -top-px right-6">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-b-lg shadow-lg">
            🔥 Most Popular
          </div>
        </div>
      )}

      <div className="p-6 sm:p-8 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{CYCLE_LABELS[cycle]}</p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
              {cycle === 'monthly' ? 'Monthly Access' : cycle === 'biannual' ? '6-Month Pass' : 'Annual Pass'}
            </h2>
          </div>
          {savingsBadge && (
            <span className={`flex-shrink-0 inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${
              cycle === 'annual'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
            }`}>
              {savingsBadge}
            </span>
          )}
        </div>

        <div className="mb-2">
          <div className="flex items-end gap-1.5 flex-wrap">
            <span className="text-4xl sm:text-5xl font-black text-white tabular-nums transition-all duration-300" aria-label={`Total price: $${totalPrice}`}>
              ${totalPrice}
            </span>
            <span className="text-slate-400 text-sm pb-1">{base.period}</span>
          </div>
          {perMonthEq && (
            <p className="text-emerald-400 text-xs font-bold mt-0.5">≈ ${perMonthEq}/mo effective rate</p>
          )}
        </div>

        <div className={`rounded-xl border p-3 mb-6 text-xs leading-snug transition-all duration-300 ${
          extraTrucks > 0
            ? 'border-amber-500/25 bg-amber-500/8 text-amber-200'
            : 'border-white/5 bg-white/[0.02] text-slate-500'
        }`}>
          {extraTrucks > 0 ? (
            <>
              <span className="font-bold text-amber-300">Breakdown: </span>
              Base plan (up to {BASE_TRUCKS} trucks){' '}
              <span className="font-semibold text-white">${base.price}</span>
              {' '}+ {extraTrucks} extra truck{extraTrucks > 1 ? 's' : ''} ×{' '}
              <span className="font-semibold text-white">${addon.price}</span>
              {' '}= <span className="font-bold text-white">${totalPrice}</span>{base.period}
            </>
          ) : (
            <>
              Base plan includes up to {BASE_TRUCKS} trucks ·{' '}
              <span className="text-blue-400 font-medium">
                {fleetCount === 1
                  ? `You're using ${fleetCount} of ${BASE_TRUCKS} included`
                  : `${fleetCount} of ${BASE_TRUCKS} included slots used`}
              </span>
            </>
          )}
        </div>

        <div className="border-t border-white/5 mb-6" />

        <ul className="space-y-3 mb-8 flex-1">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-slate-200">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        <button
          onClick={() => onChoosePlan(cycle, fleetCount)}
          className={`mt-auto flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all duration-200 hover:-translate-y-0.5 group ${
            isHighlighted
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40'
              : 'border border-white/15 bg-white/5 hover:bg-white/10 text-white'
          }`}
        >
          Choose Plan & Continue
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </button>

        <p className="text-center text-[10px] text-slate-600 mt-3">
          {cycle === 'monthly'
            ? 'Renews monthly. Cancel anytime.'
            : cycle === 'biannual'
            ? 'Prepaid for 6 months. Non-refundable.'
            : 'Prepaid annually. Best per-month rate.'}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FAQ
───────────────────────────────────────────────────────────────────────────── */
const FAQ = [
  {
    q: 'What counts as a "truck" for billing?',
    a: 'Each physical power unit (Class 3–8 truck) counts as one truck. Trailers are not counted. Your base plan covers up to 3 trucks. Each truck above 3 is billed at the add-on rate for your chosen cycle.',
  },
  {
    q: 'Is there a free trial available?',
    a: 'Yes — select "Start Free Trial" below to explore every feature with pre-loaded sample data. No credit card required.',
  },
  {
    q: 'Are drivers and trailers included at no extra cost?',
    a: 'Yes — driver profiles, trailer management, client portal, and all dispatch features are included in every plan at no extra charge.',
  },
  {
    q: 'Can I switch billing cycles mid-plan?',
    a: 'You can upgrade from Monthly → 6-Month or Annual at any time. Credits from unused monthly days will be applied toward the longer plan.',
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
type SubscriptionPageProps = {
  userDisplayName: string;
  onStartTrial: () => void;
};

export function SubscriptionPage({ userDisplayName, onStartTrial }: SubscriptionPageProps) {
  const [fleetCount, setFleetCount] = useState(1);
  const [cycle, setCycle]           = useState<Cycle>('biannual');

  const extraTrucks       = useMemo(() => Math.max(0, fleetCount - BASE_TRUCKS), [fleetCount]);
  const handleCycleChange = useCallback((c: Cycle) => setCycle(c), []);
  const handleFleetChange = useCallback((n: number) => setFleetCount(n), []);

  const handleChoosePlan = (selectedCycle: Cycle, trucks: number) => {
    // Placeholder — wire to Stripe or your billing system here
    alert(`Plan selected: ${CYCLE_LABELS[selectedCycle]} · ${trucks} truck${trucks !== 1 ? 's' : ''}.\n\nPayment integration coming soon — contact support to activate your plan.`);
  };

  return (
    <div className="min-h-screen bg-[#0c141f] text-white overflow-x-hidden">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0c141f]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="hover:opacity-95 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={34} />
          </Link>
          <p className="text-sm text-slate-400">
            Welcome, <span className="text-white font-semibold">{userDisplayName}</span>
          </p>
        </div>
      </div>

      {/* ── PAGE HEADER ────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-10 px-4 sm:px-6 lg:px-8 text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-700/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-semibold uppercase tracking-widest mb-6">
            <Zap className="h-3 w-3" />
            Choose Your Plan
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-5 leading-[1.05]">
            <span className="text-white">Pricing that scales</span>
            <br />
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 60%, #a78bfa 100%)' }}
            >
              with your fleet.
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-xl max-w-xl mx-auto">
            One flat base rate covers up to 3 trucks. Each additional truck adds a small per-truck fee — you only pay for what you run.
          </p>
        </div>
      </section>

      {/* ── CALCULATOR + TOGGLE ────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-2xl border border-white/8 bg-white/[0.03] p-6 sm:p-8 mb-8">
            <div className="absolute -top-px left-12 right-12 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            <div className="flex flex-col gap-6 sm:gap-8">
              <FleetSizer count={fleetCount} onChange={handleFleetChange} />

              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full animate-pulse bg-emerald-400" />
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    {fleetCount} {fleetCount === 1 ? 'Truck' : 'Trucks'} Selected
                  </span>
                </div>
                {extraTrucks > 0 ? (
                  <>
                    <div className="hidden sm:block w-px h-6 bg-white/10" />
                    <span className="text-xs text-amber-300 font-semibold">
                      Base plan (3 trucks) + {extraTrucks} add-on{extraTrucks > 1 ? 's' : ''} applied to all prices below
                    </span>
                  </>
                ) : (
                  <>
                    <div className="hidden sm:block w-px h-6 bg-white/10" />
                    <span className="text-xs text-emerald-300 font-semibold">
                      ✓ Covered by base plan — {BASE_TRUCKS - fleetCount} slot{BASE_TRUCKS - fleetCount !== 1 ? 's' : ''} remaining before add-ons apply
                    </span>
                  </>
                )}
                <div className="sm:ml-auto text-xs text-slate-500">
                  Showing prices for:{' '}
                  <span className="text-white font-semibold">{CYCLE_LABELS[cycle]}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
                <span className="text-sm text-slate-400 font-medium flex-shrink-0">Billing frequency:</span>
                <BillingToggle active={cycle} onChange={handleCycleChange} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING CARDS ──────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {(['monthly', 'biannual', 'annual'] as Cycle[]).map((c) => (
              <PriceCard
                key={c}
                cycle={c}
                fleetCount={fleetCount}
                extraTrucks={extraTrucks}
                isHighlighted={c === 'biannual'}
                onChoosePlan={handleChoosePlan}
              />
            ))}
          </div>

          {/* Free trial note */}
          <div className="mt-10 text-center">
            <div className="inline-flex flex-col sm:flex-row items-center gap-3 px-6 py-4 rounded-xl border border-white/8 bg-white/[0.02]">
              <Shield className="h-5 w-5 text-green-400 flex-shrink-0" />
              <div className="text-sm text-slate-400">
                Not ready to commit?{' '}
                <button
                  onClick={onStartTrial}
                  className="text-blue-400 hover:text-blue-300 font-semibold underline-offset-2 hover:underline transition-colors"
                >
                  Start your free trial
                </button>
                {' '}— full feature access, no card required.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center mb-3">Everything included in every plan</h2>
          <p className="text-slate-400 text-sm text-center mb-10">No feature gating. Every plan gets the full suite.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { emoji: '📦', title: 'Full Load Management', desc: 'Create, dispatch, edit, and archive loads from pickup to final delivery.' },
              { emoji: '🧮', title: 'Partial Freight Consolidation', desc: 'Stack multiple cargoes onto one deck run with GCWR and dimension validation.' },
              { emoji: '🖥️', title: 'Live Dispatch Command Center', desc: 'Live fleet telemetry view — driver phases, load statuses, ETA projections.' },
              { emoji: '📐', title: 'Deck Space & Payload Calculators', desc: 'Real-time cargo placement with stacking, nesting, and legal height checks.' },
              { emoji: '👷', title: 'Driver Asset Tracking', desc: 'Full driver roster with CDL class, med card expiry, and availability status.' },
              { emoji: '🚛', title: 'Equipment Registry', desc: 'Trucks and trailers tracked with GVWR, towing caps, CPM history, and MPG.' },
              { emoji: '💰', title: 'Per-Load Profit Tracking', desc: 'Real-time fuel, DEF, payroll, and overhead cost calculations per load.' },
              { emoji: '📄', title: 'Invoice & Agreement PDFs', desc: 'One-click professional PDF documents with carrier branding and terms.' },
              { emoji: '🌐', title: 'Client Portal', desc: 'Clients submit load requests directly into your dispatch dashboard.' },
              { emoji: '📊', title: 'Expense Tracking', desc: 'Log and categorize all fleet expenses, link them to loads or vehicles.' },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="flex gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="text-2xl flex-shrink-0 mt-0.5">{emoji}</div>
                <div>
                  <div className="text-sm font-bold text-white mb-0.5">{title}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <HelpCircle className="h-8 w-8 text-blue-400 mx-auto mb-3" />
            <h2 className="text-2xl sm:text-3xl font-extrabold">Common questions</h2>
          </div>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-white/5 bg-white/[0.02] p-5 sm:p-6">
                <h3 className="text-white font-semibold text-sm sm:text-base mb-2">{q}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-xl mx-auto text-center">
          <Star className="h-8 w-8 text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">Start dispatching smarter today</h2>
          <p className="text-slate-400 text-sm sm:text-base mb-8">
            Try the app free with sample data, then pick the plan that fits your fleet.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => handleChoosePlan(cycle, fleetCount)}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold transition-all shadow-2xl shadow-blue-600/30 hover:-translate-y-1"
            >
              Get Started — {fleetCount} {fleetCount === 1 ? 'Truck' : 'Trucks'}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={onStartTrial}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold transition-all"
            >
              Try Free First
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8 bg-[#090e17]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={26} />
          </Link>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/privacy-policy" className="hover:text-slate-400 transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-slate-400 transition-colors">Terms</Link>
            <span>© {new Date().getFullYear()} PayloadLogic</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
