'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Clock, Lock, ArrowRight, X, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { TRIAL_MESSAGES } from '@/lib/trial';

/** Slim, non-intrusive trial bar shown at the top of the app while the free trial is active. */
export function TrialBanner() {
  const { trial, setActiveTab } = useApp();
  const [dismissed, setDismissed] = React.useState(false);

  if (trial.phase !== 'active') return null;
  // Always visible in the final 3 days; otherwise the user can dismiss it for the session.
  const urgent = trial.daysRemaining <= 3;
  if (dismissed && !urgent) return null;

  const label = trial.daysRemaining === 1 ? '1 day left' : `${trial.daysRemaining} days left`;

  return (
    <div
      className={`w-full px-3 sm:px-6 py-2 flex items-center gap-3 text-xs border-b ${
        urgent ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-100 text-blue-900'
      }`}
      role="status"
    >
      <Sparkles className={`h-3.5 w-3.5 shrink-0 ${urgent ? 'text-amber-600' : 'text-blue-600'}`} />
      <p className="flex-1 min-w-0">
        <span className="font-semibold">Free trial · {label}</span>
        <span className="hidden sm:inline"> — you have full Fleet Pro access while you evaluate PayloadLogic.</span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setActiveTab('billing')}
        className="h-7 px-2 text-xs font-semibold gap-1 hover:bg-white/60"
      >
        Choose a plan <ArrowRight className="h-3 w-3" />
      </Button>
      {!urgent && (
        <button
          type="button"
          aria-label="Dismiss trial banner"
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-white/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Shown in place of any page except Billing once the trial has ended without a plan being chosen. */
export function TrialExpiredNotice() {
  const { trial, setActiveTab } = useApp();
  const deniedForDot = trial.trialDeniedForDot;
  const notActivated = trial.phase === 'pending';

  return (
    <div className="max-w-xl mx-auto mt-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-sm">
      <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
        {notActivated ? <Clock className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
      </div>
      <h2 className="text-xl font-bold text-slate-900 font-headline">
        {notActivated ? 'Finishing your account setup' : TRIAL_MESSAGES.trialExpired}
      </h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        {notActivated
          ? "We couldn't activate your free trial yet. Check your connection and refresh, or choose a plan to get started right away."
          : deniedForDot
            ? `${TRIAL_MESSAGES.dotAlreadyUsed} Pick Starter or Fleet Pro to start using PayloadLogic.`
            : 'Your 14-day free trial has ended. Your loads, drivers, and clients are safe — pick Starter or Fleet Pro to pick up right where you left off.'}
      </p>
      <Button onClick={() => setActiveTab('billing')} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5">
        Choose a plan <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
