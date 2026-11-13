/**
 * Billing persistence (server-only, Admin SDK).
 * `billing/{uid}` holds Stripe linkage + status; it is never client-writable.
 * Applying an entitlement mirrors the plan onto the same fields the app already reads
 * (settings.subscriptionTier, trial.selectedTier) — no parallel billing state.
 */
import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import type { SubscriptionTier } from '@/lib/planLimits';
import type { BillingInterval } from '@/lib/pricing';
import { isOwnerEmail } from '@/lib/authConfig';

const SETTINGS_DOC_ID = 'userSettings';

export interface BillingDoc {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: string;
  tier?: SubscriptionTier;
  interval?: BillingInterval;
  currentPeriodEnd?: string;
  updatedAt?: string;
}

export async function requireUid(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!isOwnerEmail(decoded.email)) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function getBilling(uid: string): Promise<BillingDoc | null> {
  const snap = await adminDb.doc(`billing/${uid}`).get();
  return snap.exists ? (snap.data() as BillingDoc) : null;
}

export async function setBilling(uid: string, patch: BillingDoc) {
  await adminDb.doc(`billing/${uid}`).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function findUidByCustomer(customerId: string): Promise<string | null> {
  const q = await adminDb.collection('billing').where('stripeCustomerId', '==', customerId).limit(1).get();
  return q.empty ? null : q.docs[0].id;
}

export async function applyEntitlement(uid: string, tier: SubscriptionTier, interval: BillingInterval) {
  const now = new Date().toISOString();
  await Promise.all([
    adminDb.doc(`users/${uid}/settings/${SETTINGS_DOC_ID}`).set({ subscriptionTier: tier, billingInterval: interval }, { merge: true }),
    adminDb.doc(`users/${uid}`).set({ subscriptionTier: tier, billingInterval: interval }, { merge: true }),
  ]);
  const trialRef = adminDb.doc(`trials/${uid}`);
  if ((await trialRef.get()).exists) {
    await trialRef.update({ selectedTier: tier, selectedInterval: interval, selectedAt: now });
  }
}
