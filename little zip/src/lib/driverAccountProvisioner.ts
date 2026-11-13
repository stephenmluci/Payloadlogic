import crypto from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  getDriverProfileForOnboarding,
  saveDriverAccessTokenRecord,
  saveDriverProfileFromOnboarding,
} from '@/lib/onboardingStore';
import { sendDriverCredentialsEmail } from '@/lib/onboardingEmail';

function isCredentialError(err: any): boolean {
  const msg = err?.message || String(err);
  return (
    msg.includes('default credentials') ||
    msg.includes('SERVICE_ACCOUNT') ||
    msg.includes('Could not load')
  );
}

export interface ProvisionDriverAccountInput {
  adminUid: string;
  driverUid?: string;
  name: string;
  email?: string;
  phone?: string;
  explicitPassword?: string;
  companyName?: string;
  baseUrl: string;
  profileData?: Record<string, any>;
}

export interface ProvisionDriverAccountResult {
  driverUid: string;
  authUid: string;
  loginEmail: string;
  tempPassword: string;
  driverAccessToken: string;
  driverPortalUrl: string;
  loginUrl: string;
  passwordResetLink: string | null;
  emailSent: boolean;
  emailSimulated?: boolean;
  smsShareUrl: string | null;
  smsBody: string;
  profile: Record<string, any>;
}

