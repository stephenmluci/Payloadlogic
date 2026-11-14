import type { Settings } from '@/types';

export const DEFAULT_DETENTION_FREE_TIME_MINUTES = 120;
export const DEFAULT_DETENTION_FEE_RATE = 0;

export type LoadDetentionSummary = {
  elapsedMinutes: number;
  freeTimeMinutes: number;
  freeTimeRemainingMinutes: number;
  billableMinutes: number;
  billableHours: number;
  hourlyRate: number;
  estimatedCharge: number;
  hasExceededFreeTime: boolean;
  isBillable: boolean;
};

/**
 * Returns the company's configured detention free time in minutes (defaults to 120).
 * Preserves 0 when explicitly configured for zero free time.
 */
export function getDetentionFreeTimeMinutes(settings?: Partial<Settings> | null): number {
  const val = settings?.detentionFreeTimeMinutes;
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return val;
  }
  return DEFAULT_DETENTION_FREE_TIME_MINUTES;
}

/**
 * Returns the company's configured hourly detention rate in USD/hr (defaults to 0).
 */
export function getDetentionFeeRate(settings?: Partial<Settings> | null): number {
  const val = settings?.detentionFeeRate;
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
    return val;
  }
  return DEFAULT_DETENTION_FEE_RATE;
}

/**
 * Calculates elapsed wait time, remaining free time, billable hours, and estimated detention charge
 * for an arrived load using the company's configured detention settings.
 */
export function calculateLoadDetention(params: {
  arrivedAt?: string | number | Date | null;
  nowMs?: number;
  freeTimeMinutes: number;
  hourlyRate: number;
}): LoadDetentionSummary | null {
  const { arrivedAt, nowMs = Date.now(), freeTimeMinutes, hourlyRate } = params;
  if (!arrivedAt) return null;

  const arrivedMs =
    arrivedAt instanceof Date
      ? arrivedAt.getTime()
      : typeof arrivedAt === 'number'
        ? arrivedAt
        : new Date(arrivedAt).getTime();

  if (!Number.isFinite(arrivedMs)) return null;

  const safeFreeTime = Math.max(0, freeTimeMinutes);
  const safeRate = Math.max(0, hourlyRate);
  const elapsedMinutes = Math.max(0, (nowMs - arrivedMs) / 60_000);
  const freeTimeRemainingMinutes = Math.max(0, safeFreeTime - elapsedMinutes);
  const billableMinutes = Math.max(0, elapsedMinutes - safeFreeTime);
  const billableHours = billableMinutes / 60;
  const estimatedCharge = billableHours * safeRate;

  return {
    elapsedMinutes,
    freeTimeMinutes: safeFreeTime,
    freeTimeRemainingMinutes,
    billableMinutes,
    billableHours,
    hourlyRate: safeRate,
    estimatedCharge,
    hasExceededFreeTime: elapsedMinutes > safeFreeTime,
    isBillable: billableMinutes > 0 && safeRate > 0,
  };
}

/**
 * Formats a minute duration as a concise human-readable string (e.g. "1h 30m" or "45m").
 */
export function formatDetentionDuration(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/**
 * Formats free time in minutes with an equivalent hours label when >= 60 minutes.
 */
export function formatFreeTimeLabel(minutes: number): string {
  const safe = Math.max(0, minutes);
  if (safe === 0) return '0 min (no free time)';
  if (safe < 60) return `${safe} min`;
  const hrs = safe / 60;
  const hrsLabel = Number.isInteger(hrs) ? `${hrs} hr${hrs === 1 ? '' : 's'}` : `${hrs.toFixed(1)} hrs`;
  return `${safe} min (${hrsLabel})`;
}
