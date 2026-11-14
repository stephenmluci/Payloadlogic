/**
 * HOS (Hours of Service) Transit-Time Engine
 * Estimates transit times based on distance ÷ average speed and driver HOS availability.
 *
 * Spec constants:
 *   - Default average speed  : 55 mph (overridden by Settings.truckAverageSpeed)
 *   - Daily drive window     : 11 hrs
 *   - Rest break             : 10 hrs (when trip exceeds available driving hours)
 *   - Cycle limit            : 70 hrs (triggers estimated 72-hr reset when exceeded)
 *   - Note: Shipper/receiver dwell and detention are tracked separately and never added here.
 */

export const HOS_AVG_SPEED_MPH        = 55;
export const HOS_MAX_DRIVE_HOURS      = 11;
export const HOS_REST_BREAK_HOURS     = 10;
export const HOS_CYCLE_HOURS          = 70;
export const HOS_RESET_HOURS          = 72;
export const HOS_REST_THRESHOLD_MILES = HOS_AVG_SPEED_MPH * HOS_MAX_DRIVE_HOURS; // 605
export const HOS_MAX_MILES_PER_DAY    = HOS_REST_THRESHOLD_MILES;

export type HOSTransitOptions = {
  /** Average truck speed in mph (defaults to 55) */
  averageSpeedMph?: number;
  /** Driver's available driving hours (defaults to 11) */
  availableHosHours?: number;
  /** Optional driver on-duty hours in the current 8-day cycle */
  recentOnDutyHours?: number;
};

export type HOSResult = {
  /** Loaded + deadhead combined */
  totalMiles: number;
  /** Average speed used for the estimate (mph) */
  averageSpeedMph: number;
  /** Estimated driving hours (totalMiles ÷ averageSpeedMph) */
  totalDriveHours: number;
  /** Driver's available HOS hours used in this check */
  availableHosHours: number;
  /** True when estimated driving hours exceed driver's available hours */
  exceedsAvailableHours: boolean;
  /** True when the trip would require an estimated 72-hour reset */
  requiresReset: boolean;
  /** 72 when requiresReset is true, otherwise 0 */
  resetHours: number;
  /** Number of estimated 10-hr rest breaks needed */
  restBreaksNeeded: number;
  /** restBreaksNeeded × 10 */
  totalRestHours: number;
  /** totalDriveHours + totalRestHours + resetHours (excludes dwell/detention) */
  totalTransitHours: number;
  /** pickupDateTime + totalTransitHours */
  earliestDelivery: Date;
  /** true when schedule has no HOS conflict (or fits within earliestDelivery) */
  isFeasible: boolean;
  /** Hours by which the requested delivery falls short (0 when feasible) */
  hoursShort: number;
  /** true when delivery is scheduled before pickup */
  isInverted: boolean;
  /** The parsed pickup date */
  pickupDate: Date;
  /** The parsed requested delivery date */
  requestedDeliveryDate: Date;
};

/**
 * Converts a Date to a "datetime-local" input string ("YYYY-MM-DDTHH:MM")
 * respecting the local timezone — matches the format used by the load form inputs.
 */
