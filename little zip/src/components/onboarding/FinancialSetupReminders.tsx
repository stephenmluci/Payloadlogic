'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Truck,
  Users,
  Receipt,
  TrendingUp,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FinancialAuditItem {
  id: 'expenses' | 'equipment_costs' | 'driver_pay' | 'monthly_overhead' | 'profit_benchmarks';
  title: string;
  shortLabel: string;
  description: string;
  impactWarning: string;
  completedSummary: string;
  actionLabel: string;
  isComplete: boolean;
  icon: React.ElementType;
  onNavigate: () => void;
}

export function useFinancialSetupAudit(onAfterNavigate?: () => void) {
  const {
    user,
    vehicles,
    driverProfiles,
    settings,
    expenses,
    hasTargetDailyProfit,
    setActiveTab,
    setFleetSubTab,
    setSettingsSubTab,
  } = useApp();

  const deferredStorageKey = `financial_reminders_deferred_v1:${user?.uid ?? 'anon'}`;
  const [deferredIds, setDeferredIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(deferredStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setDeferredIds(parsed);
      } else {
        setDeferredIds([]);
      }
    } catch {
      setDeferredIds([]);
    }
  }, [deferredStorageKey]);

  const deferItem = (id: string) => {
    setDeferredIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try {
        localStorage.setItem(deferredStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const restoreItem = (id: string) => {
    setDeferredIds((prev) => {
      const next = prev.filter((item) => item !== id);
      try {
        localStorage.setItem(deferredStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const restoreAllDeferred = () => {
    setDeferredIds([]);
    try {
      localStorage.removeItem(deferredStorageKey);
    } catch {}
  };

  const items: FinancialAuditItem[] = useMemo(() => {
    // 1. Recurring or One-Time Operational Expenses (fuel, maintenance, repairs, tolls)
    const trucks = vehicles.filter((v) => v.type === 'truck');
    const trailers = vehicles.filter((v) => v.type === 'trailer');

    const hasLoggedExpenses = expenses.length > 0;
    const hasMaintenanceReserve =
      (settings?.monthlyMaintenance || 0) > 0 ||
      trucks.some((t) => (t.monthlyRecurringExpenses?.maintenanceFund || 0) > 0);
    const expensesComplete = hasLoggedExpenses || hasMaintenanceReserve;

    // 2. Truck & Trailer Payments & Commercial Insurance
    const trucksWithCosts = trucks.filter(
      (v) =>
        (v.monthlyRecurringExpenses?.insurance || 0) > 0 &&
        ((v.monthlyRecurringExpenses?.payment || 0) > 0 || Boolean(v.isPaidOff))
    );
    const trailersMissingCosts =
      trailers.length > 0 &&
      trailers.every(
        (tr) =>
          (tr.monthlyRecurringExpenses?.payment || 0) === 0 &&
          (tr.monthlyRecurringExpenses?.insurance || 0) === 0 &&
          !tr.isPaidOff
      );
    const equipmentCostsComplete =
      trucks.length > 0 && trucksWithCosts.length > 0 && !trailersMissingCosts;

    // 3. Driver Pay Rates & Payroll Setup
    const driversWithPay = driverProfiles.filter(
      (d) =>
        (d.payRate !== undefined && Number(d.payRate) > 0) ||
        (d.payPercentageOfGross !== undefined && Number(d.payPercentageOfGross) > 0) ||
        (d.payrollPercentage !== undefined && Number(d.payrollPercentage) > 0)
    );
    const hasGlobalDriverPay =
      (settings?.payrollPercentage || 0) > 0 ||
      (settings?.defaultDriverHourlyRate || 0) > 0;
    const driverPayComplete = driversWithPay.length > 0 || hasGlobalDriverPay;

    // 4. Fixed Overhead / Monthly Costs
    const activeRecurringOverhead = (settings?.recurringExpenses || []).filter(
      (e) => Number(e.amount) > 0
    );
    const hasCompanyMonthlyOverhead = activeRecurringOverhead.length > 0;

    // 5. Profit Engine Benchmarks (Daily Profit Goal, Fuel Price/Gal, Operating Cost/Mile)
    const hasProfitGoal = Boolean(
      hasTargetDailyProfit || (settings?.targetDailyBusinessProfit && settings.targetDailyBusinessProfit > 0)
    );
    const hasFuelBenchmark = (settings?.defaultFuelCostPerGallon || 0) > 0;
    const hasCpmBenchmark = (settings?.defaultOperatingCostPerMile || 0) > 0;
    const profitBenchmarksComplete = hasProfitGoal && hasFuelBenchmark && hasCpmBenchmark;

    const missingBenchmarkParts: string[] = [];
    if (!hasProfitGoal) missingBenchmarkParts.push('daily profit goal');
    if (!hasFuelBenchmark) missingBenchmarkParts.push('default diesel price/gal');
    if (!hasCpmBenchmark) missingBenchmarkParts.push('operating cost/mile');

    return [
      {
        id: 'expenses',
        title: 'Recurring or One-Time Expenses (Fuel, Maintenance, Repairs)',
        shortLabel: 'Operational Expenses',
        description:
          'Log initial fuel, maintenance reserves, tolls, or one-time bills so net profit reflects real cash flow.',
        impactWarning:
          'Affects Profit Accuracy: Leaving expenses blank means net profit will not deduct fuel receipts, maintenance, or upcoming bill payments.',
        completedSummary: `${expenses.length} expense record(s) logged${
          hasMaintenanceReserve ? ' • Maintenance reserve active' : ''
        }`,
        actionLabel: 'Add Expenses',
        isComplete: expensesComplete,
        icon: Receipt,
        onNavigate: () => {
          setActiveTab('expenses');
          onAfterNavigate?.();
        },
      },
      {
        id: 'driver_pay',
        title: 'Driver Pay Rates & Payroll Setup',
        shortLabel: 'Driver Pay',
        description:
          'Configure driver compensation (% of gross, per-mile, or hourly rate) for accurate per-load payroll deductions.',
        impactWarning:
          'Affects Profit Accuracy: Without driver pay rates, the profit engine assumes $0 driver labor cost and overstates net margin.',
        completedSummary:
          driversWithPay.length > 0
            ? `${driversWithPay.length} driver pay profile(s) configured`
            : `Default payroll (${settings?.payrollPercentage || 0}%) configured`,
        actionLabel: 'Set Driver Pay',
        isComplete: driverPayComplete,
        icon: Users,
        onNavigate: () => {
          setActiveTab('drivers');
          setFleetSubTab('drivers');
          onAfterNavigate?.();
        },
      },
      {
        id: 'monthly_overhead',
        title: 'Fixed Overhead & Monthly Costs',
        shortLabel: 'Monthly Overhead',
        description:
          'Enter fixed monthly business costs (ELD subscriptions, dispatch software, permits, yard rent, accounting).',
        impactWarning:
          'Affects Profit Accuracy: Unrecorded monthly overhead understates your true daily break-even rate and fixed payment obligations.',
        completedSummary: `${activeRecurringOverhead.length} recurring monthly overhead item(s) active`,
        actionLabel: 'Enter Monthly Overhead',
        isComplete: hasCompanyMonthlyOverhead,
        icon: DollarSign,
        onNavigate: () => {
          setActiveTab('settings');
          setSettingsSubTab('recurring');
          onAfterNavigate?.();
        },
      },
      {
        id: 'equipment_costs',
        title: 'Truck & Trailer Payments & Commercial Insurance',
        shortLabel: 'Truck & Trailer Payments',
        description:
          'Set monthly truck loan/lease payments, trailer payments, and commercial insurance premiums on your equipment.',
        impactWarning:
          trucks.length === 0
            ? 'Affects Profit Accuracy: No truck added yet — monthly loan payments and insurance cannot be prorated across your loads.'
            : trailersMissingCosts
            ? 'Affects Profit Accuracy: Trailer payment/insurance is still blank (or mark trailer as Paid Off).'
            : 'Affects Profit Accuracy: Truck loan payment and commercial insurance must both be entered (or marked Paid Off) so you don’t miss fixed equipment costs.',
        completedSummary: `${trucksWithCosts.length} truck(s)${
          trailers.length > 0 ? ` & ${trailers.length} trailer(s)` : ''
        } verified with payment & insurance`,
        actionLabel: 'Set Equipment Payments',
        isComplete: equipmentCostsComplete,
        icon: Truck,
        onNavigate: () => {
          setActiveTab('drivers');
          setFleetSubTab('vehicles');
          onAfterNavigate?.();
        },
      },
      {
        id: 'profit_benchmarks',
        title: 'Profit Engine Benchmarks (Daily Goal, Fuel & Cost/Mile)',
        shortLabel: 'Profit & Fuel Benchmarks',
        description:
          'Calibrate target daily profit, default diesel price ($/gal), and baseline wear-and-tear operating cost per mile.',
        impactWarning: `Affects Profit Accuracy: Still missing ${
          missingBenchmarkParts.join(', ') || 'benchmarks'
        } — required by the profit engine to calculate true net profit per load.`,
        completedSummary: `Goal: $${settings?.targetDailyBusinessProfit || 0}/day • Fuel: $${
          settings?.defaultFuelCostPerGallon || 0
        }/gal • CPM: $${settings?.defaultOperatingCostPerMile || 0}/mi`,
        actionLabel: 'Calibrate Profit Engine',
        isComplete: profitBenchmarksComplete,
        icon: TrendingUp,
        onNavigate: () => {
          setActiveTab('settings');
          setSettingsSubTab('financials');
          onAfterNavigate?.();
        },
      },
    ];
  }, [
    vehicles,
    driverProfiles,
    settings,
    expenses,
    hasTargetDailyProfit,
    setActiveTab,
    setFleetSubTab,
    setSettingsSubTab,
    onAfterNavigate,
  ]);

  const completedItems = items.filter((i) => i.isComplete);
  const missingItems = items.filter((i) => !i.isComplete);
  const activeMissingItems = missingItems.filter((i) => !deferredIds.includes(i.id));
  const deferredMissingItems = missingItems.filter((i) => deferredIds.includes(i.id));
  const isAllFinancialsComplete = missingItems.length === 0;

  return {
    items,
    completedItems,
    missingItems,
    activeMissingItems,
    deferredMissingItems,
    deferredIds,
    deferItem,
    restoreItem,
    restoreAllDeferred,
    isAllFinancialsComplete,
    completedCount: completedItems.length,
    totalCount: items.length,
  };
}

interface FinancialSetupRemindersProps {
  variant?: 'dashboard' | 'modal' | 'wizard';
  onAfterNavigate?: () => void;
  className?: string;
}

export function FinancialSetupReminders({
  variant = 'dashboard',
  onAfterNavigate,
  className,
}: FinancialSetupRemindersProps) {
  const {
    items,
    completedItems,
    missingItems,
    activeMissingItems,
    deferredMissingItems,
    deferItem,
    restoreItem,
    restoreAllDeferred,
    isAllFinancialsComplete,
    completedCount,
    totalCount,
  } = useFinancialSetupAudit(onAfterNavigate);

  const [showDeferred, setShowDeferred] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // If every single critical financial item is genuinely entered, show a compact honest verification badge
  if (isAllFinancialsComplete) {
    if (variant === 'dashboard') {
      return null;
    }
    return (
      <div
        className={cn(
          'rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center justify-between gap-3',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-emerald-950">
              All {totalCount} Profit Engine Financial Inputs Verified
            </h4>
            <p className="text-[11px] text-emerald-800">
              Equipment payments, driver payroll, monthly overhead, expenses, and fuel/CPM benchmarks are calibrated.
            </p>
          </div>
        </div>
        <Badge className="bg-emerald-600 text-white text-[10px] font-bold shrink-0">
          100% Calibrated
        </Badge>
      </div>
    );
  }

  // Wizard preview mode (dark theme inside OnboardingWizard Step 3)
  if (variant === 'wizard') {
    return (
      <div
        className={cn(
          'w-full rounded-xl border border-blue-500/30 bg-slate-900/90 p-4 sm:p-5 text-left shadow-lg',
          className
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
              <Calculator className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm tracking-tight">
                Don’t Forget These for Accurate Profit Numbers
              </h4>
              <p className="text-[11px] text-slate-400">
                You can enter your dashboard right away — we’ll remind you to fill in these {missingItems.length} financial items when you’re ready:
              </p>
            </div>
          </div>
          <Badge className="self-start sm:self-center bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold shrink-0">
            {completedCount} of {totalCount} Configured
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {missingItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="flex items-start gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5"
              >
                <Icon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white leading-tight">{item.shortLabel}</p>
                  <p className="text-[10px] text-slate-400 leading-snug mt-0.5 line-clamp-2">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-amber-200/90 bg-gradient-to-b from-amber-50/70 via-white to-white shadow-xs overflow-hidden',
        className
      )}
    >
      {/* Header Banner */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-white border-b border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-100 border border-amber-300/70 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base font-headline">
                Don’t Forget These for Accurate Profit Numbers
              </h3>
              <Badge
                variant="outline"
                className="bg-amber-100/90 text-amber-900 border-amber-300 text-[10px] font-bold px-2 py-0.5"
              >
                Profit Accuracy: {completedCount} of {totalCount} Complete
              </Badge>
              {deferredMissingItems.length > 0 && (
                <Badge
                  variant="outline"
                  className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-semibold px-2 py-0.5"
                >
                  {deferredMissingItems.length} Marked for Later
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              You can use PayloadLogic right away, but leaving these financial items blank means net profit calculations and payment tracking will only be partial estimates until completed.
            </p>
          </div>
        </div>
      </div>

      {/* Active Missing Reminders List */}
      {activeMissingItems.length > 0 ? (
        <div className="p-4 sm:p-5 divide-y divide-slate-100">
          {activeMissingItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="py-3.5 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-amber-100/80 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        Missing
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                    <p className="text-[11px] font-medium text-amber-800 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{item.impactWarning}</span>
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 pl-11 lg:pl-0">
                  <Button
                    type="button"
                    size="sm"
                    onClick={item.onNavigate}
                    className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-2xs"
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deferItem(item.id)}
                    className="h-8 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  >
                    I’ll add this later
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Honest state when all remaining missing items were marked "I'll add this later" */
        <div className="p-4 sm:p-5 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-950">
            <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Setup Status: Incomplete ({completedCount} of {totalCount} configured).</strong>{' '}
              You marked {deferredMissingItems.length} financial item{deferredMissingItems.length === 1 ? '' : 's'} for later — net profit numbers remain estimated until those inputs are entered.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowDeferred((prev) => !prev)}
            className="h-8 text-xs font-semibold border-amber-300 text-amber-900 hover:bg-amber-100 shrink-0 self-start sm:self-center"
          >
            {showDeferred ? 'Hide Deferred Items' : `Review ${deferredMissingItems.length} Deferred Item(s)`}
          </Button>
        </div>
      )}

      {/* Footer for Deferred & Completed Items */}
      {(deferredMissingItems.length > 0 || completedItems.length > 0) && (
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50/90 border-t border-slate-200/70 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {deferredMissingItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDeferred((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-950 font-semibold"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {deferredMissingItems.length} marked “I’ll add this later” (still needed for true net profit)
                  </span>
                  {showDeferred ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}

              {completedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCompleted((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{completedItems.length} completed</span>
                  {showCompleted ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>

            {deferredMissingItems.length > 0 && (
              <button
                type="button"
                onClick={restoreAllDeferred}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
              >
                <RotateCcw className="h-3 w-3" />
                Restore all reminders
              </button>
            )}
          </div>

          {/* Expandable Deferred Items List */}
          {showDeferred && deferredMissingItems.length > 0 && (
            <div className="pt-2 pb-1 space-y-2 border-t border-slate-200/70">
              {deferredMissingItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-white border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Icon className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">{item.title}</span>
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">
                            Deferred — Still Needed
                          </Badge>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5">{item.impactWarning}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <Button
                        type="button"
                        size="sm"
                        onClick={item.onNavigate}
                        className="h-7 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1"
                      >
                        <span>{item.actionLabel}</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => restoreItem(item.id)}
                        className="h-7 text-xs text-slate-600 hover:text-slate-900"
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Expandable Completed Items List */}
          {showCompleted && completedItems.length > 0 && (
            <div className="pt-2 pb-1 space-y-1.5 border-t border-slate-200/70">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-slate-800 truncate">{item.shortLabel}:</span>
                    <span className="text-emerald-800 truncate">{item.completedSummary}</span>
                  </div>
                  <button
                    type="button"
                    onClick={item.onNavigate}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
