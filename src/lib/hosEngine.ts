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

export type HOSEstimate = {
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
  /** The parsed pickup date */
  pickupDate: Date;
};

export type HOSResult = HOSEstimate & {
  /** true when schedule has no HOS conflict (or fits within earliestDelivery) */
  isFeasible: boolean;
  /** Hours by which the requested delivery falls short (0 when feasible) */
  hoursShort: number;
  /** true when delivery is scheduled before pickup */
  isInverted: boolean;
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

export interface EarliestPickupResult {
  earliestPickup: Date;
  earliestPickupLocal: string;
  reason: string;
  basedOnPriorStop: boolean;
}

/**
 * Calculates the earliest realistic Pickup Date & Time.
 * - Never returns a time in the past (rounds up to the next 30-minute slot from `now`).
 * - When adding to an existing trip or assigning a truck/driver with active loads,
 *   accounts for the latest prior stop's estimated completion plus turnaround/deadhead time.
 */
export function calculateEarliestPickupDateTime(params: {
  loads?: Array<{
    id?: string;
    tripId?: string;
    assignedTruckId?: string;
    assignedDriverId?: string;
    status?: string | null;
    driverPhase?: string | null;
    deliveredAt?: string | null;
    paperworkStatus?: string | null;
    pickupDateTime?: string | null;
    deliveryDateTime?: string | null;
    distance?: number;
  }>;
  trips?: Array<{ id: string; assignedTruckId?: string; assignedDriverId?: string }>;
  tripId?: string;
  assignedTruckId?: string;
  assignedDriverId?: string;
  editingLoadId?: string | null;
  deadheadMiles?: number;
  averageSpeedMph?: number;
  now?: Date;
}): EarliestPickupResult {
  const nowMs = (params.now ?? new Date()).getTime();
  const speed = params.averageSpeedMph && params.averageSpeedMph > 0 ? params.averageSpeedMph : HOS_AVG_SPEED_MPH;
  const deadheadMs =
    params.deadheadMiles && params.deadheadMiles > 0
      ? (params.deadheadMiles / speed) * 3_600_000
      : 0;

  // Baseline: at least 5 minutes from now + deadhead, rounded up to the next 30-minute slot
  const roundUp30Min = (ms: number) => Math.ceil(ms / (30 * 60_000)) * (30 * 60_000);
  let earliestMs = roundUp30Min(nowMs + 5 * 60_000 + deadheadMs);
  let basedOnPriorStop = false;

  const targetTripId = params.tripId && params.tripId !== 'none' && params.tripId !== 'auto-create' ? params.tripId : '';
  const targetTruckId = params.assignedTruckId && params.assignedTruckId !== 'none' ? params.assignedTruckId : '';
  const targetDriverId = params.assignedDriverId && params.assignedDriverId !== 'none' ? params.assignedDriverId : '';

  if ((targetTripId || targetTruckId || targetDriverId) && Array.isArray(params.loads)) {
    const isFinished = (l: NonNullable<typeof params.loads>[number]) => {
      const s = (l.status || '').toLowerCase().trim();
      const p = (l.driverPhase || '').toLowerCase().trim();
      return s === 'delivered' || s === 'completed' || p === 'complete' || Boolean(l.deliveredAt);
    };

    const matchingActiveLoads = params.loads.filter((l) => {
      if (params.editingLoadId && l.id === params.editingLoadId) return false;
      if (isFinished(l)) return false;
      if (targetTripId && l.tripId === targetTripId) return true;
      if (targetTruckId && l.assignedTruckId === targetTruckId) return true;
      if (targetDriverId && l.assignedDriverId === targetDriverId) return true;
      return false;
    });

    let latestCompletionMs = 0;
    for (const l of matchingActiveLoads) {
      let endMs = l.deliveryDateTime ? Date.parse(l.deliveryDateTime) : NaN;
      if (isNaN(endMs) && l.pickupDateTime) {
        const startMs = Date.parse(l.pickupDateTime);
        if (!isNaN(startMs)) {
          const estHours = (l.distance && l.distance > 0 ? l.distance : 100) / speed;
          endMs = startMs + estHours * 3_600_000;
        }
      }
      if (!isNaN(endMs) && endMs > latestCompletionMs) {
        latestCompletionMs = endMs;
      }
    }

    if (latestCompletionMs > 0) {
      // 30-minute unload/turnaround buffer + deadhead transit after prior stop completes
      const afterPriorMs = roundUp30Min(latestCompletionMs + 30 * 60_000 + deadheadMs);
      if (afterPriorMs > earliestMs) {
        earliestMs = afterPriorMs;
        basedOnPriorStop = true;
      }
    }
  }

  const earliestPickup = new Date(earliestMs);
  return {
    earliestPickup,
    earliestPickupLocal: toDateTimeLocal(earliestPickup),
    reason: basedOnPriorStop
      ? 'Adjusted to earliest available time after prior stop'
      : 'Adjusted to earliest available time',
    basedOnPriorStop,
  };
}

/**
 * Computes the earliest feasible delivery date/time and HOS transit breakdown
 * from miles, pickup date/time, and driver HOS options.
 *
 * Returns null when inputs are insufficient (no miles entered, or invalid pickup date).
 */
export function calculateHOSTransitEstimate(
  loadedMiles: number,
  deadheadMiles: number,
  pickupDateTime: string,
  options?: HOSTransitOptions,
): HOSEstimate | null {
  const totalMiles = (loadedMiles || 0) + (deadheadMiles || 0);

  if (totalMiles <= 0 || !pickupDateTime) return null;

  const pickupDate = new Date(pickupDateTime);
  if (isNaN(pickupDate.getTime())) return null;

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
    pickupDate,
  };
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
  if (!requestedDeliveryDateTime) return null;

  const requestedDelivery = new Date(requestedDeliveryDateTime);
  if (isNaN(requestedDelivery.getTime())) return null;

  const estimate = calculateHOSTransitEstimate(
    loadedMiles,
    deadheadMiles,
    pickupDateTime,
    options,
  );
  if (!estimate) return null;

  const diffMs       = requestedDelivery.getTime() - estimate.earliestDelivery.getTime();
  const isInverted   = requestedDelivery.getTime() <= estimate.pickupDate.getTime();
  const hasHosIssue  = estimate.exceedsAvailableHours || estimate.requiresReset;
  const isFeasible   = !isInverted && !(hasHosIssue && diffMs < -60_000);
  const hoursShort   = isFeasible ? 0 : Math.abs(diffMs) / 3_600_000;

  return {
    ...estimate,
    isFeasible,
    hoursShort,
    isInverted,
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
  // Approximate on-duty time = drive + configured facility free time (defaults to 2h), measured against 14h window.
  const facilityHours =
    typeof freeTimeMinutes === 'number' && Number.isFinite(freeTimeMinutes) && freeTimeMinutes >= 0
      ? freeTimeMinutes / 60
      : 2;
  const estimatedOnDutyHours = estimatedDriveHours + facilityHours;
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

// ─────────────────────────────────────────────────────────────────────────────
// MANDATORY HOS REST BREAK TRIP PLANNER & PROGRESS SIMULATOR
// ─────────────────────────────────────────────────────────────────────────────

export type HOSTripBreak = {
  breakIndex: number;
  /** Cumulative driving hours at which the driver must stop */
  atDriveHours: number;
  /** Cumulative miles covered along the route when the stop begins */
  atMiles: number;
  /** Elapsed trip hours (including prior breaks) when the stop begins */
  startElapsedHours: number;
  /** Elapsed trip hours when the 10-hr break ends and driving resumes */
  endElapsedHours: number;
  /** Fraction of total route distance [0..1] for corridor / map placement */
  routeFraction: number;
  /** Duration of the mandatory rest break in hours (10) */
  durationHours: number;
  /** Estimated wall-clock start time of the break (if departure time known) */
  startTime: Date | null;
  /** Estimated wall-clock end time of the break (if departure time known) */
  endTime: Date | null;
  /** Linearly interpolated GPS coordinates along origin → destination */
  coordinates: { lat: number; lng: number } | null;
  /** Human-readable label for timeline & map markers */
  label: string;
};

export type HOSTripPlan = {
  totalMiles: number;
  averageSpeedMph: number;
  totalDriveHours: number;
  availableHosHours: number;
  requiresMandatoryBreak: boolean;
  isSingleShiftCompletable: boolean;
  breaks: HOSTripBreak[];
  totalRestHours: number;
  requiresReset: boolean;
  resetHours: number;
  totalTransitHours: number;
  departureDate: Date | null;
  adjustedEta: Date | null;
};

export type HOSAwareProgress = {
  completedDriveHours: number;
  coveredMiles: number;
  remainingMiles: number;
  progressPct: number;
  transitFraction: number;
  isResting: boolean;
  activeBreak: HOSTripBreak | null;
  breakRemainingHours: number;
  remainingDriveHours: number;
  remainingRestHours: number;
  remainingTotalHours: number;
};

/**
 * Builds an HOS-compliant trip plan that inserts mandatory 10-hour rest breaks
 * whenever driving time exceeds the driver's available HOS hours (FMCSA 11-hr limit).
 */
export function calculateHOSTripPlan(
  loadedMiles: number,
  deadheadMiles: number = 0,
  departureDateTime?: string | number | Date | null,
  options?: HOSTransitOptions & {
    originCoords?: { lat: number; lng: number } | null;
    destCoords?: { lat: number; lng: number } | null;
  },
): HOSTripPlan | null {
  const totalMiles = (loadedMiles || 0) + (deadheadMiles || 0);
  if (totalMiles <= 0) return null;

  const averageSpeedMph =
    options?.averageSpeedMph && options.averageSpeedMph > 0
      ? options.averageSpeedMph
      : HOS_AVG_SPEED_MPH;
  const totalDriveHours = totalMiles / averageSpeedMph;
  const availableHosHours =
    options?.availableHosHours !== undefined
      ? Math.max(0, options.availableHosHours)
      : HOS_MAX_DRIVE_HOURS;

  const requiresMandatoryBreak = totalDriveHours > availableHosHours;
  const isSingleShiftCompletable = !requiresMandatoryBreak;

  const requiresReset =
    totalDriveHours > HOS_CYCLE_HOURS ||
    (options?.recentOnDutyHours !== undefined &&
      options.recentOnDutyHours + totalDriveHours > HOS_CYCLE_HOURS);
  const resetHours = requiresReset ? HOS_RESET_HOURS : 0;

  let departureDate: Date | null = null;
  if (departureDateTime) {
    const d = departureDateTime instanceof Date ? departureDateTime : new Date(departureDateTime);
    if (!isNaN(d.getTime())) departureDate = d;
  }

  const breaks: HOSTripBreak[] = [];
  if (requiresMandatoryBreak) {
    let cumulativeDrive = availableHosHours;
    let breakIndex = 1;
    // Cap at 10 breaks as a safety guard against extreme/invalid inputs
    while (cumulativeDrive < totalDriveHours - 1e-6 && breakIndex <= 10) {
      const atMiles = Math.min(totalMiles, Math.round(cumulativeDrive * averageSpeedMph));
      const routeFraction = Math.min(0.98, Math.max(0.02, atMiles / totalMiles));
      const priorBreakHours = (breakIndex - 1) * HOS_REST_BREAK_HOURS;
      const startElapsedHours = cumulativeDrive + priorBreakHours;
      const endElapsedHours = startElapsedHours + HOS_REST_BREAK_HOURS;

      const startTime = departureDate
        ? new Date(departureDate.getTime() + startElapsedHours * 3_600_000)
        : null;
      const endTime = departureDate
        ? new Date(departureDate.getTime() + endElapsedHours * 3_600_000)
        : null;

      let coordinates: { lat: number; lng: number } | null = null;
      if (options?.originCoords && options?.destCoords) {
        coordinates = {
          lat: parseFloat(
            (
              options.originCoords.lat +
              (options.destCoords.lat - options.originCoords.lat) * routeFraction
            ).toFixed(5),
          ),
          lng: parseFloat(
            (
              options.originCoords.lng +
              (options.destCoords.lng - options.originCoords.lng) * routeFraction
            ).toFixed(5),
          ),
        };
      }

      breaks.push({
        breakIndex,
        atDriveHours: parseFloat(cumulativeDrive.toFixed(1)),
        atMiles,
        startElapsedHours: parseFloat(startElapsedHours.toFixed(2)),
        endElapsedHours: parseFloat(endElapsedHours.toFixed(2)),
        routeFraction,
        durationHours: HOS_REST_BREAK_HOURS,
        startTime,
        endTime,
        coordinates,
        label: `Mandatory 10-hr HOS Rest Break (Mile ${atMiles.toLocaleString()})`,
      });

      cumulativeDrive += HOS_MAX_DRIVE_HOURS;
      breakIndex += 1;
    }
  }

  const totalRestHours = breaks.length * HOS_REST_BREAK_HOURS;
  const totalTransitHours = totalDriveHours + totalRestHours + resetHours;
  const adjustedEta = departureDate
    ? new Date(Math.ceil((departureDate.getTime() + totalTransitHours * 3_600_000) / 60_000) * 60_000)
    : null;

  return {
    totalMiles,
    averageSpeedMph,
    totalDriveHours,
    availableHosHours,
    requiresMandatoryBreak,
    isSingleShiftCompletable,
    breaks,
    totalRestHours,
    requiresReset,
    resetHours,
    totalTransitHours,
    departureDate,
    adjustedEta,
  };
}

/**
 * Simulates route progress along an HOS trip plan given elapsed hours since departure:
 * driving pauses during mandatory 10-hour rest breaks and resumes afterward.
 */
export function calculateHOSAwareProgress(
  tripPlan: HOSTripPlan,
  elapsedHoursSinceDeparture: number,
): HOSAwareProgress {
  const elapsed = Math.max(0, elapsedHoursSinceDeparture);

  let isResting = false;
  let activeBreak: HOSTripBreak | null = null;
  let breakRemainingHours = 0;
  let completedRestHours = 0;

  for (const brk of tripPlan.breaks) {
    if (elapsed >= brk.startElapsedHours && elapsed < brk.endElapsedHours) {
      isResting = true;
      activeBreak = brk;
      breakRemainingHours = Math.max(0, brk.endElapsedHours - elapsed);
      completedRestHours += elapsed - brk.startElapsedHours;
      break;
    } else if (elapsed >= brk.endElapsedHours) {
      completedRestHours += brk.durationHours;
    }
  }

  const rawCompletedDrive = isResting && activeBreak
    ? activeBreak.atDriveHours
    : Math.max(0, elapsed - completedRestHours);

  const completedDriveHours = Math.min(tripPlan.totalDriveHours, rawCompletedDrive);
  const coveredMiles = Math.min(
    tripPlan.totalMiles,
    Math.round(completedDriveHours * tripPlan.averageSpeedMph),
  );
  const remainingMiles = Math.max(0, tripPlan.totalMiles - coveredMiles);
  const transitFraction =
    tripPlan.totalDriveHours > 0
      ? Math.min(1, Math.max(0, completedDriveHours / tripPlan.totalDriveHours))
      : 0;
  const progressPct =
    tripPlan.totalMiles > 0
      ? Math.min(98, Math.max(2, Math.round(transitFraction * 100)))
      : 0;

  const remainingDriveHours = Math.max(0, tripPlan.totalDriveHours - completedDriveHours);
  const remainingRestHours = Math.max(0, tripPlan.totalRestHours - completedRestHours);
  const remainingTotalHours = remainingDriveHours + remainingRestHours;

  return {
    completedDriveHours,
    coveredMiles,
    remainingMiles,
    progressPct,
    transitFraction,
    isResting,
    activeBreak,
    breakRemainingHours,
    remainingDriveHours,
    remainingRestHours,
    remainingTotalHours,
  };
}
