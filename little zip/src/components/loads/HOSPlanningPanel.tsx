'use client';

import React from 'react';
import { calculateHOSPlan, HOS_DISCLAIMER } from '@/lib/hosEngine';
import type { HOSFitness, HOSPlan } from '@/lib/hosEngine';
import { AlertTriangle, Clock, Coffee, Info, ShieldAlert, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Colour mapping per fitness level ──────────────────────────────────────
const FITNESS_CONFIG: Record<
  HOSFitness,
  { bar: string; badge: string; label: string; icon: React.ReactNode }
> = {
  fits_easily: {
    bar:   'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    label: 'Comfortable',
    icon:  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  },
  fits_tight: {
    bar:   'bg-amber-400',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Tight Fit',
    icon:  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  },
  over_limit: {
    bar:   'bg-orange-500',
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    label: 'Multi-Segment',
    icon:  <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />,
  },
  needs_rest_day: {
    bar:   'bg-red-400',
    badge: 'bg-red-50 text-red-800 border-red-200',
    label: 'Multi-Day',
    icon:  <ShieldAlert className="h-3.5 w-3.5 text-red-500" />,
  },
};

// ─── Component props ────────────────────────────────────────────────────────
type HOSPlanningPanelProps = {
  /** Loaded miles (required to generate suggestions). */
  distanceMiles?: number;
  /** From Settings.truckAverageSpeed; falls back to 55. */
  averageSpeedMph?: number;
  /**
   * Optional recent on-duty hours from driver profile (last 8 days).
   * When ≥ 60, a light 70-hr awareness note is shown.
   */
  recentOnDutyHours?: number;
  /** Driver name for display context. */
  driverName?: string;
  /** Whether the panel starts collapsed (default: true). */
  defaultCollapsed?: boolean;
};

/**
 * HOSPlanningPanel
 *
 * Collapsible, suggestions-only panel.
 * Renders scheduling estimates and a mandatory ELD disclaimer.
 * Never blocks form submission or enforces any rule.
 */
export function HOSPlanningPanel({
  distanceMiles,
  averageSpeedMph = 55,
  recentOnDutyHours,
  driverName,
  defaultCollapsed = true,
}: HOSPlanningPanelProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const plan: HOSPlan | null = React.useMemo(
    () => calculateHOSPlan(distanceMiles ?? 0, averageSpeedMph, recentOnDutyHours),
    [distanceMiles, averageSpeedMph, recentOnDutyHours],
  );

  // Don't render at all when there's nothing to show (no distance yet)
  if (!plan) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setCollapsed(c => !c)}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Clock className="h-4 w-4 text-slate-400" />
            HOS Planning Suggestions
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
        {!collapsed && (
          <p className="mt-2 text-xs text-slate-400 italic">
            Enter a distance to generate planning estimates.
          </p>
        )}
      </div>
    );
  }

  const fc = FITNESS_CONFIG[plan.fitness];

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/40 mt-4 overflow-hidden">
      {/* ── Header / Toggle ── */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-blue-50 transition-colors"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock className="h-4 w-4 text-blue-500" />
          HOS Planning Suggestions
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${fc.badge}`}>
            {fc.icon}
            {fc.label}
          </span>
        </span>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronUp   className="h-4 w-4 text-slate-400 shrink-0" />
        }
      </button>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">

          {/* Context line */}
          <p className="text-[11px] text-slate-500 italic -mt-1">
            Estimates for scheduling assistance only.
            {driverName ? ` Showing for: ${driverName}.` : ''}
          </p>

          {/* ── Key metrics ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Est. drive time */}
            <Metric
              icon={<Clock className="h-3.5 w-3.5 text-blue-500" />}
              label="Est. Drive Time"
              value={plan.estimatedDriveDisplay}
            />
            {/* Days estimate */}
            <Metric
              icon={<Info className="h-3.5 w-3.5 text-slate-500" />}
              label="Est. Days"
              value={`~${plan.estimatedDays} day${plan.estimatedDays !== 1 ? 's' : ''}`}
            />
            {/* Remaining hours in window */}
            <Metric
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              label="Hrs Remaining (11h)"
              value={plan.remainingHoursHint > 0 ? `~${plan.remainingHoursHint}h` : 'Full window used'}
            />
          </div>

          {/* ── Duty-window gauge ── */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-slate-600">
                14-Hour On-Duty Window (est.)
              </span>
              <span className="text-[11px] text-slate-500">{plan.dutyWindowFillPct}% used</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${fc.bar}`}
                style={{ width: `${plan.dutyWindowFillPct}%` }}
              />
            </div>
          </div>

          {/* ── Break suggestion ── */}
          {plan.suggestBreak && plan.suggestedBreakDisplay && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2.5">
              <Coffee className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Suggested break:</span>{' '}
                Consider a 30-minute rest stop {plan.suggestedBreakDisplay} for driver comfort and
                regulatory awareness. Confirm timing with your ELD.
              </p>
            </div>
          )}

          {/* ── Multi-segment / over-limit notice ── */}
          {(plan.fitness === 'over_limit' || plan.fitness === 'needs_rest_day') && (
            <div className="flex items-start gap-2 rounded-md bg-orange-50 border border-orange-100 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-800">
                <span className="font-semibold">Multi-segment trip:</span>{' '}
                Estimated drive time exceeds the 11-hour driving limit.
                {plan.estimatedDays > 1
                  ? ` Plan for approx. ${plan.estimatedDays} days of driving.`
                  : ''}{' '}
                Coordinate rest stops and overnight scheduling with the driver directly.
                Always verify on ELD.
              </p>
            </div>
          )}

          {/* ── 70-hour awareness ── */}
          {plan.weeklyHoursWarning && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-2.5">
              <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800">
                <span className="font-semibold">70-Hour Awareness:</span>{' '}
                {plan.weeklyHoursWarning}
              </p>
            </div>
          )}

          {/* ── ELD Disclaimer — always visible ── */}
          <div className="flex items-start gap-2 rounded-md bg-slate-100 border border-slate-200 px-3 py-2.5">
            <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <span className="font-semibold">⚠️ {HOS_DISCLAIMER}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small metric tile ──────────────────────────────────────────────────────
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-white border border-slate-200 px-3 py-2 shadow-sm">
      <span className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wide font-medium">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}