export function toDateTimeLocal(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Estimates HOS transit requirements and checks for schedule conflicts based on
 * driver HOS availability and 72-hour reset requirements.
 *
 * Returns null when inputs are insufficient (no miles entered, or invalid dates).
 */
export function calculateHOSTransit(
  loadedMiles: number,
  deadheadMiles: number,
  pickupDateTime: string,
  requestedDeliveryDateTime: string,
  options?: HOSTransitOptions,
): HOSResult | null {
  const totalMiles = (loadedMiles || 0) + (deadheadMiles || 0);

  if (totalMiles <= 0 || !pickupDateTime || !requestedDeliveryDateTime) return null;

  const pickupDate        = new Date(pickupDateTime);
  const requestedDelivery = new Date(requestedDeliveryDateTime);

  if (isNaN(pickupDate.getTime()) || isNaN(requestedDelivery.getTime())) return null;

  // ── Drive time (distance ÷ average speed only, no dwell) ────────────────────
  const averageSpeedMph =
    options?.averageSpeedMph && options.averageSpeedMph > 0
      ? options.averageSpeedMph
      : HOS_AVG_SPEED_MPH;
  const totalDriveHours = totalMiles / averageSpeedMph;

  // ── HOS availability & 72-hour reset check ──────────────────────────────────
  const availableHosHours =
    options?.availableHosHours !== undefined
      ? Math.max(0, options.availableHosHours)
      : HOS_MAX_DRIVE_HOURS;

  const exceedsAvailableHours = totalDriveHours > availableHosHours;
  const requiresReset =
    totalDriveHours > HOS_CYCLE_HOURS ||
    (options?.recentOnDutyHours !== undefined &&
      options.recentOnDutyHours + totalDriveHours > HOS_CYCLE_HOURS);

  const restBreaksNeeded = exceedsAvailableHours
    ? Math.ceil((totalDriveHours - availableHosHours) / HOS_MAX_DRIVE_HOURS)
    : 0;

  const totalRestHours    = restBreaksNeeded * HOS_REST_BREAK_HOURS;
  const resetHours        = requiresReset ? HOS_RESET_HOURS : 0;
  const totalTransitHours = totalDriveHours + totalRestHours + resetHours;

  // Round up to nearest minute
  const earliestDeliveryMs = pickupDate.getTime() + totalTransitHours * 3_600_000;
  const earliestDelivery   = new Date(Math.ceil(earliestDeliveryMs / 60_000) * 60_000);

  const diffMs       = requestedDelivery.getTime() - earliestDelivery.getTime();
  const isInverted   = requestedDelivery.getTime() <= pickupDate.getTime();
  const hasHosIssue  = exceedsAvailableHours || requiresReset;
  const isFeasible   = !isInverted && !(hasHosIssue && diffMs < -60_000);
  const hoursShort   = isFeasible ? 0 : Math.abs(diffMs) / 3_600_000;

  return {
    totalMiles,
    averageSpeedMph,
    totalDriveHours,
    availableHosHours,
    exceedsAvailableHours,
    requiresReset,
    resetHours,
    restBreaksNeeded,
    totalRestHours,
    totalTransitHours,
    earliestDelivery,
    isFeasible,
    hoursShort,
    isInverted,
    pickupDate,
    requestedDeliveryDate: requestedDelivery,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOS PLANNING SUGGESTIONS  (for scheduling assistance only — not enforcement)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FMCSA property-carrying constants used for soft planning suggestions.
 *   - 11-hour driving limit
 *   - 14-hour on-duty window
 *   - 30-minute break suggested after 8 cumulative drive hours
 *   - 70-hour / 8-day limit (property carriers)
 *
 * These values generate non-authoritative scheduling hints ONLY.
 * The driver's certified ELD is the sole source of truth for compliance.
 */
const PLAN_MAX_DRIVE_HOURS    = 11;   // FMCSA 11-hour driving limit
const PLAN_MAX_DUTY_HOURS     = 14;   // FMCSA 14-hour on-duty window
const PLAN_BREAK_TRIGGER_HRS  = 8;    // 30-min break suggested after 8 drive hours
const PLAN_MAX_WEEKLY_HOURS   = 70;   // 70-hour / 8-day limit

/** Fitness category for the soft suggestion. */
export type HOSFitness =
  | 'fits_easily'     // < 70 % of 11-hr limit — comfortable
  | 'fits_tight'      // 70–100 % — manageable but snug
  | 'over_limit'      // exceeds 11-hr limit — multi-segment or reset needed
  | 'needs_rest_day'; // 2+ days of driving required

/** Structured output from calculateHOSPlan. All fields are estimates only. */
export type HOSPlan = {
  /** Estimated drive-only hours (distance ÷ averageSpeed). Suggestion only. */
  estimatedDriveHours: number;
  /** Human-readable display string, e.g. "7h 24m". */
  estimatedDriveDisplay: string;
  /** Whether a 30-minute break is suggested (trip > 4 h). */
  suggestBreak: boolean;
  /** Suggested break offset from departure (hours). */
  suggestedBreakAtHour: number | null;
  /** Friendly label, e.g. "approx. 4h in". */
  suggestedBreakDisplay: string | null;
  /** How the drive time fits within the 11-hour driving window. */
  fitness: HOSFitness;
  /** 0–100 fill percentage for a duty-window gauge. Capped at 100. */
  dutyWindowFillPct: number;
  /** Rough number of calendar days needed (integer ≥ 1). */
  estimatedDays: number;
  /** Approximate drive hours remaining in 11-hour window after this load. */
  remainingHoursHint: number;
  /**
   * Optional 70-hour awareness message.
   * Only present when recentOnDutyHours is supplied and ≥ 60 h.
   */
  weeklyHoursWarning: string | null;
};

/**
 * Generates soft HOS planning suggestions for a proposed load.
 *
 * @param distanceMiles      Loaded miles
 * @param averageSpeedMph    Pulled from Settings.truckAverageSpeed (defaults to 55)
 * @param recentOnDutyHours  Optional: driver's on-duty hours in last 8 days
 * @returns HOSPlan — for display only, never for enforcement or blocking
 */
export function calculateHOSPlan(
  distanceMiles: number,
  averageSpeedMph: number = 55,
  recentOnDutyHours?: number,
  freeTimeMinutes?: number,
): HOSPlan | null {
  if (!distanceMiles || distanceMiles <= 0) return null;

  const speed               = averageSpeedMph > 0 ? averageSpeedMph : 55;
  const estimatedDriveHours = distanceMiles / speed;

  // ── Friendly display string ─────────────────────────────────────────────────
  const wholeHours            = Math.floor(estimatedDriveHours);
  const minutes               = Math.round((estimatedDriveHours - wholeHours) * 60);
  const estimatedDriveDisplay =
    wholeHours > 0 ? `${wholeHours}h ${minutes}m` : `${minutes}m`;

  // ── Break suggestion ────────────────────────────────────────────────────────
  // Suggest a break if the trip is longer than 4 hours.
  // Target: just before the 8-hour consecutive-drive threshold, or the midpoint.
  const suggestBreak = estimatedDriveHours > 4;
  const suggestedBreakAtHour: number | null = suggestBreak
    ? Math.min(PLAN_BREAK_TRIGGER_HRS, Math.max(3.5, estimatedDriveHours / 2))
    : null;

  let suggestedBreakDisplay: string | null = null;
  if (suggestedBreakAtHour !== null) {
    const bh = Math.floor(suggestedBreakAtHour);
    const bm = Math.round((suggestedBreakAtHour - bh) * 60);
    suggestedBreakDisplay = `approx. ${bh > 0 ? `${bh}h` : ''}${bm > 0 ? ` ${bm}m` : ''} in`.trim();
  }

  // ── Fitness against 11-hour limit ───────────────────────────────────────────
  const pctOf11 = estimatedDriveHours / PLAN_MAX_DRIVE_HOURS;
  let fitness: HOSFitness;
  if (estimatedDriveHours > PLAN_MAX_DRIVE_HOURS * 2) {
    fitness = 'needs_rest_day';
  } else if (estimatedDriveHours > PLAN_MAX_DRIVE_HOURS) {
    fitness = 'over_limit';
  } else if (pctOf11 >= 0.70) {
    fitness = 'fits_tight';
  } else {
    fitness = 'fits_easily';
  }

  // ── Duty-window gauge ───────────────────────────────────────────────────────
  // Approximate on-duty time = drive + 2h dwell, measured against 14h window.
  const estimatedOnDutyHours = estimatedDriveHours + 2;
  const dutyWindowFillPct    = Math.min(100, Math.round((estimatedOnDutyHours / PLAN_MAX_DUTY_HOURS) * 100));

  // ── Days estimate ───────────────────────────────────────────────────────────
  const estimatedDays       = Math.max(1, Math.ceil(estimatedDriveHours / PLAN_MAX_DRIVE_HOURS));
  const remainingHoursHint  = Math.max(0, parseFloat((PLAN_MAX_DRIVE_HOURS - estimatedDriveHours).toFixed(1)));

  // ── Light 70-hour awareness ─────────────────────────────────────────────────
  let weeklyHoursWarning: string | null = null;
  if (recentOnDutyHours !== undefined && recentOnDutyHours >= 60) {
    const projected = recentOnDutyHours + estimatedOnDutyHours;
    if (projected > PLAN_MAX_WEEKLY_HOURS) {
      const over = Math.round(projected - PLAN_MAX_WEEKLY_HOURS);
      weeklyHoursWarning = `Driver may be approx. ${over}h over the 70-hr/8-day limit. Verify on ELD before dispatching.`;
    } else {
      const remaining = Math.round(PLAN_MAX_WEEKLY_HOURS - projected);
      weeklyHoursWarning = `Driver may have approx. ${remaining}h remaining in 8-day window. Verify on ELD.`;
    }
  }

  return {
    estimatedDriveHours,
    estimatedDriveDisplay,
    suggestBreak,
    suggestedBreakAtHour,
    suggestedBreakDisplay,
    fitness,
    dutyWindowFillPct,
    estimatedDays,
    remainingHoursHint,
    weeklyHoursWarning,
  };
}

/**
 * Canonical ELD disclaimer.
 * Import and render this text everywhere HOS planning suggestions are displayed.
 */
export const HOS_DISCLAIMER =
  'Planning suggestions only. These estimates are provided to help with scheduling. ' +
  'Official Hours of Service must be recorded and followed on your certified Electronic ' +
  'Logging Device (ELD). PayloadLogic is not an ELD and does not replace any required ' +
  'logging or compliance obligations.';
