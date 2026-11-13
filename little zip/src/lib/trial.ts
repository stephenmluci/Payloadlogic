/**
 * PayloadLogic Free Trial — shared (client + server) rules
 * ──────────────────────────────────────────────────────────────────────────────
 * Pure helpers only (no Firebase / network) so the same logic drives the UI and
 * the API routes.
 *
 * Model
 *  - A trial is tied to a USDOT number and lasts TRIAL_DAYS from the moment the
 *    SERVER records it (never the client clock).
 *  - The authoritative record lives in `trials/{uid}` (written only by the Admin
 *    SDK; clients may read their own). `trialRegistry/{dot}` is the
 *    one-trial-per-DOT ledger and is never client-readable.
 *  - During an active trial the account is evaluated at Fleet Pro level.
 *  - Accounts created before TRIAL_ROLLOUT_AT with no trial record are
 *    "legacy" and are never restricted (existing/paid accounts keep working).
 */

export const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Accounts created before this instant are grandfathered (no trial gating). */
export const TRIAL_ROLLOUT_AT =
  process.env.NEXT_PUBLIC_TRIAL_ROLLOUT_AT || '2026-11-06T20:00:00Z';

/**
 * A brand-new account that has not been issued a trial record yet (e.g. the
 * activation call failed) keeps working for this long, then is treated as
 * restricted until activation succeeds. Prevents "skip the activation call" abuse.
 */
export const TRIAL_ACTIVATION_GRACE_MS = 60 * 60 * 1000;

export const DOT_MIN_DIGITS = 4;
export const DOT_MAX_DIGITS = 8;

export const TRIAL_MESSAGES = {
  invalidDot: 'Enter a valid USDOT number (4–8 numeric digits).',
  dotNotFound: "We couldn’t find that DOT number. Please check and try again.",
  dotInactive: 'This USDOT number is marked inactive with FMCSA. Please check and try again.',
  dotAlreadyUsed: 'This DOT number has already been used for a free trial.',
  dotAlreadyUsedNextStep: "You can still create your account, but you'll need to choose a plan (Starter or Fleet Pro) to continue.",
  trialExpired: 'Trial expired — choose a plan to continue.',
  dotUnverified: "We couldn’t verify this DOT right now. You can continue, and we may re-check later.",
} as const;

// ─── DOT format ──────────────────────────────────────────────────────────────

export type DotFormatResult =
  | { ok: true; dot: string }
  | { ok: false; error: string };

/**
 * Accepts "1234567", "USDOT 1234567", "DOT-1234567", "US DOT #1234567".
 * Returns the canonical digits-only form (no leading zeros).
 */
