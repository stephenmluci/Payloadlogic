/**
 * driverAssignment.ts
 * Unified driver identity, assignment resolution, and active dispatch filtering.
 * Ensures Load Management, Fleet Status, and Driver View always share the same logic.
 */

import type { Load, DriverProfile, Trip, Vehicle, User } from '@/types';

/**
 * All dispatch statuses that represent an active, in-progress, or queued dispatch
 * for a driver in Driver View and dispatch boards.
 */
export const ACTIVE_DRIVER_STATUSES = new Set([
  'dispatched',
  'arrived-origin',
  'loading',
  'in-transit',
  'arrived',
  'arrived-destination',
  'unloading',
  'waiting',
  'detention',
  'on-break',
  'deadheading',
  'pending',
  'pending_approval',
  'approved',
  'client-request-approved',
  'idle',
]);

/**
 * Gets a guaranteed non-empty ID for a driver profile.
 * Prefers driver.uid, falls back to (driver as any).id or idNumber.
 */
export function getDriverProfileId(driver?: Partial<DriverProfile> | null): string {
  if (!driver) return '';
  return ((driver.uid || (driver as any).id || (driver as any).idNumber || '') as string).trim();
}

/**
 * Normalizes load assignment fields so assignedDriverId and assignedDriverName
 * are consistently present and point to a valid fleet driver.
 */
export function normalizeLoadDriverAssignment(
  load: Load,
  driverProfiles: DriverProfile[] = [],
  vehicles: Vehicle[] = [],
  trips: Trip[] = []
): Load {
  let assignedDriverId = (load.assignedDriverId || (load as any).driverId || '').trim();
  let assignedDriverName = (load.assignedDriverName || (load as any).driverName || '').trim();

  // 1. If assignedDriverId matches a driver's name instead of ID:
  if (assignedDriverId) {
    const byName = driverProfiles.find(d => d.name?.toLowerCase() === assignedDriverId.toLowerCase());
    if (byName) {
      assignedDriverName = byName.name;
      assignedDriverId = getDriverProfileId(byName);
    }
  }

  // 2. If driver name is present but driver ID is missing or invalid:
  if (!assignedDriverId && assignedDriverName) {
    const matched = driverProfiles.find(d => d.name?.toLowerCase() === assignedDriverName.toLowerCase());
    if (matched) {
      assignedDriverId = getDriverProfileId(matched);
      assignedDriverName = matched.name;
    }
  }

  // 3. If driver ID is present but driver name is missing:
  if (assignedDriverId && !assignedDriverName) {
    const matched = driverProfiles.find(d => getDriverProfileId(d) === assignedDriverId || (d as any).id === assignedDriverId);
    if (matched) {
      assignedDriverName = matched.name;
    }
  }

  // 4. If still unassigned, resolve from trip container:
  if (!assignedDriverId && load.tripId && load.tripId !== 'none') {
    const trip = trips.find(t => t.id === load.tripId);
    if (trip?.assignedDriverId) {
      assignedDriverId = trip.assignedDriverId.trim();
      const matched = driverProfiles.find(d => getDriverProfileId(d) === assignedDriverId || (d as any).id === assignedDriverId || d.name?.toLowerCase() === assignedDriverId.toLowerCase());
      if (matched) {
        assignedDriverId = getDriverProfileId(matched);
        assignedDriverName = matched.name;
      }
    }
  }

  // 5. If still unassigned, resolve from equipment assignment (truck pairing):
  if (!assignedDriverId && load.assignedTruckId && load.assignedTruckId !== 'none') {
    // Check if any driver profile has this assignedTruckId
    const driverWithTruck = driverProfiles.find(d => d.assignedTruckId === load.assignedTruckId);
    if (driverWithTruck) {
      assignedDriverId = getDriverProfileId(driverWithTruck);
      assignedDriverName = driverWithTruck.name;
    } else {
      // Check if truck entity has assignedDriverId
      const truck = vehicles.find(v => v.id === load.assignedTruckId);
      if (truck?.assignedDriverId) {
        assignedDriverId = truck.assignedDriverId.trim();
        const matched = driverProfiles.find(d => getDriverProfileId(d) === assignedDriverId || (d as any).id === assignedDriverId);
        if (matched) {
          assignedDriverName = matched.name;
        }
      }
    }
  }

  return {
    ...load,
    assignedDriverId: assignedDriverId || undefined,
    assignedDriverName: assignedDriverName || undefined,
  };
}

