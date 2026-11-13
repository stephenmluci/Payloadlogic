/**
 * Display ID utilities for PayloadLogic
 *
 * Load format : LD-YYMM-#### (e.g. LD-2609-0001 for the first load of Sep 2026)
 * Trip format : T-### (e.g. T-001, T-042)
 *
 * These are human-facing identifiers only. The raw Firestore document ID is
 * always used for database reads/writes and foreign-key references (load.tripId etc.).
 */

/**
 * Format a load display ID.
 * @param date  The date the load is being created (determines YYMM prefix)
 * @param seq   The 1-based sequential counter
 * @returns     e.g. "LD-2609-0001"
 */
export function formatLoadDisplayId(date: Date, seq: number): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `LD-${yy}${mm}-${String(seq).padStart(4, '0')}`;
}

/**
 * Parse the numeric sequence out of a loadNumber string.
 * Handles both the legacy format (L-0042) and the new format (LD-2609-0042).
 * Returns null when the string does not match either pattern.
 */
export function parseLoadSeq(loadNumber: string): number | null {
  // New format: LD-YYMM-####
  const newMatch = loadNumber.match(/^LD-\d{4}-(\d+)$/);
  if (newMatch) return parseInt(newMatch[1], 10);
  // Legacy format: L-####
  const oldMatch = loadNumber.match(/^L-(\d+)$/);
  if (oldMatch) return parseInt(oldMatch[1], 10);
  return null;
}

/**
 * Format a trip display number.
 * @param seq  The 1-based sequential counter
 * @returns    e.g. "T-001"
 */
export function formatTripNumber(seq: number): string {
  return `T-${String(seq).padStart(3, '0')}`;
}

/**
 * Parse the numeric sequence out of a tripNumber string (e.g. "T-001" => 1).
 * Returns null when the string does not match the expected pattern.
 */
export function parseTripSeq(tripNumber: string): number | null {
  const match = tripNumber.match(/^T-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Returns the best human-readable load identifier for display purposes.
 * Prefers the stored loadNumber; falls back to a short uppercase hash of the
 * Firestore document ID so old loads without a loadNumber still look intentional.
 */
export function getLoadDisplayId(load: { id?: string; loadNumber?: string }): string {
  if (load.loadNumber) return load.loadNumber;
  if (load.id) return `#${load.id.substring(0, 7).toUpperCase()}`;
  return 'N/A';
}