export function validateDotFormat(raw: string | null | undefined): DotFormatResult {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'Enter your USDOT number to start your free trial.' };

  const stripped = input.replace(/^\s*(us\s*dot|usdot|dot)\s*[#:\-]?\s*/i, '');
  if (!/^\d+$/.test(stripped)) return { ok: false, error: TRIAL_MESSAGES.invalidDot };

  const dot = stripped.replace(/^0+/, '');
  if (dot.length < DOT_MIN_DIGITS || dot.length > DOT_MAX_DIGITS) {
    return { ok: false, error: TRIAL_MESSAGES.invalidDot };
  }
  return { ok: true, dot };
}

// ─── Records ─────────────────────────────────────────────────────────────────

export type DotVerificationStatus = 'valid_verified' | 'valid_unverified' | 'invalid' | 'blocked_trial_used';
export type DotVerification = 'verified' | 'unverified' | DotVerificationStatus;
export type TrialRecordStatus = 'active' | 'denied';
export type PaidTier = 'starter' | 'fleetPro';

/** Shape of `trials/{uid}` (timestamps are ISO strings so they serialise cleanly). */
export interface TrialRecord {
  uid: string;
  dot: string;
  mcNumber?: string;
  /** 'denied' = this DOT had already used a trial; account gets no free period. */
  status: TrialRecordStatus;
  dotVerification: DotVerification;
  verificationStatus?: DotVerificationStatus;
  verificationTimestamp?: string;
  carrierLegalName?: string;
  carrierDbaName?: string;
  carrierOperatingStatus?: string;
  carrierCity?: string;
  carrierState?: string;
  startedAt: string;
  endsAt: string;
  /** Plan the user committed to; takes effect when the trial ends (or immediately if it already ended). */
  selectedTier?: PaidTier;
  /** Billing period the user chose with that plan (monthly / sixMonth / annual). */
  selectedInterval?: 'monthly' | 'sixMonth' | 'annual';
  selectedAt?: string;
}

export type TrialPhase =
  | 'legacy'     // grandfathered account — no trial rules apply
  | 'pending'    // new account, trial record not issued yet (activation in flight)
  | 'active'     // inside the 14-day window
  | 'expired'    // window over (or denied) and no plan chosen → restricted
  | 'converted'; // plan chosen → normal plan limits apply

export interface TrialState {
  phase: TrialPhase;
  /** Whole days left, rounded up (0 once expired). */
  daysRemaining: number;
  endsAt: Date | null;
  startedAt: Date | null;
  dot: string | null;
  dotVerification: DotVerification | null;
  verificationStatus: DotVerificationStatus | null;
  verificationTimestamp: string | null;
  carrierLegalName: string | null;
  carrierDbaName: string | null;
  carrierOperatingStatus: string | null;
  carrierCity: string | null;
  carrierState: string | null;
  /** True when the account was refused a trial because its DOT already used one. */
  trialDeniedForDot: boolean;
  selectedTier: PaidTier | null;
  selectedInterval: 'monthly' | 'sixMonth' | 'annual' | null;
  /** Paid features restricted until a plan is chosen. */
  isRestricted: boolean;
  /** Evaluate the account at Fleet Pro level. */
  hasEvaluationAccess: boolean;
}

const LEGACY_STATE: TrialState = {
  phase: 'legacy', daysRemaining: 0, endsAt: null, startedAt: null, dot: null,
  dotVerification: null, verificationStatus: null, verificationTimestamp: null,
  carrierLegalName: null, carrierDbaName: null, carrierOperatingStatus: null,
  carrierCity: null, carrierState: null,
  trialDeniedForDot: false, selectedTier: null, selectedInterval: null,
  isRestricted: false, hasEvaluationAccess: false,
};

export function computeTrialState(
  record: TrialRecord | null | undefined,
  accountCreatedAt: Date | string | null | undefined,
  now: Date = new Date(),
): TrialState {
  if (!record) {
    const created = accountCreatedAt ? new Date(accountCreatedAt) : null;
    const rollout = new Date(TRIAL_ROLLOUT_AT);
    if (!created || isNaN(created.getTime()) || created < rollout) return LEGACY_STATE;

    const overdue = now.getTime() - created.getTime() > TRIAL_ACTIVATION_GRACE_MS;
    return { ...LEGACY_STATE, phase: 'pending', isRestricted: overdue };
  }

  const startedAt = new Date(record.startedAt);
  const endsAt = new Date(record.endsAt);
  const vStatus: DotVerificationStatus =
    record.verificationStatus ||
    (record.dotVerification === 'verified' || record.dotVerification === 'valid_verified'
      ? 'valid_verified'
      : 'valid_unverified');

  const base = {
    endsAt, startedAt,
    dot: record.dot,
    dotVerification: record.dotVerification,
    verificationStatus: vStatus,
    verificationTimestamp: record.verificationTimestamp ?? record.startedAt,
    carrierLegalName: record.carrierLegalName ?? null,
    carrierDbaName: record.carrierDbaName ?? null,
    carrierOperatingStatus: record.carrierOperatingStatus ?? null,
    carrierCity: record.carrierCity ?? null,
    carrierState: record.carrierState ?? null,
    trialDeniedForDot: record.status === 'denied',
    selectedTier: record.selectedTier ?? null,
    selectedInterval: record.selectedInterval ?? null,
  };

  const trialOver = record.status === 'denied' || now >= endsAt;
  if (!trialOver) {
    return {
      ...base, phase: 'active',
      daysRemaining: Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS)),
      isRestricted: false, hasEvaluationAccess: true,
    };
  }
  if (record.selectedTier) {
    return { ...base, phase: 'converted', daysRemaining: 0, isRestricted: false, hasEvaluationAccess: false };
  }
  return { ...base, phase: 'expired', daysRemaining: 0, isRestricted: true, hasEvaluationAccess: false };
}

export function addTrialDays(from: Date, days: number = TRIAL_DAYS): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
