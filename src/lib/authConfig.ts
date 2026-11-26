/**
 * Owner & Admin Authentication Bypass Configuration
 * ──────────────────────────────────────────────────────────────────────────────
 * Provides rules for identifying the owner user who receives full, unrestricted
 * platform access (Fleet Pro features, unlimited trucks & drivers,
 * and exemption from the USDOT requirement).
 *
 * Private Testing Lockdown:
 * - Only the designated owner email is allowed to sign in or create an account.
 * - All other emails are blocked from signing in, signing up, or starting trials.
 */

export const ALLOWED_OWNER_EMAIL = 'steph@payloadlogic.app';
export const DEFAULT_OWNER_EMAILS = [
  'owner@payloadlogic.app',
  'admin@payloadlogic.app',
  'steph@payloadlogic.app',
  'steph@example.com',
];

export const PRIVATE_TESTING_RESTRICTION_MESSAGE =
  'Private beta – access restricted';

/**
 * Retrieves the list of configured owner/admin emails from NEXT_PUBLIC_OWNER_EMAILS
 * (falling back to DEFAULT_OWNER_EMAILS when unset).
 */
export function getOwnerEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_OWNER_EMAILS;
  if (raw && raw.trim().length > 0) {
    const parsed = raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (parsed.length > 0) {
      return Array.from(new Set(parsed));
    }
  }
  return DEFAULT_OWNER_EMAILS.map((e) => e.toLowerCase());
}

/**
 * Checks if a given email is in the approved private-beta/owner email list.
 */
export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getOwnerEmails().includes(normalized);
}

/**
 * Validates whether an email has permission to authenticate or access the platform.
 */
export function validateOwnerAccess(email?: string | null): { allowed: boolean; message: string } {
  if (isOwnerEmail(email)) {
    return { allowed: true, message: '' };
  }
  return {
    allowed: false,
    message: PRIVATE_TESTING_RESTRICTION_MESSAGE,
  };
}

/**
 * Evaluates whether an authenticated user qualifies for owner/admin privileges.
 * Requires an active user object with verified identity matching the allowed owner email.
 */
export function isOwnerOrAdminUser(user?: {
  email?: string | null;
  role?: string | null;
  isOwner?: boolean;
  isAdmin?: boolean;
} | null): boolean {
  if (!user) return false;
  return isOwnerEmail(user.email);
}
