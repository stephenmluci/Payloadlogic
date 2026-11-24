import type { DriverProfile, Load } from '@/types';

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
  if (raw === 'deadheading') return 'Deadheading';
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
export function isLoadCompleted(
  load: Pick<Load, 'status' | 'driverPhase' | 'deliveredAt' | 'paperworkStatus'>
): boolean {
  if (normalizeLoadStatus(load.status) === 'delivered') return true;
  const phase = (load.driverPhase || '').toLowerCase().trim();
  if (
    phase === 'complete' ||
    phase === 'completed' ||
    phase === 'delivered' ||
    phase === 'delivered / complete' ||
    phase === 'delivered / completed'
  ) {
    return true;
  }
  if (Boolean(load.deliveredAt)) return true;
  const pw = (load.paperworkStatus || '').toLowerCase().trim();
  if (pw === 'invoiced' || pw === 'closed') return true;
  return false;
}

/**
 * Returns true if the load has a Proof of Delivery (signed BOL / e-POD) on file
 * or has already been invoiced, paid, or closed out.
 */
export function hasLoadPod(
  load?: (Partial<Pick<Load, 'signedBolUrl' | 'paperworkStatus'>> & {
    podUrl?: string | null;
    paymentStatus?: string | null;
    isPaid?: boolean;
    paidAt?: string | null;
  }) | null,
): boolean {
  if (!load) return false;
  const pw = (load.paperworkStatus || '').toLowerCase().trim();
  const pay = (load.paymentStatus || '').toLowerCase().trim();
  return Boolean(
    load.signedBolUrl ||
    load.podUrl ||
    pw === 'pod_uploaded' ||
    pw === 'invoiced' ||
    pw === 'closed' ||
    pay === 'paid' ||
    load.isPaid ||
    load.paidAt,
  );
}

/**
 * Single source of truth for displaying a load's status pill across Overview,
 * Loads page, LoadCard, and Driver view.
 */
export function getUnifiedLoadStatusDisplay(
  load: Pick<Load, 'status' | 'driverPhase' | 'deliveredAt' | 'paperworkStatus' | 'signedBolUrl'> & {
    podUrl?: string | null;
    paymentStatus?: string | null;
    isPaid?: boolean;
    paidAt?: string | null;
  },
): { statusKey: Load['status']; label: string; color: string } {
  if (isLoadCompleted(load)) {
    if (hasLoadPod(load)) {
      return {
        statusKey: 'delivered',
        label: 'Delivered / Completed',
        color: 'bg-emerald-700 text-white',
      };
    }
    return {
      statusKey: 'delivered',
      label: 'Delivered (Pending POD)',
      color: 'bg-amber-600 text-white',
    };
  }

  const norm = normalizeLoadStatus(load.status);
  switch (norm) {
    case 'pending_approval':
    case 'pending':
      return { statusKey: norm, label: 'Pending Approval', color: 'bg-amber-500 text-white' };
    case 'approved':
      return { statusKey: norm, label: 'Approved', color: 'bg-blue-600 text-white' };
    case 'client-request-approved':
      return { statusKey: norm, label: 'Req. Approved', color: 'bg-teal-500 text-white' };
    case 'dispatched':
      return { statusKey: norm, label: 'Dispatched', color: 'bg-indigo-600 text-white' };
    case 'Deadheading':
      return { statusKey: norm, label: 'Deadheading', color: 'bg-indigo-600 text-white' };
    case 'arrived-origin':
      return { statusKey: norm, label: 'Arrived at Origin', color: 'bg-cyan-600 text-white' };
    case 'loading':
      return { statusKey: norm, label: 'Loading', color: 'bg-blue-100 text-blue-800' };
    case 'in-transit':
      return { statusKey: norm, label: 'In Transit (Loaded)', color: 'bg-emerald-600 text-white' };
    case 'arrived-destination':
      return { statusKey: norm, label: 'Arrived at Destination', color: 'bg-teal-600 text-white' };
    case 'unloading':
      return { statusKey: norm, label: 'Unloading', color: 'bg-amber-100 text-amber-800' };
    case 'waiting':
      return { statusKey: norm, label: 'Waiting / Detention', color: 'bg-orange-100 text-orange-800' };
    case 'on-break':
      return { statusKey: norm, label: 'On Break', color: 'bg-slate-100 text-slate-700' };
    case 'idle':
      return { statusKey: norm, label: 'Idle / Staging', color: 'bg-slate-100 text-slate-700' };
    default:
      return { statusKey: 'pending_approval', label: 'Pending Approval', color: 'bg-amber-500 text-white' };
  }
}

/**
 * Checks if a driver's current location matches the load's delivery destination (by city/state or <= 25 mi).
 */
export function doesDriverLocationMatchDestination(
  driver: Partial<DriverProfile> | undefined | null,
  load: Partial<Load>
): boolean {
  if (!driver || !load.destination) return false;
  const destCity = (load.destination.city || '').trim().toLowerCase();
  const destState = (load.destination.state || '').trim().toLowerCase();
  const driverLoc = [
    driver.lastLocationCity,
    driver.lastLocationState,
    (driver.telemetry as any)?.locationName,
  ]
    .filter(Boolean)
    .join(', ')
    .trim()
    .toLowerCase();

  if (destCity && driverLoc.includes(destCity)) {
    if (!destState || driverLoc.includes(destState)) {
      return true;
    }
  }

  const dLat = driver.telemetry?.lat ?? driver.currentLat;
  const dLng = driver.telemetry?.lng ?? driver.currentLng;
  const destLat = load.destination.lat ?? load.destinationLat;
  const destLng = load.destination.lng ?? load.destinationLng;

  if (
    typeof dLat === 'number' &&
    typeof dLng === 'number' &&
    typeof destLat === 'number' &&
    typeof destLng === 'number'
  ) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLatRad = toRad(destLat - dLat);
    const dLngRad = toRad(destLng - dLng);
    const a =
      Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
      Math.cos(toRad(dLat)) *
        Math.cos(toRad(destLat)) *
        Math.sin(dLngRad / 2) *
        Math.sin(dLngRad / 2);
    const miles = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (miles <= 25) return true;
  }

  return false;
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
