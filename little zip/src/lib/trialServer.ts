/**
 * Trial persistence (server-only, Admin SDK).
 * `trialRegistry/{dot}` is the permanent one-trial-per-DOT ledger.
 * `trials/{uid}`        is the per-account record the client reads.
 */
import { adminDb } from '@/lib/firebaseAdmin';
import {
  addTrialDays,
  type TrialRecord,
  type DotVerification,
  type DotVerificationStatus,
} from '@/lib/trial';
import type { CarrierLookupSnapshot } from '@/lib/fmcsa';

export type StartTrialOutcome = 'started' | 'existing' | 'dot_already_used';

export async function isDotTrialUsed(dot: string, exceptUid?: string): Promise<boolean> {
  const snap = await adminDb.doc(`trialRegistry/${dot}`).get();
  if (!snap.exists) return false;
  return !exceptUid || snap.data()?.uid !== exceptUid;
}

export async function startTrialForUser(params: {
  uid: string;
  dot: string;
  mcNumber?: string;
  dotVerification: DotVerification;
  verificationStatus?: DotVerificationStatus;
  carrierSnapshot?: Partial<CarrierLookupSnapshot>;
  carrierLegalName?: string;
}): Promise<{ outcome: StartTrialOutcome; record: TrialRecord }> {
  const {
    uid,
    dot,
    mcNumber,
    dotVerification,
    verificationStatus = dotVerification === 'verified' ? 'valid_verified' : 'valid_unverified',
    carrierSnapshot,
    carrierLegalName = carrierSnapshot?.legalName,
  } = params;
  const trialRef = adminDb.doc(`trials/${uid}`);
  const registryRef = adminDb.doc(`trialRegistry/${dot}`);

  return adminDb.runTransaction(async (tx) => {
    const [trialSnap, registrySnap] = await Promise.all([tx.get(trialRef), tx.get(registryRef)]);

    // Idempotent: one record per account, never re-issued (also blocks "change DOT to restart").
    if (trialSnap.exists) {
      const existing = trialSnap.data() as TrialRecord;
      return { outcome: 'existing' as const, record: existing };
    }

    const now = new Date();
    const verificationTimestamp = now.toISOString();

    const base = {
      uid,
      dot,
      ...(mcNumber ? { mcNumber } : {}),
      dotVerification,
      verificationStatus,
      verificationTimestamp,
      ...(carrierLegalName ? { carrierLegalName } : {}),
      ...(carrierSnapshot?.dbaName ? { carrierDbaName: carrierSnapshot.dbaName } : {}),
      ...(carrierSnapshot?.operatingStatus ? { carrierOperatingStatus: carrierSnapshot.operatingStatus } : {}),
      ...(carrierSnapshot?.city ? { carrierCity: carrierSnapshot.city } : {}),
      ...(carrierSnapshot?.state ? { carrierState: carrierSnapshot.state } : {}),
      startedAt: now.toISOString(),
    };

    if (registrySnap.exists && registrySnap.data()?.uid !== uid) {
      // DOT already consumed its trial on another account → no free period for this one.
      const denied: TrialRecord = {
        ...base,
        status: 'denied',
        verificationStatus: 'blocked_trial_used',
        endsAt: now.toISOString(),
      };
      tx.set(trialRef, denied);
      return { outcome: 'dot_already_used' as const, record: denied };
    }

    const endsAt = addTrialDays(now);
    const record: TrialRecord = { ...base, status: 'active', endsAt: endsAt.toISOString() };
    tx.set(trialRef, record);
    tx.set(registryRef, {
      dot,
      uid,
      startedAt: record.startedAt,
      endsAt: record.endsAt,
      dotVerification,
      verificationStatus,
      verificationTimestamp,
      ...(carrierLegalName ? { carrierLegalName } : {}),
      ...(carrierSnapshot?.city ? { carrierCity: carrierSnapshot.city } : {}),
      ...(carrierSnapshot?.state ? { carrierState: carrierSnapshot.state } : {}),
    });
    return { outcome: 'started' as const, record };
  });
}

export async function selectPlanForUser(uid: string, tier: 'starter' | 'fleetPro', interval: 'monthly' | 'sixMonth' | 'annual' = 'monthly'): Promise<TrialRecord | null> {
  const ref = adminDb.doc(`trials/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ selectedTier: tier, selectedInterval: interval, selectedAt: new Date().toISOString() });
  return { ...(snap.data() as TrialRecord), selectedTier: tier, selectedInterval: interval };
}
