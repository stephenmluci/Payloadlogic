'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  CheckCircle2,
  Circle,
  Truck,
  Users,
  TrendingUp,
  Building2,
  Package,
  ArrowRight,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinancialSetupReminders, useFinancialSetupAudit } from '@/components/onboarding/FinancialSetupReminders';

export function FirstRunSetupGuide() {
  const {
    user,
    vehicles,
    driverProfiles,
    settings,
    clients,
    loads,
    hasActiveTruck,
    hasActiveDriver,
    hasTargetDailyProfit,
    isFinancialProfileComplete,
    setActiveTab,
    setFleetSubTab,
    openFleetFinancialSetup,
  } = useApp();

  const storageKey = `first_run_guide_dismissed:${user?.uid ?? 'anon'}`;
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  // Evaluate the 5 core setup steps
  const stepTruckDone = vehicles.some(v => v.type === 'truck');
  const stepDriverDone = driverProfiles.length > 0;
  const stepProfitDone = Boolean(hasTargetDailyProfit || (settings?.targetDailyBusinessProfit && settings.targetDailyBusinessProfit > 0));
  const stepClientDone = clients.length > 0;
  const stepLoadDone = loads.length > 0;

  const steps = [
    {
      id: 'truck',
      title: 'Add your first truck',
      description: 'Register a power unit with monthly loan & insurance.',
      isDone: stepTruckDone,
      icon: Truck,
      actionLabel: 'Add Truck',
      action: () => {
        setActiveTab('drivers');
        setFleetSubTab('vehicles');
      },
    },
    {
      id: 'driver',
      title: 'Add your first driver',
      description: 'Set up driver profile and pay model (% or per-mile).',
      isDone: stepDriverDone,
      icon: Users,
      actionLabel: 'Add Driver',
      action: () => {
        setActiveTab('drivers');
        setFleetSubTab('drivers');
      },
    },
    {
      id: 'profit',
      title: 'Set target daily profit goal',
      description: 'Calibrate business daily net profit (default: $300/day).',
      isDone: stepProfitDone,
      icon: TrendingUp,
      actionLabel: 'Set Profit Target',
      action: () => {
        openFleetFinancialSetup();
      },
    },
    {
      id: 'client',
      title: 'Add a client (shipper/broker)',
      description: 'Save frequent customers for 1-click load booking.',
      isDone: stepClientDone,
      icon: Building2,
      actionLabel: 'Add Client',
      action: () => {
        setActiveTab('clients');
      },
    },
    {
      id: 'load',
      title: 'Create your first load',
      description: 'Calculate rate margins and generate instant digital BOLs.',
      isDone: stepLoadDone,
      icon: Package,
      actionLabel: 'Create Load',
      action: () => {
        setActiveTab('loads');
      },
    },
  ];

  const completedCount = steps.filter(s => s.isDone).length;
  const totalSteps = steps.length;
  const isAllComplete = completedCount === totalSteps;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const {
    isAllFinancialsComplete,
    completedCount: finCompletedCount,
    totalCount: finTotalCount,
    missingItems: finMissingItems,
  } = useFinancialSetupAudit();

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {}
  };

  const handleResume = () => {
    setDismissed(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  };

  if (dismissed === null) return null;

  // ── State 1: All 5 core steps completed ─────────────────────────────────────
  if (isAllComplete) {
    return (
      <div className="space-y-4">
        {dismissed ? (
          <button
            type="button"
            onClick={openFleetFinancialSetup}
            className={cn(
              "inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              isAllFinancialsComplete
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            )}
            title="Review your fleet financial setup"
          >
            {isAllFinancialsComplete ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Setup complete (5/5) &amp; Profit Engine Calibrated · Review setup
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Core steps done (5/5) · {finMissingItems.length} financial item(s) still needed for accurate profit · Review setup
              </>
            )}
          </button>
        ) : (
          <div
            className={cn(
              "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-5 py-4 shadow-xs",
              isAllFinancialsComplete
                ? "border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-white"
                : "border-amber-200 bg-gradient-to-r from-amber-50/80 via-emerald-50/40 to-white"
            )}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                  isAllFinancialsComplete
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                )}
              >
                {isAllFinancialsComplete ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-sm font-headline">
                    {isAllFinancialsComplete
                      ? 'Setup Complete · All Core & Financial Inputs Verified!'
                      : 'Core Setup Steps Done · Financial Inputs Incomplete'}
                  </span>
                  <Badge className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5">
                    5 of 5 Core Steps
                  </Badge>
                  {!isAllFinancialsComplete && (
                    <Badge className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5">
                      {finCompletedCount} of {finTotalCount} Profit Inputs
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isAllFinancialsComplete
                    ? 'Your fleet is configured, profit target calibrated, and net profit calculations are fully accurate.'
                    : `Your basic fleet is active, but ${finMissingItems.length} financial item(s) below are still missing for true net profit accuracy.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={openFleetFinancialSetup}
                className="text-xs h-8 font-semibold border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              >
                Review Setup
              </Button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss banner"
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Always show "Don't Forget These for Accurate Profit Numbers" if any financial items are missing */}
        <FinancialSetupReminders variant="dashboard" />
      </div>
    );
  }

  // ── State 2: Setup in progress but user dismissed/skipped ────────────────────
  if (dismissed) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 px-4 rounded-xl border border-blue-200/80 bg-blue-50/70 text-xs text-blue-950 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              <strong>First-Run Setup Guide:</strong> {completedCount} of {totalSteps} core steps complete ({progressPercent}%)
              {!isAllFinancialsComplete && (
                <span className="text-amber-800 font-semibold ml-1.5">
                  • Profit Engine Inputs: {finCompletedCount} of {finTotalCount} configured
                </span>
              )}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResume}
            className="h-7 text-xs font-semibold border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0 self-start sm:self-center"
          >
            Resume Setup
          </Button>
        </div>

        <FinancialSetupReminders variant="dashboard" />
      </div>
    );
  }

  // ── State 3: Persistent First-Run Setup Checklist (In Progress) ─────────────
  return (
    <div className="space-y-4">
      <Card className="border border-slate-200/90 shadow-sm bg-white rounded-2xl overflow-hidden">
      {/* Top Header */}
      <div className="p-5 pb-4 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base font-headline">Welcome to PayloadLogic · First-Run Guide</span>
              <Badge className="bg-blue-500/30 text-blue-200 border border-blue-400/30 text-[10px] font-bold">
                {completedCount} of {totalSteps} Complete
              </Badge>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Complete these 5 quick steps to configure your fleet and create your first profitable load.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="self-end sm:self-center text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1 p-1 hover:bg-white/10 rounded-lg transition-colors"
          title="Hide setup guide for now"
        >
          <span>Skip for now</span>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress Bar Strip */}
      <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 5-Step List */}
      <div className="p-4 sm:p-5 divide-y divide-slate-100">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={cn(
                "py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0 transition-colors",
                step.isDone ? "opacity-75" : "hover:bg-slate-50/50 -mx-2 px-2 rounded-xl"
              )}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {step.isDone ? (
                    <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold font-headline",
                      step.isDone ? "text-slate-600 line-through decoration-slate-400" : "text-slate-900"
                    )}>
                      {step.title}
                    </span>
                    {step.isDone && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{step.description}</p>
                </div>
              </div>

              <div className="shrink-0 sm:self-center pl-10 sm:pl-0">
                {step.isDone ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={step.action}
                    className="text-xs h-7 text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium px-2.5"
                  >
                    Edit / View
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={step.action}
                    className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 shadow-xs px-3"
                  >
                    <span>{step.actionLabel}</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </Card>

      {/* Crucial Financial Reminders Checklist */}
      <FinancialSetupReminders variant="dashboard" />
    </div>
  );
}
