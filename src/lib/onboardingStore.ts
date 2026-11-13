import { adminDb } from '@/lib/firebaseAdmin';

export interface OnboardingInviteRecord {
  token: string;
  adminUid: string;
  driverUid: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  companyName: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  submittedDataSummary?: any;
}

export interface DriverAccessTokenRecord {
  token: string;
  adminUid: string;
  driverUid: string;
  authUid: string;
  loginEmail: string;
  tempPassword: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  companyName: string;
  createdAt: string;
  updatedAt?: string;
}

// In-memory / dev fallback cache for local environments where Google Cloud default credentials are not present
const localInviteStore = new Map<string, OnboardingInviteRecord>();
const localDriverProfileStore = new Map<string, Record<string, any>>();
const localDriverAccessTokenStore = new Map<string, DriverAccessTokenRecord>();

function isCredentialError(err: any): boolean {
  const msg = err?.message || String(err);
  return (
    msg.includes('default credentials') ||
    msg.includes('SERVICE_ACCOUNT') ||
    msg.includes('Could not load')
  );
}

export async function saveOnboardingInvite(token: string, record: OnboardingInviteRecord): Promise<void> {
  localInviteStore.set(token, record);
  try {
    await adminDb.doc(`driverOnboardingInvites/${token}`).set(record);
  } catch (err: any) {
    if (isCredentialError(err)) {
      console.warn('[OnboardingStore] Falling back to local store (no Google Cloud credentials in local dev).');
      return;
    }
    throw err;
  }
}

export async function getOnboardingInvite(token: string): Promise<OnboardingInviteRecord | null> {
  try {
    const snap = await adminDb.doc(`driverOnboardingInvites/${token}`).get();
    if (snap.exists) {
      return snap.data() as OnboardingInviteRecord;
    }
  } catch (err: any) {
    if (!isCredentialError(err)) {
      throw err;
    }
  }
  return localInviteStore.get(token) || null;
}

export async function updateOnboardingInvite(token: string, updates: Partial<OnboardingInviteRecord>): Promise<void> {
  const existing = localInviteStore.get(token);
  if (existing) {
    localInviteStore.set(token, { ...existing, ...updates });
  }
  try {
    await adminDb.doc(`driverOnboardingInvites/${token}`).update(updates);
  } catch (err: any) {
    if (isCredentialError(err)) {
      return;
    }
    throw err;
  }
}

export async function saveDriverProfileFromOnboarding(
  adminUid: string,
  driverUid: string,
  profileUpdates: Record<string, any>
): Promise<void> {
  const key = `${adminUid}:${driverUid}`;
  const existing = localDriverProfileStore.get(key) || {};
  localDriverProfileStore.set(key, { ...existing, ...profileUpdates });

  try {
    const ref = adminDb.doc(`users/${adminUid}/driverProfiles/${driverUid}`);
    await ref.set(profileUpdates, { merge: true });
  } catch (err: any) {
    if (isCredentialError(err)) {
      console.warn('[OnboardingStore] Profile saved to local dev store.');
      return;
    }
    throw err;
  }
}

export async function getDriverProfileForOnboarding(
  adminUid: string,
  driverUid: string
): Promise<Record<string, any> | null> {
  try {
    const snap = await adminDb.doc(`users/${adminUid}/driverProfiles/${driverUid}`).get();
    if (snap.exists) {
      return snap.data() as Record<string, any>;
    }
  } catch (err: any) {
    if (!isCredentialError(err)) {
      throw err;
    }
  }
  const key = `${adminUid}:${driverUid}`;
  return localDriverProfileStore.get(key) || null;
}

export async function saveDriverAccessTokenRecord(
  token: string,
  record: DriverAccessTokenRecord
): Promise<void> {
  localDriverAccessTokenStore.set(token, record);
  try {
    await adminDb.doc(`driverAccessTokens/${token}`).set(record, { merge: true });
  } catch (err: any) {
    if (isCredentialError(err)) {
      console.warn('[OnboardingStore] Driver access token saved to local dev store.');
      return;
    }
    throw err;
  }
}

export async function getDriverAccessTokenRecord(
  token: string
): Promise<DriverAccessTokenRecord | null> {
  try {
    const snap = await adminDb.doc(`driverAccessTokens/${token}`).get();
    if (snap.exists) {
      return snap.data() as DriverAccessTokenRecord;
    }
  } catch (err: any) {
    if (!isCredentialError(err)) {
      throw err;
    }
  }
  return localDriverAccessTokenStore.get(token) || null;
}

