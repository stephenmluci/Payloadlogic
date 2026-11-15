import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { isOwnerEmail, PRIVATE_TESTING_RESTRICTION_MESSAGE } from '@/lib/authConfig';
import {
  findDriverAccessTokens,
  saveDriverAccessTokenRecord,
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, adminUid, driverUid, authUid, driverAccessToken } = body;

    if (!adminUid || !driverUid || !['revoke', 'restore'].includes(action)) {
      return NextResponse.json(
        { error: 'Valid action, adminUid, and driverUid are required.' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (authHeader) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader);
        if (!isOwnerEmail(decoded.email) && decoded.uid !== adminUid) {
          return NextResponse.json(
            { error: PRIVATE_TESTING_RESTRICTION_MESSAGE },
            { status: 403 }
          );
        }
      } catch (err: any) {
        if (!isCredentialError(err)) {
          return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
        }
      }
    }

    const nowIso = new Date().toISOString();
    const isRevoking = action === 'revoke';

    // 1. Update driver profile under company
    await saveDriverProfileFromOnboarding(adminUid, driverUid, {
      accessRevoked: isRevoking,
      accessRevokedAt: isRevoking ? nowIso : '',
      status: isRevoking ? 'inactive' : 'active',
      driverAccountCreated: !isRevoking,
      updatedAt: nowIso,
    });

    // 2. Revoke/restore all matching driverAccessTokens
    const tokens = await findDriverAccessTokens({ driverUid });
    const targetAuthUids = new Set<string>();
    if (authUid) targetAuthUids.add(authUid);
    if (driverUid) targetAuthUids.add(driverUid);

    for (const record of tokens) {
      if (record.authUid) targetAuthUids.add(record.authUid);
      await saveDriverAccessTokenRecord(record.token, {
        ...record,
        accessRevoked: isRevoking,
        accessRevokedAt: isRevoking ? nowIso : undefined,
        updatedAt: nowIso,
      });
    }

    if (driverAccessToken && !tokens.some((t) => t.token === driverAccessToken)) {
      try {
        await adminDb.doc(`driverAccessTokens/${driverAccessToken}`).set(
          {
            accessRevoked: isRevoking,
            accessRevokedAt: isRevoking ? nowIso : '',
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (err: any) {
        if (!isCredentialError(err)) {
          console.warn('[DriverAccessAPI] Failed to update fallback token doc:', err?.message);
        }
      }
    }

    // 3. Update user docs & disable/enable Firebase Auth user + revoke refresh tokens
    for (const targetUid of targetAuthUids) {
      try {
        await adminDb.doc(`users/${targetUid}`).set(
          { accessRevoked: isRevoking, updatedAt: nowIso },
          { merge: true }
        );
        await adminDb.doc(`users/${targetUid}/profile/main`).set(
          { accessRevoked: isRevoking, updatedAt: nowIso },
          { merge: true }
        );
      } catch (dbErr: any) {
        if (!isCredentialError(dbErr)) {
          console.warn('[DriverAccessAPI] User doc update warning:', dbErr?.message);
        }
      }

      try {
        await adminAuth.updateUser(targetUid, { disabled: isRevoking });
        if (isRevoking) {
          await adminAuth.revokeRefreshTokens(targetUid);
        }
      } catch (authErr: any) {
        if (authErr?.code !== 'auth/user-not-found' && !isCredentialError(authErr)) {
          console.warn('[DriverAccessAPI] Auth user update warning:', authErr?.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      accessRevoked: isRevoking,
    });
  } catch (error: any) {
    console.error('[DriverAccessAPI] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update driver access.' },
      { status: 500 }
    );
  }
}