export async function provisionDriverViewAccount(
  input: ProvisionDriverAccountInput
): Promise<ProvisionDriverAccountResult> {
  const {
    adminUid,
    name,
    email = '',
    phone = '',
    explicitPassword,
    companyName = 'PayloadLogic Fleet',
    baseUrl,
    profileData = {},
  } = input;

  const nowIso = new Date().toISOString();
  const cleanName = name.trim() || 'Fleet Driver';
  const rawEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();
  const phoneDigits = cleanPhone.replace(/\D/g, '');

  // Load existing profile if driverUid was supplied
  const existingProfile = input.driverUid
    ? await getDriverProfileForOnboarding(adminUid, input.driverUid)
    : null;

  // Determine loginEmail (real email if provided, or phone-based synthetic login email so phone-only drivers also get a Firebase Auth login)
  const hasRealEmail = Boolean(rawEmail && rawEmail.includes('@'));
  const loginEmail = hasRealEmail
    ? rawEmail
    : existingProfile?.loginEmail ||
      (phoneDigits.length >= 7
        ? `driver.${phoneDigits}@drivers.payloadlogic.app`
        : `driver.${crypto.randomBytes(4).toString('hex')}@drivers.payloadlogic.app`);

  // Determine temporary password
  const randomPin = Math.floor(1000 + Math.random() * 9000);
  const tempPassword =
    explicitPassword && explicitPassword.trim().length >= 6
      ? explicitPassword.trim()
      : existingProfile?.tempPassword || `PL-${randomPin}Drive!`;

  // Determine magic-link access token
  const driverAccessToken =
    existingProfile?.driverAccessToken || crypto.randomBytes(24).toString('hex');

  // Create or update Firebase Auth user
  let authUid = existingProfile?.authUid || input.driverUid || `drv_${crypto.randomBytes(8).toString('hex')}`;
  let passwordResetLink: string | null = null;

  try {
    let existingAuthUser = null;
    try {
      existingAuthUser = await adminAuth.getUserByEmail(loginEmail);
    } catch (lookupErr: any) {
      if (lookupErr?.code !== 'auth/user-not-found' && !isCredentialError(lookupErr)) {
        console.warn('[DriverAccountProvisioner] getUserByEmail warning:', lookupErr?.message);
      }
    }

    if (existingAuthUser) {
      authUid = existingAuthUser.uid;
      await adminAuth.updateUser(authUid, {
        password: tempPassword,
        displayName: cleanName,
      });
    } else {
      const createParams: Record<string, any> = {
        email: loginEmail,
        password: tempPassword,
        displayName: cleanName,
        emailVerified: true,
      };
      if (input.driverUid && !input.driverUid.startsWith('drv_')) {
        createParams.uid = input.driverUid;
      }
      const createdUser = await adminAuth.createUser(createParams);
      authUid = createdUser.uid;
    }

    try {
      passwordResetLink = await adminAuth.generatePasswordResetLink(loginEmail);
    } catch {
      // Non-fatal if reset link generation isn't configured
    }
  } catch (authErr: any) {
    if (isCredentialError(authErr)) {
      console.warn('[DriverAccountProvisioner] Local dev fallback for Firebase Auth user creation.');
    } else {
      console.warn('[DriverAccountProvisioner] Auth user provisioning warning:', authErr?.message);
    }
  }

  const targetDriverUid = input.driverUid || authUid;
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const driverPortalUrl = `${cleanBaseUrl}/driver-portal/${driverAccessToken}`;
  const loginUrl = `${cleanBaseUrl}/login`;

  const userProfileDoc = {
    uid: authUid,
    driverProfileId: targetDriverUid,
    email: loginEmail,
    contactEmail: hasRealEmail ? rawEmail : '',
    displayName: cleanName,
    phone: cleanPhone,
    role: 'driver' as const,
    driverOwnerId: adminUid,
    driverAccessToken,
    driverPortalUrl,
    updatedAt: nowIso,
    createdAt: existingProfile?.driverAccountCreatedAt || nowIso,
  };

  // Write Firebase Auth user profile docs so signing in via /login resolves role: 'driver' & driverOwnerId
  try {
    await adminDb.doc(`users/${authUid}/profile/main`).set(userProfileDoc, { merge: true });
    await adminDb.doc(`users/${authUid}`).set(
      {
        role: 'driver',
        driverOwnerId: adminUid,
        driverProfileId: targetDriverUid,
        email: loginEmail,
        displayName: cleanName,
        phone: cleanPhone,
        driverAccessToken,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    if (targetDriverUid !== authUid) {
      await adminDb.doc(`users/${targetDriverUid}/profile/main`).set(userProfileDoc, { merge: true });
      await adminDb.doc(`users/${targetDriverUid}`).set(
        {
          role: 'driver',
          driverOwnerId: adminUid,
          driverProfileId: targetDriverUid,
          authUid,
          email: loginEmail,
          displayName: cleanName,
          phone: cleanPhone,
          driverAccessToken,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }
  } catch (dbErr: any) {
    if (!isCredentialError(dbErr)) {
      console.warn('[DriverAccountProvisioner] Error saving user profile docs:', dbErr?.message);
    }
  }

  // Merge and save the full DriverProfile under users/{adminUid}/driverProfiles/{targetDriverUid}
  const mergedProfile: Record<string, any> = {
    ...(existingProfile || {}),
    ...profileData,
    uid: targetDriverUid,
    authUid,
    name: cleanName,
    email: hasRealEmail ? rawEmail : existingProfile?.email || loginEmail,
    phone: cleanPhone || existingProfile?.phone || '',
    loginEmail,
    tempPassword,
    driverAccessToken,
    driverPortalUrl,
    driverAccountCreated: true,
    driverAccountCreatedAt: existingProfile?.driverAccountCreatedAt || nowIso,
    status: profileData.status || existingProfile?.status || 'active',
    availabilityStatus:
      profileData.availabilityStatus || existingProfile?.availabilityStatus || 'Available',
    updatedAt: nowIso,
  };

  await saveDriverProfileFromOnboarding(adminUid, targetDriverUid, mergedProfile);

  // Save the magic-link token record for direct 1-tap Driver View access
  await saveDriverAccessTokenRecord(driverAccessToken, {
    token: driverAccessToken,
    adminUid,
    driverUid: targetDriverUid,
    authUid,
    loginEmail,
    tempPassword,
    driverName: cleanName,
    driverEmail: hasRealEmail ? rawEmail : '',
    driverPhone: cleanPhone,
    companyName,
    createdAt: existingProfile?.driverAccountCreatedAt || nowIso,
    updatedAt: nowIso,
  });

  // Send credentials email if a real email address was provided
  let emailSent = false;
  let emailSimulated = false;
  if (hasRealEmail) {
    try {
      const emailRes = await sendDriverCredentialsEmail({
        recipientEmail: rawEmail,
        driverName: cleanName,
        companyName,
        driverPortalUrl,
        loginUrl,
        loginEmail,
        tempPassword,
        passwordResetLink: passwordResetLink || undefined,
      });
      emailSent = Boolean(emailRes.success);
      emailSimulated = Boolean(emailRes.previewUrl);
    } catch (emailErr) {
      console.warn('[DriverAccountProvisioner] Failed to send credentials email:', emailErr);
    }
  }

  // Build SMS message & share URL for phone delivery
  const smsBody = `${companyName} — Your limited Driver View account is ready!\n\nDirect Driver View Link:\n${driverPortalUrl}\n\nOr sign in at ${loginUrl}\nLogin: ${loginEmail}\nPassword: ${tempPassword}`;
  const smsShareUrl = cleanPhone
    ? `sms:${cleanPhone}?body=${encodeURIComponent(smsBody)}`
    : null;

  return {
    driverUid: targetDriverUid,
    authUid,
    loginEmail,
    tempPassword,
    driverAccessToken,
    driverPortalUrl,
    loginUrl,
    passwordResetLink,
    emailSent,
    emailSimulated,
    smsShareUrl,
    smsBody,
    profile: mergedProfile,
  };
}
