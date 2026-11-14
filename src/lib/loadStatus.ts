import type { Load } from '@/types';

const VALID_LOAD_STATUSES: Load['status'][] = [
  'pending_approval',
  'approved',
  'pending',
  'client-request-approved',
  'dispatched',
  'Deadheading',
  'arrived-origin',
  'loading',
  'in-transit',
  'arrived-destination',
  'unloading',
  'delivered',
  'arrived',
  'waiting',
  'on-break',
  'idle',
];

/**
 * Normalizes legacy, driver-phase, or mixed-case load status strings into canonical Load['status'] values.
 */
export function normalizeLoadStatus(status?: string | null): Load['status'] {
  const raw = (status || '').toLowerCase().trim();
  if (!raw || raw === 'pending') return 'pending_approval';
  if (raw === 'arrived' || raw === 'arrived at destination') return 'arrived-destination';
  if (raw === 'arrived at origin') return 'arrived-origin';
  if (raw === 'enroute to pickup' || raw === 'dispatched / en route' || raw === 'dispatched') return 'dispatched';
  if (raw === 'getting loaded') return 'loading';
  if (raw === 'enroute to destination' || raw === 'in transit') return 'in-transit';
  if (raw === 'getting unloaded') return 'unloading';
  if (raw === 'complete' || raw === 'completed' || raw === 'delivered / completed' || raw === 'delivered') {
    return 'delivered';
  }
  return VALID_LOAD_STATUSES.includes(raw as Load['status'])
    ? (raw as Load['status'])
    : 'pending_approval';
}

/**
 * Returns true if a load is finished (delivered / completed).
 */
export function isLoadCompleted(load: Pick<Load, 'status' | 'driverPhase'>): boolean {
  if (normalizeLoadStatus(load.status) === 'delivered') return true;
  const phase = (load.driverPhase || '').toLowerCase().trim();
  return phase === 'complete' || phase === 'completed';
}

/**
 * Builds a normalized signature for detecting duplicate load documents.
 */
export function getLoadDuplicateKey(load: Partial<Load>): string {
  const oCity = (load.origin?.city || '').trim().toLowerCase();
  const oState = (load.origin?.state || '').trim().toLowerCase();
  const oStreet = (load.origin?.street || '').trim().toLowerCase();
  const dCity = (load.destination?.city || '').trim().toLowerCase();
  const dState = (load.destination?.state || '').trim().toLowerCase();
  const dStreet = (load.destination?.street || '').trim().toLowerCase();
  const pickup = (load.pickupDateTime || '').slice(0, 16);
  const delivery = (load.deliveryDateTime || '').slice(0, 16);
  const dist = String(load.distance || 0);
  const cargo = (load.cargoDescription || '').trim().toLowerCase();

  if (!oCity || !dCity) return '';
  return [oStreet, oCity, oState, dStreet, dCity, dState, pickup, delivery, dist, cargo].join('|');
}

function scoreLoadCompleteness(load: Load): number {
  let score = 0;
  if (isLoadCompleted(load)) score += 100;
  if (load.tripId) score += 20;
  if (load.assignedDriverId) score += 10;
  if (load.signedBolUrl) score += 15;
  if (load.deliveredAt) score += 10;
  if (load.totalAgreedRate && load.totalAgreedRate > 0) score += 5;
  if (load.loadNumber) score += 5;
  return score;
}

/**
 * Removes duplicate loads by Firestore ID, loadNumber, or matching route/schedule/cargo signature.
 * Keeps the most complete/progressed record and returns any duplicate document IDs.
 */
export function deduplicateLoads(loads: Load[]): { unique: Load[]; duplicateIds: string[] } {
  const seenById = new Set<string>();
  const bestByKey = new Map<string, Load>();
  const orderedKeys: string[] = [];
  const duplicateIds: string[] = [];

  for (const load of loads) {
    if (load.id) {
      if (seenById.has(load.id)) continue;
      seenById.add(load.id);
    }

    const loadNumKey = load.loadNumber ? `num:${load.loadNumber.trim().toLowerCase()}` : '';
    const sigKey = getLoadDuplicateKey(load);
    const dedupeKey = loadNumKey || (sigKey ? `sig:${sigKey}` : `id:${load.id || Math.random()}`);

    const existing = bestByKey.get(dedupeKey);
    if (!existing) {
      bestByKey.set(dedupeKey, load);
      orderedKeys.push(dedupeKey);
    } else {
      const existingScore = scoreLoadCompleteness(existing);
      const candidateScore = scoreLoadCompleteness(load);
      if (candidateScore > existingScore) {
        if (existing.id) duplicateIds.push(existing.id);
        bestByKey.set(dedupeKey, load);
      } else if (load.id && load.id !== existing.id) {
        duplicateIds.push(load.id);
      }
    }
  }

  return {
    unique: orderedKeys.map((k) => bestByKey.get(k)!),
    duplicateIds,
  };
}
