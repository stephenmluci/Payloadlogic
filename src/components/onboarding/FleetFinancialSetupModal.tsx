'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Truck,
  Users,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FinancialSetupReminders, useFinancialSetupAudit } from '@/components/onboarding/FinancialSetupReminders';

type FleetFinancialSetupModalProps = {
  isOpen: boolean;
  isMandatory?: boolean;
  onClose?: () => void;
};

export function FleetFinancialSetupModal({
  isOpen,
  isMandatory = false,
  onClose,
}: FleetFinancialSetupModalProps) {
  const {
    vehicles,
    driverProfiles,
    settings,
    hasActiveTruck,
    hasActiveDriver,
    hasTargetDailyProfit,
    isFinancialProfileComplete,
    setActiveTab,
    setFleetSubTab,
    saveTargetDailyProfit,
    setIsFleetFinancialModalOpen,
    isSubmitting,
  } = useApp();

  const { toast } = useToast();

  const [profitGoalInput, setProfitGoalInput] = useState<string>('');
  const [profitError, setProfitError] = useState<string>('');

  useEffect(() => {
    if (settings?.targetDailyBusinessProfit && settings.targetDailyBusinessProfit > 0) {
      setProfitGoalInput(settings.targetDailyBusinessProfit.toString());
    }
  }, [settings?.targetDailyBusinessProfit]);

  const trucks = vehicles.filter(v => v.type === 'truck');
  const validTrucks = trucks.filter(v => 
    ((v.monthlyRecurringExpenses?.insurance || 0) > 0 || (v.monthlyRecurringExpenses?.payment || 0) > 0 || v.isPaidOff)
  );

  const validDrivers = driverProfiles.filter(d => 
    (d.payRate !== undefined && Number(d.payRate) > 0) ||
    (d.payPercentageOfGross !== undefined && Number(d.payPercentageOfGross) > 0) ||
    (d.payrollPercentage !== undefined && Number(d.payrollPercentage) > 0)
  );

  const completedCount = (hasActiveTruck ? 1 : 0) + (hasActiveDriver ? 1 : 0) + (hasTargetDailyProfit ? 1 : 0);
  const progressPercent = Math.round((completedCount / 3) * 100);

  const handleRouteToTrucks = () => {
    setActiveTab('drivers');
    setFleetSubTab('vehicles');
    if (onClose) onClose();
    else setIsFleetFinancialModalOpen(false);
  };

  const handleRouteToDrivers = () => {
    setActiveTab('drivers');
    setFleetSubTab('drivers');
    if (onClose) onClose();
    else setIsFleetFinancialModalOpen(false);
  };

  const handleRouteToSettings = () => {
    setActiveTab('settings');
    if (onClose) onClose();
    else setIsFleetFinancialModalOpen(false);
  };

  const handleSaveProfitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(profitGoalInput);
    if (isNaN(val) || val <= 0) {
      setProfitError('Please enter a valid daily profit goal greater than $0.');
      return;
    }
    setProfitError('');
    try {
      await saveTargetDailyProfit(val);
      toast({
        title: 'Profit Goal Saved',
        description: `Target Daily Business Profit updated to $${val.toFixed(2)}/day.`,
      });
    } catch {
      // Error handled in AppContext
    }
  };

  const handleDismiss = () => {
    if (onClose) onClose();
    else setIsFleetFinancialModalOpen(false);
  };

  const {
    isAllFinancialsComplete,
    completedCount: finCompletedCount,
    totalCount: finTotalCount,
  } = useFinancialSetupAudit(handleDismiss);

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          handleDismiss();
        }
      }}
    >
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-0 shadow-2xl rounded-2xl bg-white"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-7 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-start justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl border shadow-inner ${isFinancialProfileComplete ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400' : 'bg-blue-500/20 border-blue-400/30 text-blue-400'}`}>
                {isFinancialProfileComplete ? (
                  <Unlock className="h-6 w-6" />
                ) : (
                  <Lock className="h-6 w-6" />
                )}
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Fleet Financial Security Gate
                </DialogTitle>
                <DialogDescription className="text-blue-200/80 text-xs sm:text-sm mt-1">
                  Required baseline setup for Rate Engine &amp; Projected Financials
                </DialogDescription>
              </div>
            </div>

            <Badge 
              variant="outline" 
              className={`shrink-0 text-xs font-bold px-2.5 py-1 ${
                isFinancialProfileComplete 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-400/50'
              }`}
            >
              {completedCount} of 3 Complete
            </Badge>
          </div>

          {/* Progress Bar */}
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-[11px] text-blue-200/90 font-medium">
              <span>Setup Verification Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isFinancialProfileComplete ? 'bg-emerald-500 shadow-sm shadow-emerald-400/50' : 'bg-blue-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-7 space-y-5">
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            To prevent non-carriers from exploiting rate calculations and guarantee multi-truck financial accuracy, all rate projections remain locked until your baseline operating profile is verified.
          </p>

          {/* Checklist Container */}
          <div className="space-y-4">
            {/* ── Requirement 1: Active Truck Profile ── */}
            <div className={`p-4 rounded-xl border-2 transition-all ${
              hasActiveTruck 
                ? 'bg-emerald-50/60 border-emerald-200' 
                : 'bg-white border-slate-200 hover:border-amber-300'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    hasActiveTruck ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {hasActiveTruck ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Truck className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-900">
                        1. Active Truck Profile
                      </h4>
                      <Badge 
                        variant="secondary" 
                        className={`text-[10px] font-bold h-5 ${
                          hasActiveTruck ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {hasActiveTruck ? 'Verified' : 'Required'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {hasActiveTruck ? (
                        <span className="text-emerald-800 font-medium">
                          Active truck verified: #{validTrucks[0]?.unitNumber || validTrucks[0]?.name}
                          {validTrucks[0]?.monthlyRecurringExpenses?.insurance ? ` • Insurance: $${validTrucks[0].monthlyRecurringExpenses.insurance}/mo` : ''}
                          {validTrucks[0]?.isPaidOff ? ' • Paid Off' : validTrucks[0]?.monthlyRecurringExpenses?.payment ? ` • Payment: $${validTrucks[0].monthlyRecurringExpenses.payment}/mo` : ''}
                        </span>
                      ) : trucks.length > 0 ? (
                        <span className="text-amber-700">
                          {trucks.length} truck profile(s) found, but monthly payment and insurance data must be set on at least one truck.
                        </span>
                      ) : (
                        'Add at least one truck profile with its specific monthly loan/lease payment and commercial insurance premium.'
                      )}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 self-end sm:self-center">
                  <Button
                    type="button"
                    size="sm"
                    variant={hasActiveTruck ? 'outline' : 'default'}
                    onClick={handleRouteToTrucks}
                    className={`h-8 text-xs font-bold gap-1.5 ${
                      hasActiveTruck 
                        ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-100' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {hasActiveTruck ? 'Manage Trucks' : 'Configure Truck'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Requirement 2: Active Driver Profile ── */}
            <div className={`p-4 rounded-xl border-2 transition-all ${
              hasActiveDriver 
                ? 'bg-emerald-50/60 border-emerald-200' 
                : 'bg-white border-slate-200 hover:border-amber-300'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    hasActiveDriver ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {hasActiveDriver ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-900">
                        2. Active Driver Profile
                      </h4>
                      <Badge 
                        variant="secondary" 
                        className={`text-[10px] font-bold h-5 ${
                          hasActiveDriver ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {hasActiveDriver ? 'Verified' : 'Required'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {hasActiveDriver ? (
                        <span className="text-emerald-800 font-medium">
                          Active driver verified: {validDrivers[0]?.name}
                          {validDrivers[0]?.payType === 'hourly' ? ` • $${validDrivers[0].payRate}/hr` : validDrivers[0]?.payType === 'per-mile' ? ` • $${validDrivers[0].payRate}/mi` : ` • ${validDrivers[0]?.payRate || validDrivers[0]?.payrollPercentage || 0}% of gross`}
                        </span>
                      ) : driverProfiles.length > 0 ? (
                        <span className="text-amber-700">
                          Driver profile found, but compensation/pay rate must be configured.
                        </span>
                      ) : (
                        'Add at least one driver profile with their specific pay compensation model (% of gross, per-mile, or hourly).'
                      )}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 self-end sm:self-center">
                  <Button
                    type="button"
                    size="sm"
                    variant={hasActiveDriver ? 'outline' : 'default'}
                    onClick={handleRouteToDrivers}
                    className={`h-8 text-xs font-bold gap-1.5 ${
                      hasActiveDriver 
                        ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-100' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {hasActiveDriver ? 'Manage Drivers' : 'Configure Driver'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Requirement 3: Target Daily Profit Goal ── */}
            <div className={`p-4 rounded-xl border-2 transition-all ${
              hasTargetDailyProfit 
                ? 'bg-emerald-50/60 border-emerald-200' 
                : 'bg-white border-slate-200 hover:border-amber-300'
            }`}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      hasTargetDailyProfit ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {hasTargetDailyProfit ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <TrendingUp className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-900">
                          3. Target Daily Profit Goal
                        </h4>
                        <Badge 
                          variant="secondary" 
                          className={`text-[10px] font-bold h-5 ${
                            hasTargetDailyProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {hasTargetDailyProfit ? 'Verified' : 'Required'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {hasTargetDailyProfit ? (
                          <span className="text-emerald-800 font-medium">
                            Target profit verified: ${settings.targetDailyBusinessProfit}/day per truck
                          </span>
                        ) : (
                          'Input your business net profit target per day to calculate minimum booking rates.'
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 self-end sm:self-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleRouteToSettings}
                      className="h-8 text-xs font-bold gap-1 text-slate-600 hover:text-slate-900"
                    >
                      <SettingsIcon className="h-3.5 w-3.5" />
                      Settings
                    </Button>
                  </div>
                </div>

                {/* Inline Quick-Save Input for Target Daily Profit */}
                <form onSubmit={handleSaveProfitGoal} className="mt-1 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      min="1"
                      step="5"
                      placeholder="e.g. 350"
                      value={profitGoalInput}
                      onChange={(e) => {
                        setProfitGoalInput(e.target.value);
                        if (profitError) setProfitError('');
                      }}
                      className="pl-8 h-9 text-xs font-bold"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting || !profitGoalInput}
                    className="h-9 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                  >
                    {isSubmitting ? 'Saving…' : hasTargetDailyProfit ? 'Update Goal' : 'Save Goal'}
                  </Button>
                </form>
                {profitError && (
                  <p className="text-[11px] text-red-600 font-medium">{profitError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Crucial Financial Reminders Checklist */}
          <FinancialSetupReminders
            variant="modal"
            onAfterNavigate={handleDismiss}
          />

          {/* Bottom Action / Completion Banner (Non-blocking with honest status) */}
          {isFinancialProfileComplete && isAllFinancialsComplete ? (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-emerald-800 font-black text-sm">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Financial Setup Complete! Full Profit &amp; Rate Engine Calibrated.
              </div>
              <p className="text-xs text-emerald-700">
                Your truck, driver, overhead, expenses, and profit benchmarks are verified for accurate net profit tracking.
              </p>
              <Button
                type="button"
                onClick={handleDismiss}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
              >
                Enter Dispatch Dashboard
              </Button>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    Overall Financial Setup: {finCompletedCount} of {finTotalCount} Profit Inputs Configured
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  You can finish setup now or continue to the dashboard and add remaining financial items later.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                className="h-9 text-xs font-bold border-slate-300 text-slate-800 hover:bg-slate-100 shrink-0"
              >
                Continue to Dashboard (Add Later)
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
