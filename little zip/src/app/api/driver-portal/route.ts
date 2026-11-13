import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  getDriverAccessTokenRecord,
  getDriverProfileForOnboarding,
  saveDriverProfileFromOnboarding,
} from '@/lib/onboardingStore';

export const runtime = 'nodejs';

function isCredentialError(err: any): boolean {
  const msg = err?.message || String(err);
  return (
    msg.includes('default credentials') ||
    msg.includes('SERVICE_ACCOUNT') ||
    msg.includes('Could not load')
  );
}

function redactLoadForDriverServer(load: Record<string, any>): Record<string, any> {
  return {
    ...load,
    ratePerMile: 0,
    totalAgreedRate: 0,
    tarpingFee: 0,
    expenses: {
      payroll: 0,
      fuel: 0,
      def: 0,
      recurring: 0,
      maintenance: 0,
      calculated: false,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')?.trim() || '';
    if (!token) {
      return NextResponse.json({ valid: false, error: 'Missing access token.' }, { status: 400 });
    }

    const record = await getDriverAccessTokenRecord(token);
    if (!record) {
      return NextResponse.json(
        { valid: false, error: 'Invalid or expired Driver View link.' },
        { status: 404 }
      );
    }

    const driverProfile = await getDriverProfileForOnboarding(record.adminUid, record.driverUid);

    let assignedLoads: Record<string, any>[] = [];
    let assignedTruck: Record<string, any> | null = null;
    let assignedTrailer: Record<string, any> | null = null;

    try {
      const loadsSnap = await adminDb.collection(`users/${record.adminUid}/loads`).get();
      const queryIds = [record.driverUid, record.authUid].filter(Boolean);
      const driverNameLower = (driverProfile?.name || record.driverName || '').trim().toLowerCase();

      assignedLoads = loadsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Record<string, any>))
        .filter((l) => {
          const assignedId = String(l.assignedDriverId || l.driverId || '').trim();
          if (assignedId && queryIds.includes(assignedId)) return true;
          const assignedName = String(l.assignedDriverName || l.driverName || '').trim().toLowerCase();
          if (!assignedId && driverNameLower && assignedName === driverNameLower) return true;
          return false;
        })
        .map(redactLoadForDriverServer);

      if (driverProfile?.assignedTruckId) {
        const tSnap = await adminDb
          .doc(`users/${record.adminUid}/vehicles/${driverProfile.assignedTruckId}`)
          .get();
        if (tSnap.exists) {
          const tData = tSnap.data() || {};
          assignedTruck = { id: tSnap.id, unitNumber: tData.unitNumber, name: tData.name };
        }
      }
      if (driverProfile?.assignedTrailerId) {
        const trSnap = await adminDb
          .doc(`users/${record.adminUid}/vehicles/${driverProfile.assignedTrailerId}`)
          .get();
        if (trSnap.exists) {
          const trData = trSnap.data() || {};
          assignedTrailer = { id: trSnap.id, unitNumber: trData.unitNumber, name: trData.name };
        }
      }
    } catch (err: any) {
      if (!isCredentialError(err)) {
        console.warn('[DriverPortalAPI] Error loading driver loads:', err?.message);
      }
    }

    // Strip any internal pay/compensation fields from driver's own profile if needed, keeping their license/compliance/contact info intact
    const safeProfile = {
      ...(driverProfile || {}),
      uid: record.driverUid,
      name: driverProfile?.name || record.driverName,
      email: driverProfile?.email || record.driverEmail || record.loginEmail,
      phone: driverProfile?.phone || record.driverPhone || '',
      cdlStatus: driverProfile?.cdlStatus || 'Non-CDL',
    };

    return NextResponse.json({
      valid: true,
      companyName: record.companyName || 'PayloadLogic Fleet',
      loginEmail: record.loginEmail,
      tempPassword: record.tempPassword,
      driverProfile: safeProfile,
      assignedTruck,
      assignedTrailer,
      loads: assignedLoads,
    });
  } catch (error: any) {
    console.error('[DriverPortalAPI] GET error:', error);
    return NextResponse.json(
      { valid: false, error: error?.message || 'Failed to load Driver View.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, action, loadId, updates, profileUpdates } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const record = await getDriverAccessTokenRecord(token);
    if (!record) {
      return NextResponse.json({ error: 'Invalid Driver View token.' }, { status: 403 });
    }

    if (action === 'update_profile' && profileUpdates) {
      const allowedProfileUpdates: Record<string, any> = {};
      for (const key of [
        'phone',
        'emergencyContactName',
        'emergencyContactPhone',
        'emergencyContactRelationship',
        'homeAddress',
        'homeCity',
        'homeState',
        'homeZip',
      ]) {
        if (profileUpdates[key] !== undefined) {
          allowedProfileUpdates[key] = profileUpdates[key];
        }
      }
      allowedProfileUpdates.updatedAt = new Date().toISOString();
      await saveDriverProfileFromOnboarding(record.adminUid, record.driverUid, allowedProfileUpdates);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_load' && loadId && updates) {
      try {
        const loadRef = adminDb.doc(`users/${record.adminUid}/loads/${loadId}`);
        const snap = await loadRef.get();
        if (!snap.exists) {
          return NextResponse.json({ error: 'Load not found.' }, { status: 404 });
        }
        const loadData = snap.data() || {};
        const queryIds = [record.driverUid, record.authUid].filter(Boolean);
        const assignedId = String(loadData.assignedDriverId || loadData.driverId || '').trim();
        if (assignedId && !queryIds.includes(assignedId)) {
          return NextResponse.json(
            { error: 'This load is not assigned to your driver account.' },
            { status: 403 }
          );
        }

        // Only allow driver-permitted fields to be updated
        const allowedLoadFields = [
          'status',
          'driverPhase',
          'driverAcceptedStatus',
          'driverAcceptedAt',
          'driverDeclinedAt',
          'driverDeclineReason',
          'assignedDriverId',
          'assignedDriverName',
          'driverId',
          'driverName',
          'driverNote',
          'driverNoteUpdatedAt',
          'driverExceptionFlag',
          'arrivedAt',
          'deliveredAt',
          'paperworkStatus',
        ];
        const safeLoadUpdates: Record<string, any> = {};
        for (const field of allowedLoadFields) {
          if (updates[field] !== undefined) {
            safeLoadUpdates[field] = updates[field];
          }
        }
        await loadRef.update(safeLoadUpdates);
      } catch (err: any) {
        if (!isCredentialError(err)) {
          throw err;
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    console.error('[DriverPortalAPI] POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update Driver View.' },
      { status: 500 }
    );
  }
}
