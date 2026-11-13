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
export const DEFAULT_OWNER_EMAILS = [ALLOWED_OWNER_EMAIL];

export const PRIVATE_TESTING_RESTRICTION_MESSAGE =
  'This app is currently in private testing and is only available to the owner.';

/**
 * Retrieves the list of configured owner/admin emails.
 * In private testing mode, this is strictly the single allowed owner email.
 */
export function getOwnerEmails(): string[] {
  return [ALLOWED_OWNER_EMAIL.toLowerCase()];
}

/**
 * Checks if a given email is the designated allowed owner email.
 */
export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized === ALLOWED_OWNER_EMAIL.toLowerCase();
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
