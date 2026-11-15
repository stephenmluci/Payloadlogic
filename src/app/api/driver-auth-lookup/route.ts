import { NextRequest, NextResponse } from 'next/server';
import { findDriverAccessTokens } from '@/lib/onboardingStore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawIdentifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';

    if (!rawIdentifier) {
      return NextResponse.json({ loginEmail: '', accessRevoked: false });
    }

    const isEmail = rawIdentifier.includes('@');
    if (isEmail) {
      const normalizedEmail = rawIdentifier.toLowerCase();
      const matches = await findDriverAccessTokens({ email: normalizedEmail });
      const activeMatch = matches.find((m) => !m.accessRevoked);
      const revokedMatch = matches.length > 0 && !activeMatch ? matches[0] : null;
      return NextResponse.json({
        loginEmail: (activeMatch || revokedMatch)?.loginEmail || normalizedEmail,
        accessRevoked: Boolean(revokedMatch),
      });
    }

    const digits = rawIdentifier.replace(/\D/g, '');
    if (digits.length >= 7) {
      const matches = await findDriverAccessTokens({ phoneDigits: digits });
      const activeMatch = matches.find((m) => !m.accessRevoked);
      const revokedMatch = matches.length > 0 && !activeMatch ? matches[0] : null;
      const chosen = activeMatch || revokedMatch;
      return NextResponse.json({
        loginEmail: chosen?.loginEmail || `driver.${digits}@drivers.payloadlogic.app`,
        accessRevoked: Boolean(revokedMatch),
      });
    }

    return NextResponse.json({ loginEmail: rawIdentifier, accessRevoked: false });
  } catch (error: any) {
    console.warn('[DriverAuthLookup] lookup warning:', error?.message);
    return NextResponse.json({ loginEmail: '', accessRevoked: false });
  }
}
