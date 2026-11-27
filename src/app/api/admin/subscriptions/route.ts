import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { isOwnerEmail } from '@/lib/authConfig';
import { getPlanPrice, INTERVAL_CONFIG, type BillingInterval } from '@/lib/pricing';
import type { SubscriptionTier } from '@/lib/planLimits';

export const runtime = 'nodejs';

type AccountStatus = 'active' | 'expired' | 'canceled';

export interface OwnerAccountRow {
  uid: string;
  email: string;
  companyName: string;
  planType: string;
  status: AccountStatus;
  amountPaidCents: number;
  createdAt: string | null;
  isTrial: boolean;
  isPaid: boolean;
}

function formatPlanLabel(tier: SubscriptionTier, interval: BillingInterval): string {
  const tierName = tier === 'fleetPro' ? 'Fleet Pro' : 'Starter';
  const intervalName = INTERVAL_CONFIG[interval]?.label || 'Monthly';
  return `${tierName} ${intervalName}`;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let decodedEmail: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    decodedEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!isOwnerEmail(decodedEmail)) {
    return NextResponse.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
  }

  try {
    const [authResult, usersSnap, trialsSnap, billingSnap] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection('users').get(),
      adminDb.collection('trials').get(),
      adminDb.collection('billing').get(),
    ]);

    const usersMap = new Map<string, any>();
    usersSnap.forEach((doc) => usersMap.set(doc.id, doc.data()));

    const trialsMap = new Map<string, any>();
    trialsSnap.forEach((doc) => trialsMap.set(doc.id, doc.data()));

    const billingMap = new Map<string, any>();
    billingSnap.forEach((doc) => billingMap.set(doc.id, doc.data()));

    const nowMs = Date.now();
    const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

    const accounts: OwnerAccountRow[] = [];
    const revenueByPlanMap = new Map<string, { planType: string; count: number; revenueCents: number }>();

    let activeTrials = 0;
    let paidSubscriptions = 0;
    let newSignupsLast30Days = 0;
    let totalRevenueCents = 0;

    for (const authUser of authResult.users) {
      const uid = authUser.uid;
      const email = authUser.email || '';
      const userDoc = usersMap.get(uid) || {};
      const trialDoc = trialsMap.get(uid);
      const billingDoc = billingMap.get(uid);

      // Skip driver sub-accounts provisioned under a carrier
      if (userDoc.role === 'driver' && userDoc.driverOwnerId) {
        continue;
      }

      const createdAt: string | null =
        userDoc.createdAt || authUser.metadata?.creationTime || null;
      const createdMs = createdAt ? Date.parse(createdAt) : NaN;
      if (!isNaN(createdMs) && createdMs >= thirtyDaysAgoMs) {
        newSignupsLast30Days += 1;
      }

      const isOwnerAcct = isOwnerEmail(email);
      const billingStatus = String(billingDoc?.status || '').toLowerCase();
      const isPaid = billingStatus === 'active';
      const isCanceled = billingStatus === 'canceled';

      const tier: SubscriptionTier =
        (billingDoc?.tier || trialDoc?.selectedTier || userDoc.subscriptionTier) === 'starter'
          ? 'starter'
          : 'fleetPro';
      const interval: BillingInterval =
        billingDoc?.interval || trialDoc?.selectedInterval || userDoc.billingInterval || 'monthly';

      let planType = 'Free / Unassigned';
      let status: AccountStatus = 'active';
      let amountPaidCents = 0;
      let isTrial = false;

      if (isOwnerAcct) {
        planType = 'Owner (Lifetime Fleet Pro)';
        status = 'active';
      } else if (isPaid) {
        planType = formatPlanLabel(tier, interval);
        status = 'active';
        amountPaidCents =
          typeof billingDoc?.amountPaidCents === 'number'
            ? billingDoc.amountPaidCents
            : getPlanPrice(tier, interval).totalCents;
        paidSubscriptions += 1;
        totalRevenueCents += amountPaidCents;

        const existing = revenueByPlanMap.get(planType) || {
          planType,
          count: 0,
          revenueCents: 0,
        };
        existing.count += 1;
        existing.revenueCents += amountPaidCents;
        revenueByPlanMap.set(planType, existing);
      } else if (isCanceled) {
        planType = formatPlanLabel(tier, interval);
        status = 'canceled';
      } else if (trialDoc) {
        isTrial = true;
        planType = `14-Day Trial (${tier === 'fleetPro' ? 'Fleet Pro' : 'Starter'})`;
        const endsMs = trialDoc.endsAt ? Date.parse(trialDoc.endsAt) : NaN;
        if (!isNaN(endsMs) && endsMs > nowMs) {
          status = 'active';
          activeTrials += 1;
        } else {
          status = 'expired';
        }
      } else if (userDoc.subscriptionTier) {
        planType = formatPlanLabel(tier, interval);
        status = 'active';
      }

      const companyName =
        userDoc.carrierLegalName ||
        userDoc.companyName ||
        authUser.displayName ||
        email ||
        uid.slice(0, 8);

      accounts.push({
        uid,
        email,
        companyName,
        planType,
        status,
        amountPaidCents,
        createdAt,
        isTrial,
        isPaid,
      });
    }

    accounts.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    return NextResponse.json({
      summary: {
        totalAccounts: accounts.length,
        activeTrials,
        paidSubscriptions,
        newSignupsLast30Days,
      },
      revenue: {
        totalRevenueCents,
        byPlan: Array.from(revenueByPlanMap.values()).sort(
          (a, b) => b.revenueCents - a.revenueCents,
        ),
      },
      accounts,
    });
  } catch (err: any) {
    console.error('Owner subscriptions overview error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load subscription overview' },
      { status: 500 },
    );
  }
}
