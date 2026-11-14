'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard,
  Zap,
  CheckCircle2,
  ExternalLink,
  Truck,
  ArrowRight,
  Star,
  ShieldCheck,
  Check,
  Lock,
  Users,
  Sparkles,
  Calendar,
  Layers,
  HelpCircle,
  FileText
} from 'lucide-react';
import { STRIPE_PLANS } from '@/lib/stripe';
import { TRIAL_DAYS, TRIAL_MESSAGES } from '@/lib/trial';
import { auth } from '@/lib/firebase';
import { startCheckout, openBillingPortal } from '@/lib/billingClient';
import { BillingIntervalToggle, PlanPriceBlock } from '@/components/billing/BillingIntervalToggle';
import { getPlanPrice, formatUsd, intervalLabel, describePlanChoice, INTERVAL_CONFIG, savingsBadgeText, type BillingInterval } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/lib/support';

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN COMPARISON DATA
───────────────────────────────────────────────────────────────────────────── */
interface PlanCardData {
  id: 'starter' | 'fleetPro';
  name: string;
  badge?: string;
  tagline: string;
  truckCapacity: string;
  driverSeats: string;
  popular?: boolean;
  features: string[];
}

const PLANS: PlanCardData[] = [
  {
    id: 'starter',
    name: 'Starter Plan',
    tagline: 'Ideal for Solo Owner-Operators running a single rig.',
    truckCapacity: '1 Power Unit',
    driverSeats: '1 Driver Account',
    popular: false,
    features: [
      '1 Power Unit (Truck) + Unlimited Trailers',
      'Full Load Management & Multi-Stop Trips',
      'Rate Calculator & Real-Time Profit Tracking',
      'Digital Bill of Lading (BOL) & Invoice Generation',
      'Expense Tracking & Fuel Receipt Storage',
      'Client & Shipper Directory with 1-Click Load Start',
      'AI Assistant that helps you create loads, answer questions, and track profit',
    ],
  },
  {
    id: 'fleetPro',
    name: 'Fleet Pro Plan',
    badge: 'Recommended for Fleets',
    tagline: 'Built for multi-truck fleets, dispatchers, and growing teams.',
    truckCapacity: 'Up to 3 Trucks (+$25/mo per extra)',
    driverSeats: 'Unlimited Driver Accounts',
    popular: true,
    features: [
      'Everything in Starter, plus:',
      'Up to 3 Trucks included (+$25/mo per extra rig)',
      'Unlimited Driver App Logins & HOS Tracking',
      'Live Operations Command Center & Active Telemetry',
      'Client Portal with Self-Service Load Requests',
      'Multi-Truck Settlement Statements & Split Reports',
      'Priority Dispatch System Support',
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   FEATURE COMPARISON MATRIX
───────────────────────────────────────────────────────────────────────────── */
const FEATURE_MATRIX = [
  { feature: 'Power Units (Trucks) Supported', starter: '1 Truck', pro: '3 Trucks included (+more)' },
  { feature: 'Trailers Supported', starter: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Driver Mobile Logins & HOS', starter: '1 Driver', pro: 'Unlimited Drivers' },
  { feature: 'Multi-Stop Trip Consolidation', starter: '✓ Included', pro: '✓ Included' },
  { feature: 'Rate Projections & Margin Calculator', starter: '✓ Included', pro: '✓ Included' },
  { feature: 'Instant BOL & Invoice Generation', starter: '✓ Included', pro: '✓ Included' },
  { feature: 'AI Assistant (Loads, Q&A & Profit Tracking)', starter: '✓ Included', pro: '✓ Included' },
  { feature: 'Live Operations Command Center', starter: '—', pro: '✓ Full Access' },
  { feature: 'Client Portal Shipper Requests', starter: '—', pro: '✓ Full Access' },
  { feature: 'Multi-Truck Payroll Settlements', starter: '—', pro: '✓ Included' },
];

export function BillingPage() {
  const { 
    user, 
    isTrialSession, 
    vehicles, 
    driverProfiles, 
    loads,
    subscriptionTier,
    planLimits,
    setSubscriptionTier,
    trial,
    billingInterval,
    isOwnerOrAdmin,
  } = useApp();
  const { toast } = useToast();

  const registeredTrucks = vehicles.filter(v => v.type === 'truck').length;
  const registeredTrailers = vehicles.filter(v => v.type === 'trailer').length;
  const activeDrivers = driverProfiles.length;
  const isStarter = subscriptionTier === 'starter';

  // While on (or after) a free trial the plan the user has *committed to* is the selected one, not the evaluation access.
  const onTrialTrack = trial.phase === 'active' || trial.phase === 'expired';
  const committedTier = onTrialTrack ? trial.selectedTier : subscriptionTier;

  const planDisplayTitle = isOwnerOrAdmin
    ? 'Owner Lifetime Access (Fleet Pro)'
    : isTrialSession 
    ? (isStarter ? 'Starter Plan (Evaluation)' : 'Fleet Pro Plan (Evaluation)')
    : trial.phase === 'active' ? 'Free Trial'
    : trial.phase === 'expired' ? 'Free Trial Ended'
    : (isStarter ? 'Starter Plan · Solo Rig' : 'Fleet Pro Plan · Multi-Rig');

  const scrollToPlans = () => document.getElementById('plan-options')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const committedInterval: BillingInterval | null = onTrialTrack ? trial.selectedInterval : billingInterval;
  // Default stays Monthly; once a plan is chosen the selector starts on that plan's period.
  const [interval, setInterval_] = useState<BillingInterval>(committedInterval ?? 'monthly');
  const [isRedirecting, setIsRedirecting] = useState(false);

  const monthlyLabel = (tier: 'starter' | 'fleetPro') => formatUsd(getPlanPrice(tier, 'monthly').totalCents);
  const planName = (tier: 'starter' | 'fleetPro') => (tier === 'fleetPro' ? 'Fleet Pro' : 'Starter');
  /** "$950.40 billed annually" style CTA suffix for the selected period. */
  const ctaPrice = (tier: 'starter' | 'fleetPro') => {
    const p = getPlanPrice(tier, interval);
    return interval === 'monthly' ? `${formatUsd(p.totalCents)}/mo` : `${formatUsd(p.totalCents)} ${p.billedLabel.toLowerCase().replace('billed ', '')}`;
  };

  const handleSelectPlan = async (planId: 'starter' | 'fleetPro') => {
    if (planId === committedTier && interval === committedInterval) {
      toast({
        title: 'Already Selected',
        description: trial.phase === 'active'
          ? `${planName(planId)} (${intervalLabel(interval)}) will begin when your free trial ends.`
          : `You are currently on the ${planLimits.name} (${intervalLabel(interval)}).`,
      });
      return;
    }

    // Real payments: Stripe Checkout for new subscribers, Customer Portal "confirm change" for existing ones.
    if (!isTrialSession) {
      setIsRedirecting(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const res = await startCheckout(token, planId, interval);
          if (res.ok && res.url) {
            window.location.href = res.url;
            return;
          }
          if (res.code !== 'not_configured') {
            toast({ variant: 'destructive', title: 'Checkout unavailable', description: res.error || 'Please try again in a moment.' });
            return;
          }
          // Stripe isn't configured in this environment → fall through to the in-app plan switch.
        }
      } finally {
        setIsRedirecting(false);
      }
    }

    await setSubscriptionTier(planId, interval);
    if (trial.phase === 'active') {
      toast({
        title: `${describePlanChoice(planId, interval)}`,
        description: `Your free trial continues until ${trial.endsAt?.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. Your plan starts after that.`,
      });
    }
  };

  const handleManagePortal = async () => {
    const token = auth.currentUser?.getIdToken ? await auth.currentUser.getIdToken() : null;
    const res = token ? await openBillingPortal(token) : { ok: false as const, code: 'not_configured' as const };
    if (res.ok && res.url) {
      window.location.href = res.url;
      return;
    }
    toast({
      title: res.code === 'no_subscription' ? 'No paid subscription yet' : 'Stripe Billing Portal',
      description: res.code === 'no_subscription'
        ? 'Choose a plan below to get started.'
        : (res.error || 'Customer portal access will open automatically once active payment methods are on file.'),
      duration: 5000,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-headline text-slate-900 tracking-tight flex items-center gap-2.5">
            <CreditCard className="h-7 w-7 text-blue-600" />
            Billing &amp; Subscription
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review your current subscription status, fleet rig entitlements, and plan upgrade options.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="text-xs h-9 font-semibold text-slate-700 border-slate-300 hover:bg-slate-50 gap-1.5"
          >
            <Link href="/pricing" target="_blank">
              <ExternalLink className="h-3.5 w-3.5" />
              Public Pricing Table
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Current Plan Status Card ─────────────────────────────────── */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
        {/* Top Banner */}
        <div className="p-5 sm:p-6 pb-4 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center shrink-0">
              {isTrialSession ? <Zap className="h-6 w-6 text-amber-400" /> : <Star className="h-6 w-6 text-blue-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold font-headline">{planDisplayTitle}</span>
                <Badge className={cn(
                  "text-xs font-semibold px-2 py-0.5 border",
                  isOwnerOrAdmin
                    ? "bg-blue-500/20 text-blue-200 border-blue-400/30"
                    : trial.phase === 'expired'
                    ? "bg-amber-500/20 text-amber-200 border-amber-400/30"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full animate-pulse mr-1.5",
                    isOwnerOrAdmin ? "bg-blue-400" : trial.phase === 'expired' ? "bg-amber-400" : "bg-emerald-400"
                  )} />
                  {isOwnerOrAdmin ? 'Owner / Admin Full Access · $0 / mo'
                    : isTrialSession ? 'Active Evaluation Period'
                    : trial.phase === 'active' ? `Trial Active · ${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} left`
                    : trial.phase === 'expired' ? 'Choose a plan to continue'
                    : 'Subscription Active'}
                </Badge>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Account: <span className="font-mono text-slate-200">{user?.email || 'Administrator Account'}</span>
              </p>
            </div>
          </div>

          {/* Quick Header CTA */}
          <div className="shrink-0 flex items-center gap-2">
            {isOwnerOrAdmin ? (
              <span className="text-xs font-bold text-blue-300 bg-blue-900/40 border border-blue-400/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                All Features & Plans Unlocked
              </span>
            ) : onTrialTrack ? (
              <Button
                onClick={scrollToPlans}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md h-9 px-4 gap-1.5"
              >
                <Sparkles className="h-4 w-4 text-amber-300" />
                Choose a Plan
              </Button>
            ) : isStarter ? (
              <Button
                onClick={() => handleSelectPlan('fleetPro')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md h-9 px-4 gap-1.5"
              >
                <Sparkles className="h-4 w-4 text-amber-300" />
                Upgrade to Fleet Pro ({ctaPrice('fleetPro')})
              </Button>
            ) : (
              <Button
                onClick={handleManagePortal}
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold h-9 px-4 gap-1.5"
              >
                <CreditCard className="h-4 w-4" />
                Manage Invoices
              </Button>
            )}
          </div>
        </div>

        {/* Status Metrics Grid */}
        <CardContent className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status & Term */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Billing Cycle
              </span>
              <span className="text-sm font-bold text-slate-900 block">
                {isTrialSession ? 'Evaluation Mode (Active)' : trial.phase === 'active' ? 'Free Trial · No card needed' : trial.phase === 'expired' ? 'Trial ended · Plan required' : 'Monthly Flexible Subscription'}
              </span>
              <p className="text-xs text-slate-500 leading-snug">
                {isStarter 
                  ? `Starter Plan (${formatUsd(getPlanPrice('starter', billingInterval).effectiveMonthlyCents)}/mo${billingInterval === 'monthly' ? '' : ', ' + INTERVAL_CONFIG[billingInterval].billedLabel.toLowerCase()}): 1 Power Unit (truck) and 1 Driver account.`
                  : `Fleet Pro Plan (${formatUsd(getPlanPrice('fleetPro', billingInterval).effectiveMonthlyCents)}/mo${billingInterval === 'monthly' ? '' : ', ' + INTERVAL_CONFIG[billingInterval].billedLabel.toLowerCase()}): 3 Power Units included, unlimited drivers, and live command center.`}
              </p>
            </div>

            {/* Registered Fleet Usage */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Fleet Roster &amp; Capacity
              </span>
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-blue-600" />
                {registeredTrucks} of {isStarter ? 1 : planLimits.maxTrucks} Trucks {isStarter && registeredTrucks >= 1 ? '· 100% Full' : ''}
              </span>
              <p className="text-xs text-slate-500 leading-snug">
                {activeDrivers} of {isStarter ? 1 : 'Unlimited'} drivers active • {registeredTrailers} trailer{registeredTrailers !== 1 ? 's' : ''} (unlimited).
              </p>
            </div>

            {/* Data Continuity Notice */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Data Protection
              </span>
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Grandfather Protection
              </span>
              <p className="text-xs text-slate-500 leading-snug">
                Existing trucks and drivers are never deleted. Plan limits only restrict registering new assets beyond your tier.
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              <span>Payments and invoices managed securely via Stripe.</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManagePortal}
                className="text-xs h-8 text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5"
              >
                <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                Customer Portal
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Free Trial Status ────────────────────────────────────────── */}
      {(trial.phase === 'active' || trial.phase === 'expired') && (
        <Card className={cn(
          "rounded-2xl shadow-sm overflow-hidden border-2",
          trial.phase === 'active' ? "border-blue-200 bg-blue-50/40" : "border-amber-300 bg-amber-50/50"
        )}>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold font-headline text-slate-900">
                    {trial.phase === 'active' ? 'Current status: Free Trial' : 'Free trial ended'}
                  </h2>
                  <Badge className={cn(
                    "text-[10px] font-bold border",
                    trial.phase === 'active' ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-amber-100 text-amber-800 border-amber-300"
                  )}>
                    {trial.phase === 'active' ? 'Active' : 'Expired'}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">
                  {trial.phase === 'active'
                    ? 'You have full Fleet Pro access (up to 3 trucks, unlimited drivers, Command Center, Client Portal) while you evaluate PayloadLogic.'
                    : trial.trialDeniedForDot
                      ? `${TRIAL_MESSAGES.dotAlreadyUsed} Choose a plan to continue.`
                      : `${TRIAL_MESSAGES.trialExpired} Your data is safe and will be waiting for you.`}
                </p>
              </div>
              {trial.phase === 'active' && (
                <div className="text-left sm:text-right shrink-0">
                  <div className="text-3xl font-extrabold text-slate-900 leading-none">{trial.daysRemaining}</div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-1">
                    day{trial.daysRemaining === 1 ? '' : 's'} remaining
                  </div>
                </div>
              )}
            </div>

            {trial.phase === 'active' && trial.endsAt && (
              <div className="h-2 rounded-full bg-blue-100 overflow-hidden" aria-hidden>
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(4, ((TRIAL_DAYS - trial.daysRemaining + 1) / TRIAL_DAYS) * 100))}%` }}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {!trial.trialDeniedForDot && (
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    {trial.phase === 'active' ? 'Trial ends' : 'Trial ended'}
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {trial.endsAt?.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Carrier USDOT</span>
                <span className="text-sm font-bold text-slate-900 font-mono flex items-center gap-1.5 flex-wrap">
                  {trial.dot}
                  {trial.verificationStatus === 'valid_verified' || trial.dotVerification === 'verified' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                      Verified Carrier
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-300" title={TRIAL_MESSAGES.dotUnverified}>
                      Pending Verification
                    </Badge>
                  )}
                </span>
                {trial.carrierLegalName && (
                  <p className="text-[11px] font-medium text-slate-600 mt-1 truncate">
                    {trial.carrierLegalName} {trial.carrierState ? `(${trial.carrierState})` : ''}
                  </p>
                )}
              </div>
              {trial.selectedTier && (
                <div className="p-3 rounded-xl bg-white border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Plan after trial</span>
                  <span className="text-sm font-bold text-slate-900">
                    {describePlanChoice(trial.selectedTier, trial.selectedInterval ?? 'monthly')}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">How would you like to be billed?</span>
              <BillingIntervalToggle value={interval} onChange={setInterval_} />
              {interval !== 'annual' && (
                <button type="button" onClick={() => setInterval_('annual')} className="block text-xs font-semibold text-emerald-700 hover:underline">
                  Go annual and save 20% — that's 2+ months free
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => handleSelectPlan('starter')}
                variant="outline"
                className="h-9 text-xs font-bold border-slate-300 bg-white gap-1.5"
              >
                Choose Starter ({ctaPrice('starter')})
              </Button>
              <Button
                onClick={() => handleSelectPlan('fleetPro')}
                className="h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                <Sparkles className="h-4 w-4 text-amber-300" />
                Upgrade to Fleet Pro ({ctaPrice('fleetPro')})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Plan Options & Upgrade Cards ─────────────────────────────── */}
      <div id="plan-options" className="space-y-4 scroll-mt-24">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold font-headline text-slate-900">Choose Your Fleet Plan</h2>
            <p className="text-xs text-slate-500">
              Select a tier below. Switch anytime to test Starter limits (1 truck, 1 driver) vs Fleet Pro (3+ trucks, unlimited drivers).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Quick Switch:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => handleSelectPlan('starter')}
                className={cn(
                  "px-2.5 py-1 rounded-md font-semibold transition-all",
                  isStarter ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Starter
              </button>
              <button
                type="button"
                onClick={() => handleSelectPlan('fleetPro')}
                className={cn(
                  "px-2.5 py-1 rounded-md font-semibold transition-all",
                  !isStarter ? "bg-blue-600 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Fleet Pro
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <BillingIntervalToggle value={interval} onChange={setInterval_} />
          <p className="text-xs text-slate-500 text-center">
            Same features on every billing period — prepaying just lowers your monthly rate. Annual saves 20%, 6-Month saves 10%.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PLANS.map((plan) => {
            const isHighlighted = plan.popular;
            const isCurrent = plan.id === committedTier;
            // Same plan AND same billing period → nothing to change. Same plan, different period → offer the switch.
            const isExact = isCurrent && interval === committedInterval;

            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative rounded-2xl transition-all duration-200 bg-white flex flex-col justify-between",
                  isCurrent
                    ? "border-2 border-emerald-500 shadow-md ring-4 ring-emerald-50"
                    : (isHighlighted
                        ? "border-2 border-blue-500 shadow-md ring-4 ring-blue-50"
                        : "border border-slate-200 shadow-xs hover:border-slate-300")
                )}
              >
                {/* Active or Popular Pill */}
                {isCurrent ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white font-bold text-[10px] tracking-wider uppercase px-3 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Active Plan
                  </div>
                ) : (isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white font-bold text-[10px] tracking-wider uppercase px-3 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-300" />
                    {plan.badge}
                  </div>
                ))}

                <div>
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg font-bold text-slate-900 font-headline flex items-center gap-2">
                        {plan.name}
                        {isCurrent && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                            Active
                          </Badge>
                        )}
                      </CardTitle>
                      <Badge variant="outline" className="text-[11px] font-semibold text-slate-600 border-slate-200">
                        {plan.truckCapacity}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-slate-500 mt-1 min-h-[32px]">
                      {plan.tagline}
                    </CardDescription>

                    {/* Price */}
                    <PlanPriceBlock tier={plan.id} interval={interval} />
                  </CardHeader>

                  <CardContent className="p-5 pt-2 space-y-4">
                    <Separator />

                    {/* Feature Checklist */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Included Features
                      </span>
                      <ul className="space-y-2">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                            <CheckCircle2 className={cn(
                              "h-4 w-4 shrink-0 mt-0.5",
                              isCurrent ? "text-emerald-600" : (isHighlighted ? "text-blue-600" : "text-slate-400")
                            )} />
                            <span className={i === 0 && isHighlighted ? "font-bold text-slate-900" : ""}>
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </div>

                {/* Footer Action */}
                <div className="p-5 pt-0">
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isRedirecting}
                    variant={isExact ? "outline" : "default"}
                    className={cn(
                      "w-full h-10 font-bold text-xs shadow-xs rounded-xl flex items-center justify-center gap-1.5 transition-all",
                      isExact
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 cursor-default"
                        : (plan.id === 'fleetPro'
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-slate-900 hover:bg-slate-800 text-white")
                    )}
                  >
                    {isExact ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {onTrialTrack ? 'Selected · Starts After Trial' : 'Current Active Plan'}
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        {isCurrent
                          ? `Switch to ${intervalLabel(interval)} billing (${ctaPrice(plan.id)})`
                          : onTrialTrack
                            ? `Choose ${planName(plan.id)} (${ctaPrice(plan.id)})`
                            : plan.id === 'fleetPro'
                              ? `Upgrade to Fleet Pro (${ctaPrice(plan.id)})`
                              : `Switch to Starter (${ctaPrice(plan.id)})`}
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Feature Comparison Matrix ─────────────────────────────────── */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
        <CardHeader className="p-5 pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">Plan Feature Comparison</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Compare key capabilities between Starter and Fleet Pro to choose the right fit for your business.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5">Capability / Feature</th>
                <th className="p-3.5 text-center w-40">Starter ({formatUsd(getPlanPrice('starter', interval).effectiveMonthlyCents)}/mo)</th>
                <th className="p-3.5 text-center w-44 bg-blue-50/40 text-blue-900 font-bold">Fleet Pro ({formatUsd(getPlanPrice('fleetPro', interval).effectiveMonthlyCents)}/mo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FEATURE_MATRIX.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 pl-5 font-medium text-slate-800">{row.feature}</td>
                  <td className="p-3.5 text-center text-slate-600">{row.starter}</td>
                  <td className="p-3.5 text-center font-semibold text-blue-700 bg-blue-50/20">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Security, Guarantees & FAQ ───────────────────────────────── */}
      <Card className="border border-slate-200 shadow-sm bg-slate-50/80 rounded-2xl">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
            <h3 className="text-sm font-bold text-slate-800">Clear Pricing &amp; Cancellation Policies</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
            <div className="space-y-1">
              <span className="font-bold text-slate-800 block">No Long-Term Contracts</span>
              <p className="leading-relaxed text-slate-500">
                Cancel or pause your subscription anytime with zero penalties or hidden termination fees.
              </p>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-slate-800 block">Unlimited Trailers &amp; Rates</span>
              <p className="leading-relaxed text-slate-500">
                You never pay extra for additional trailers, rate calculators, client profiles, or saved documents.
              </p>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-slate-800 block">Enterprise-Grade Security</span>
              <p className="leading-relaxed text-slate-500">
                All billing is handled via Stripe PCI Level 1 certified vault. Your sensitive payment details never touch our servers.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">Legal:</span>
              <Link href="/terms-of-service" target="_blank" className="text-blue-600 hover:underline font-medium">
                Terms of Service
              </Link>
              <span className="text-slate-300">·</span>
              <Link href="/privacy-policy" target="_blank" className="text-blue-600 hover:underline font-medium">
                Privacy Policy
              </Link>
            </div>
            <div>
              Billing questions or assistance? Contact{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline font-semibold">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
