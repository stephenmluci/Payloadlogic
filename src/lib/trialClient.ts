/** Browser-side helpers for the trial API routes. */
import type { TrialRecord, DotVerificationStatus } from '@/lib/trial';
import type { CarrierLookupSnapshot } from '@/lib/fmcsa';

export interface DotCheckResult {
  status: DotVerificationStatus | 'verified' | 'unverified';
  dot?: string;
  carrier?: CarrierLookupSnapshot;
  carrierLegalName?: string;
  error?: string;
  notice?: string;
  nextStep?: string;
  /** false = this DOT already used a trial; null = couldn't be determined. */
  trialAvailable?: boolean | null;
}

/** Never throws: a network failure is reported as "valid_unverified" so signup is not blocked. */
export async function checkDot(usdotNumber: string): Promise<DotCheckResult> {
  try {
    const res = await fetch('/api/trial/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usdotNumber }),
    });
    if (!res.ok) return { status: 'valid_unverified', trialAvailable: null };
    return (await res.json()) as DotCheckResult;
  } catch {
    return { status: 'valid_unverified', trialAvailable: null };
  }
}

export interface StartTrialResult {
  ok: boolean;
  outcome?: 'started' | 'existing' | 'dot_already_used';
  trial?: TrialRecord;
  error?: string;
}

export async function startTrial(idToken: string, usdotNumber: string, mcNumber?: string): Promise<StartTrialResult> {
  try {
    const res = await fetch('/api/trial/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ usdotNumber, mcNumber }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error };
    return { ok: true, outcome: json.outcome, trial: json.trial };
  } catch {
    return { ok: false, error: 'Network error while activating your trial.' };
  }
}

export async function selectPlanOnServer(
  idToken: string,
  tier: 'starter' | 'fleetPro',
  interval: 'monthly' | 'sixMonth' | 'annual' = 'monthly'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/trial/select-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ tier, interval }),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: json?.error };
  } catch {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}
