'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Truck, CheckCircle2, ArrowRight, Zap, ShieldCheck,
  Building2, Users, Star, CreditCard, AlertTriangle,
} from 'lucide-react';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import { FinancialSetupReminders } from '@/components/onboarding/FinancialSetupReminders';

/* ─────────────────────────────────────────────────────────────────────────────
   STEP INDICATOR
───────────────────────────────────────────────────────────────────────────── */
function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: 'Welcome' },
    { n: 2 as const, label: 'Account Type' },
    { n: 3 as const, label: 'Choose Plan' },
  ];
  return (
    <div className="flex items-center gap-2 mb-10">
      {steps.map(({ n, label }, i) => (
        <React.Fragment key={n}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                n < current
                  ? 'bg-emerald-500 text-white'
                  : n === current
                  ? 'bg-blue-600 text-white ring-4 ring-blue-600/25'
                  : 'bg-white/10 text-slate-500'
              }`}
            >
              {n < current ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${n === current ? 'text-white' : 'text-slate-500'}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mt-[-12px] ${n < current ? 'bg-emerald-500/60' : 'bg-white/10'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 1 — WELCOME
───────────────────────────────────────────────────────────────────────────── */
function Step1Welcome({ onNext, userEmail }: { onNext: () => void; userEmail: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex justify-center mb-6">
        <PayloadLogicLogo variant="icon" iconSize={64} className="shadow-2xl shadow-[#ffbe24]/20" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 tracking-tight">
        Welcome to PayloadLogic
      </h1>
      <p className="text-slate-400 text-base mb-2 max-w-sm">
        Account created for <span className="text-white font-semibold">{userEmail}</span>
      </p>
      <p className="text-slate-500 text-sm mb-10 max-w-md leading-relaxed">
        You&apos;re just two quick steps away from your dispatch dashboard. Let&apos;s confirm your account type and pick a plan.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg mb-10 text-center">
        {[
          { icon: CheckCircle2, label: 'Load Management', color: 'text-emerald-400' },
          { icon: Users, label: 'Driver & Fleet Tools', color: 'text-blue-400' },
          { icon: Star, label: 'Per-Load Profit Tracking', color: 'text-amber-400' },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/[0.08] bg-white/[0.03]">
            <Icon className={`h-5 w-5 ${color}`} />
            <span className="text-xs text-slate-300 font-medium">{label}</span>
          </div>
        ))}
      </div>
      <Button
        onClick={onNext}
        className="w-full max-w-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl shadow-xl shadow-blue-600/30 hover:-translate-y-0.5 transition-all"
      >
        Let&apos;s Get Started <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 2 — ACCOUNT TYPE CONFIRMATION
───────────────────────────────────────────────────────────────────────────── */
function Step2AccountType({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 text-center tracking-tight">
        Confirm your account type
      </h2>
      <p className="text-slate-400 text-sm mb-8 text-center max-w-sm">
        Your account was registered as a <strong className="text-white">Company Owner / Dispatcher</strong>. You&apos;ll have full access to fleet, loads, financials, and driver management.
      </p>

      <div className="w-full max-w-md rounded-2xl border-2 border-blue-500/60 bg-gradient-to-b from-blue-950/60 to-indigo-950/40 p-6 mb-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-500" />
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-6 w-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-white font-bold">Company Owner / Dispatcher</h3>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-bold uppercase tracking-wider">
                ✓ Your Role
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Full access to all dispatch, fleet, financial, and reporting tools. You can also create driver login accounts for your team.
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                'All loads, trips, and financials',
                'Driver & equipment management',
                'Client portal & invoicing',
                'Per-load profit analytics',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-8 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Are you a Driver?</strong> Driver accounts are created by your company dispatcher — they&apos;ll send you a login. You cannot self-register as a driver.
        </p>
      </div>

      <Button
        onClick={onNext}
        className="w-full max-w-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl shadow-xl shadow-blue-600/30 hover:-translate-y-0.5 transition-all"
      >
        This is me — Continue <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 3 — PLAN SELECTION
───────────────────────────────────────────────────────────────────────────── */
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    subtitle: 'Single Rig',
    price: '$49',
    period: '/mo',
    description: 'Perfect for solo owner-operators running 1 truck.',
    features: [
      'Full load management',
      '1 truck + unlimited trailers',
      'Per-load profit tracking',
      'Invoice & agreement PDFs',
      'Client portal',
    ],
    cta: 'Choose Starter',
    highlight: false,
  },
  {
    id: 'fleet-pro',
    name: 'Fleet Pro',
    subtitle: 'Multi-Truck',
    price: '$99',
    period: '/mo base',
    description: 'Scales with your fleet. Up to 3 trucks included, +$25/truck after.',
    features: [
      'Everything in Starter',
      'Up to 3 trucks (base plan)',
      'Unlimited driver seats',
      'Live Operations Command Center',
      'Advanced fleet consolidation',
    ],
    cta: 'Choose Fleet Pro',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    subtitle: 'Custom',
    price: 'Custom',
    period: '',
    description: 'Large fleets, dedicated support, and custom integrations.',
    features: [
      'Everything in Fleet Pro',
      '4+ trucks, volume pricing',
      'Priority onboarding support',
      'Dedicated account manager',
      'Custom integrations & API',
    ],
    cta: 'Contact Sales',
    highlight: false,
  },
];

function Step3Plan({ 
  onStartTrial, 
  onContinue
}: { 
  onStartTrial: () => void; 
  onContinue: () => void;
}) {
  const { toast } = useToast();
  const [eldAcknowledged, setEldAcknowledged] = React.useState(false);

  const handleChoosePlan = (planId: string, planName: string) => {
    if (!eldAcknowledged) {
      toast({
        variant: 'destructive',
        title: 'ELD Acknowledgment Required',
        description: 'You must acknowledge that Dash Dispatch does not replace your ELD before proceeding.',
      });
      return;
    }
    if (planId === 'enterprise') {
      toast({ title: 'Enterprise', description: 'Our team will reach out. Meanwhile, enjoy your free trial.', duration: 5000 });
    } else {
      toast({
        title: 'Your 14-day free trial is starting',
        description: `You'll get full Fleet Pro access now. Confirm ${planName} in Billing & Plan any time before the trial ends.`,
        duration: 6000,
      });
    }
    onContinue();
  };

  return (
    <div className="flex flex-col items-center w-full">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 text-center tracking-tight">
        Choose your plan
      </h2>
      <p className="text-slate-400 text-sm mb-8 text-center max-w-sm">
        Start free with no commitment, or pick the plan that fits your fleet. Upgrade at any time from your dashboard.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-6">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border overflow-hidden transition-all hover:-translate-y-0.5 ${
              plan.highlight
                ? 'border-blue-500/50 bg-gradient-to-b from-blue-950/70 to-indigo-950/40 shadow-2xl shadow-blue-600/20 ring-1 ring-blue-500/20'
                : 'border-white/[0.08] bg-white/[0.03]'
            }`}
          >
            {plan.highlight && (
              <>
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-500" />
                <div className="absolute -top-px right-4">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-b-lg shadow-lg">
                    🔥 Most Popular
                  </div>
                </div>
              </>
            )}
            <div className="p-5 flex flex-col h-full">
              <div className="mb-3">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-0.5">{plan.subtitle}</p>
                <h3 className="text-lg font-extrabold text-white">{plan.name}</h3>
              </div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-3xl font-black text-white">{plan.price}</span>
                {plan.period && <span className="text-slate-400 text-xs pb-1">{plan.period}</span>}
              </div>
              <p className="text-slate-500 text-xs mb-4 leading-relaxed">{plan.description}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleChoosePlan(plan.id, plan.name)}
                disabled={!eldAcknowledged}
                variant={plan.highlight ? 'default' : 'outline'}
                size="sm"
                className={`w-full mt-auto text-sm font-semibold ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-blue-600/30'
                    : 'border-white/15 bg-white/5 hover:bg-white/10 text-white'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                {plan.cta}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Crucial Financial Items Reminder Preview (Non-blocking) ── */}
      <FinancialSetupReminders variant="wizard" className="mb-6" />

      {/* ── Strict Legal Disclaimer: Hours of Service (HOS) & ELD ── */}
      <div className="w-full rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 sm:p-5 mb-6 text-left shadow-lg shadow-amber-950/20">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-amber-200 text-xs sm:text-sm tracking-tight">
              Strict Legal Notice: Hours of Service (HOS) &amp; ELD Compliance
            </h4>
            <p className="text-xs sm:text-sm font-medium text-amber-100/90 leading-relaxed">
              Hours of Service (HOS) provided in this app are for estimation purposes only. Dash Dispatch is NOT a certified Electronic Logging Device (ELD). Drivers must strictly rely on their certified ELD for legal compliance.
            </p>
          </div>
        </div>

        {/* Mandatory Checkbox */}
        <div className="mt-4 pt-3 border-t border-amber-500/30">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="onboardingEldAck"
              checked={eldAcknowledged}
              onCheckedChange={(checked) => setEldAcknowledged(checked as boolean)}
              className="mt-0.5 border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
            />
            <Label
              htmlFor="onboardingEldAck"
              className="text-xs sm:text-sm font-bold text-white leading-snug cursor-pointer select-none"
            >
              I understand and agree that Dash Dispatch does not replace my ELD. <span className="text-red-400">*</span>
            </Label>
          </div>
          {!eldAcknowledged && (
            <p className="text-[11px] text-amber-300/80 font-medium mt-1 pl-7">
              * Drivers and fleet operators must explicitly acknowledge this disclaimer to continue.
            </p>
          )}
        </div>
      </div>

      {/* Free trial CTA */}
      <div className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span className="text-white font-bold text-sm">Start your 14-day free trial</span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            14 days of full Fleet Pro access. No credit card needed. Your loads, drivers, and clients are saved. One free trial per DOT number.
          </p>
        </div>
        <Button
          onClick={onContinue}
          disabled={!eldAcknowledged}
          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 shadow-lg shadow-emerald-600/30 hover:-translate-y-0.5 transition-all"
        >
          Start Free Trial
        </Button>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!eldAcknowledged) {
            toast({
              variant: 'destructive',
              title: 'ELD Acknowledgment Required',
              description: 'You must acknowledge that Dash Dispatch does not replace your ELD before proceeding.',
            });
            return;
          }
          onStartTrial();
        }}
        className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline"
      >
        Or explore the demo with sample data (nothing is saved)
      </button>

      <p className="text-xs text-slate-600 mt-4 text-center">
        By continuing you agree to our{' '}
        <Link href="/terms-of-service" className="text-slate-500 hover:text-slate-400 underline-offset-2 hover:underline">
          Terms of Service
        </Link>
        {' '}and{' '}
        <Link href="/privacy-policy" className="text-slate-500 hover:text-slate-400 underline-offset-2 hover:underline">
          Privacy Policy
        </Link>.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN WIZARD
───────────────────────────────────────────────────────────────────────────── */
export function OnboardingWizard() {
  const { user, onboardingStep, setOnboardingStep, handleStartTrial, continueToDashboard } = useApp();

  const next = () => setOnboardingStep((s) => Math.min(3, s + 1) as 1 | 2 | 3);

  return (
    <div className="min-h-screen bg-[#0c141f] text-white flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="mb-8 flex justify-center">
        <PayloadLogicLogo variant="horizontal" priority />
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl">
        <StepIndicator current={onboardingStep} />
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-10">
          <div className="absolute top-0 left-12 right-12 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

          {onboardingStep === 1 && (
            <Step1Welcome onNext={next} userEmail={user?.email ?? ''} />
          )}
          {onboardingStep === 2 && (
            <Step2AccountType onNext={next} />
          )}
          {onboardingStep === 3 && (
            <Step3Plan onStartTrial={handleStartTrial} onContinue={continueToDashboard} />
          )}
        </div>
      </div>
    </div>
  );
}