/**
 * Checks whether a load is assigned to the specified driver profile.
 * Resilient against:
 * - Direct assignedDriverId match (UID or Firestore document ID)
 * - Driver name match (stored in assignedDriverId or assignedDriverName)
 * - Multi-stop trip container assignment
 * - Equipment-level pairing (load assigned to truck #002 assigned to driver)
 */
export function isLoadAssignedToDriver(
  load: Load,
  driver?: DriverProfile | null,
  trips: Trip[] = [],
  vehicles: Vehicle[] = []
): boolean {
  if (!driver) return false;

  const dUid = getDriverProfileId(driver);
  const dId = ((driver as any).id || '').trim();
  const dName = (driver.name || '').trim().toLowerCase();

  // Direct load field checks
  const lDriverId = (load.assignedDriverId || (load as any).driverId || '').trim();
  if (lDriverId) {
    if (lDriverId === dUid || (dId && lDriverId === dId)) return true;
    if (dName && lDriverId.toLowerCase() === dName) return true;
  }

  const lDriverName = (load.assignedDriverName || (load as any).driverName || '').trim().toLowerCase();
  if (lDriverName && dName && lDriverName === dName) {
    return true;
  }

  // Trip assignment check
  if (load.tripId && load.tripId !== 'none') {
    const matchedTrip = trips.find(t => t.id === load.tripId);
    if (matchedTrip?.assignedDriverId) {
      const tripDriverId = matchedTrip.assignedDriverId.trim();
      if (tripDriverId === dUid || (dId && tripDriverId === dId)) return true;
      if (dName && tripDriverId.toLowerCase() === dName) return true;
    }
  }

  // Equipment pairing check
  if (load.assignedTruckId && load.assignedTruckId !== 'none') {
    if (driver.assignedTruckId && load.assignedTruckId === driver.assignedTruckId) {
      return true;
    }
    const truck = vehicles.find(v => v.id === load.assignedTruckId);
    if (truck?.assignedDriverId) {
      const truckDriverId = truck.assignedDriverId.trim();
      if (truckDriverId === dUid || (dId && truckDriverId === dId)) return true;
      if (dName && truckDriverId.toLowerCase() === dName) return true;
    }
  }

  return false;
}

/**
 * Helper to identify delivered, closed, or historical loads.
 * A load is historical ONLY if it has reached a terminal delivered state.
 */
export function isLoadHistoricalOrDelivered(load: Load): boolean {
  const status = (load.status || '').toLowerCase().trim();
  const driverPhase = (load.driverPhase || '').toLowerCase().trim();

  return (
    status === 'delivered' ||
    status === 'completed' ||
    status === 'awaiting paperwork' ||
    driverPhase === 'complete'
  );
}

/**
 * Resolves the driver profile for either Admin Preview mode or Real Driver Login.
 */
export function resolveDriverProfileForView(
  adminSelectedDriverId: string | null,
  driverProfiles: DriverProfile[] = [],
  user?: User | null,
  isAdminOrDispatcher: boolean = false
): DriverProfile | null {
  if (isAdminOrDispatcher) {
    if (adminSelectedDriverId) {
      const cleanId = adminSelectedDriverId.trim();
      return (
        driverProfiles.find(p => getDriverProfileId(p) === cleanId || (p as any).id === cleanId) ||
        driverProfiles.find(p => p.name?.toLowerCase() === cleanId.toLowerCase()) ||
        null
      );
    }
    // Default to active driver or first registered driver
    return driverProfiles.find(p => p.status === 'active') || driverProfiles[0] || null;
  }

  // Real Driver Login mode:
  if (!user) return null;

  // 1. Check user.driverProfileId
  if (user.driverProfileId) {
    const byProfileId = driverProfiles.find(
      p => getDriverProfileId(p) === user.driverProfileId || (p as any).id === user.driverProfileId
    );
    if (byProfileId) return byProfileId;
  }

  // 2. Check user.uid
  if (user.uid) {
    const byUid = driverProfiles.find(p => getDriverProfileId(p) === user.uid || (p as any).id === user.uid);
    if (byUid) return byUid;
  }

  // 3. Check user.email
  if (user.email) {
    const byEmail = driverProfiles.find(p => p.email?.toLowerCase() === user.email?.toLowerCase());
    if (byEmail) return byEmail;
  }

  // 4. Check user.displayName
  if (user.displayName) {
    const byName = driverProfiles.find(p => p.name?.toLowerCase() === user.displayName?.toLowerCase());
    if (byName) return byName;
  }

  return driverProfiles[0] || null;
}
