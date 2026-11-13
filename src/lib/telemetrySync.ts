import type { Load, DriverProfile } from '@/types';
import { haversineDistanceMiles, calculateLegProgress, buildDriverProgressLegs } from '@/lib/routeUtils';

/**
 * Checks if a driver is actively broadcasting GPS coordinates (live within valid coordinate ranges).
 */
export function isDriverBroadcastingGPS(driver?: DriverProfile | null): boolean {
  if (!driver) return false;
  return (
    typeof driver.currentLat === 'number' &&
    typeof driver.currentLng === 'number' &&
    !isNaN(driver.currentLat) &&
    !isNaN(driver.currentLng) &&
    (driver.currentLat !== 0 || driver.currentLng !== 0)
  );
}

// Numerical lifecycle ranking: higher number = later stage in load lifecycle
export const STATUS_LIFECYCLE_ORDER: Record<string, number> = {
  'pending': 0,
  'client-request-approved': 1,
  'dispatched': 2,
  'Deadheading': 2,
  'arrived': 3,
  'Arrived': 3,
  'arrived-origin': 3,
  'loading': 4,
  'in-transit': 5,
  'arrived-destination': 6,
  'unloading': 7,
  'delivered': 8,
  // Exceptions are treated as neutral/sideways states
  'waiting': 3,
  'on-break': 2,
  'idle': 0,
};

/**
 * Derives the strict telemetry-driven status of a load based on driver telemetry,
 * distance to origin/destination coordinates, and active route leg progression.
 * Strict Rule: Telemetry engine is strictly forbidden from regressing a load's lifecycle backward
 * if a manual dispatcher override exists or if the load's current lifecycle stage is already ahead.
 */
export function deriveTelemetryLoadStatus(
  load: Load,
  allLoads: Load[],
  driver?: DriverProfile | null,
  currentTimeMs: number = Date.now()
): Load['status'] | null {
  // If no driver assigned, no telemetry status
  if (!driver) {
    return null;
  }

  // If a dispatcher manually advanced or overrode the status, manual override wins absolutely
  if (load.manualOverrideAt) {
    return load.status;
  }

  const currentStatusRank = STATUS_LIFECYCLE_ORDER[load.status] ?? 0;

  // 1. Direct driver telemetry status if provided by telemetry/radar
  const driverTelemStatus = driver.telemetry?.status;
  if (driverTelemStatus) {
    const raw = String(driverTelemStatus).trim().toLowerCase();
    let telemDerived: Load['status'] | null = null;
    if (raw === 'deadheading') telemDerived = 'dispatched';
    else if (raw === 'arrived' || raw === 'arrived at facility' || raw === 'arrived at origin') telemDerived = 'arrived-origin';
    else if (raw === 'arrived at destination') telemDerived = 'arrived-destination';
    else if (raw === 'unloading') telemDerived = 'unloading';
    else if (raw === 'loading') telemDerived = 'loading';
    else if (raw === 'in transit' || raw === 'in transit (loaded)') telemDerived = 'in-transit';
    else if (raw === 'off duty' || raw === 'off-duty') telemDerived = 'idle';

    if (telemDerived) {
      const telemRank = STATUS_LIFECYCLE_ORDER[telemDerived] ?? 0;
      // Do not regress status backward if the load has already advanced further
      if (currentStatusRank > telemRank && telemDerived !== 'idle') {
        return load.status;
      }
      return telemDerived;
    }
  }

  // If driver is not broadcasting GPS, do not force algorithmic telemetry override
  if (!isDriverBroadcastingGPS(driver)) {
    return null;
  }

  // If driver is explicitly off duty or on leave, preserve state or operational exception
  if (driver.status === 'off-duty' || driver.status === 'Off Duty' || driver.availabilityStatus === 'Off Duty') {
    return 'idle';
  }

  // If load is already completed / delivered, do not revert to transit
  if (load.status === 'delivered') {
    return 'delivered';
  }

  const dLat = driver.currentLat!;
  const dLng = driver.currentLng!;

  // Origin coordinates
  const oLat = typeof load.origin?.lat === 'number' ? load.origin.lat : (typeof load.originLat === 'number' ? load.originLat : null);
  const oLng = typeof load.origin?.lng === 'number' ? load.origin.lng : (typeof load.originLng === 'number' ? load.originLng : null);

  // Destination coordinates
  const destLat = typeof load.destination?.lat === 'number' ? load.destination.lat : (typeof load.destinationLat === 'number' ? load.destinationLat : null);
  const destLng = typeof load.destination?.lng === 'number' ? load.destination.lng : (typeof load.destinationLng === 'number' ? load.destinationLng : null);

  const distToOrigin = (oLat !== null && oLng !== null) ? haversineDistanceMiles(dLat, dLng, oLat, oLng) : null;
  const distToDest = (destLat !== null && destLng !== null) ? haversineDistanceMiles(dLat, dLng, destLat, destLng) : null;

  // Check if driver has reached destination (< 1.0 mile)
  if (distToDest !== null && distToDest <= 1.0) {
    if (load.status === 'unloading' || load.driverPhase === 'Getting Unloaded') {
      return 'unloading';
    }
    return 'arrived-destination';
  }

  // Check if driver is at origin (< 1.0 mile)
  if (distToOrigin !== null && distToOrigin <= 1.0) {
    if (load.status === 'loading' || load.driverPhase === 'Getting Loaded') {
      return 'loading';
    }
    return 'arrived-origin';
  }

  // If the load is already in-transit, arrived-destination, unloading, or delivered,
  // NEVER regress backward to deadheading / dispatched simply because distance math is far from origin
  if (currentStatusRank >= STATUS_LIFECYCLE_ORDER['in-transit']) {
    return load.status;
  }

  // Driver is > 1.0 mile away from origin and destination:
  // If driver has not arrived at origin or is deadheading, active leg is Deadheading
  const sanitizedLoad = { ...load, status: 'dispatched' as const, driverPhase: 'Enroute to Pickup' as const };
  const sanitizedAllLoads = allLoads.map(l => l.id === load.id ? sanitizedLoad : l);
  const legProgress = calculateLegProgress(sanitizedLoad, sanitizedAllLoads, load.distance || 0, 0.5, 55, currentTimeMs, driver);

  if (legProgress.isDeadhead || legProgress.activeLegTitle?.toLowerCase().includes('deadhead')) {
    // If load is already marked arrived or loading, do not revert to dispatched
    if (currentStatusRank >= STATUS_LIFECYCLE_ORDER['arrived-origin']) {
      return load.status;
    }
    // Driver is en route to pickup / deadheading to origin
    return 'dispatched';
  }

  // If load was already verified departed from origin, it's in transit loaded
  return 'in-transit';
}

/**
 * Returns true if a driver is currently deadheading or en route to pickup.
 */
export function isDriverDeadheading(
  load: Load,
  allLoads: Load[],
  driver?: DriverProfile | null,
  currentTimeMs: number = Date.now()
): boolean {
  if (!driver) return false;
  // If the load has been manually overridden or is already in-transit or beyond, they are NOT deadheading
  if (load.manualOverrideAt) return false;
  const currentStatusRank = STATUS_LIFECYCLE_ORDER[load.status] ?? 0;
  if (currentStatusRank >= STATUS_LIFECYCLE_ORDER['in-transit']) return false;

  if (driver.telemetry?.status && String(driver.telemetry.status).toLowerCase().includes('deadhead')) {
    return true;
  }
  const legProgress = calculateLegProgress(load, allLoads, load.distance || 0, 0.5, 55, currentTimeMs, driver);
  return Boolean(legProgress.isDeadhead);
}

/**
 * Cleanup function to check whether an 'Arrival Logged' timestamp or 'arrived' state is erroneous.
 * If the dispatcher has manually overridden the status or the load is in-transit or beyond, this returns false.
 * If the driver's live telemetry indicates they are 'Deadheading' or their GPS distance to the origin is > 1 mile,
 * this returns true, indicating the arrival timestamp should be wiped and detention clock stopped.
 */
export function isErroneousArrivalTimestamp(
  load: Load,
  driver?: DriverProfile | null,
  allLoads: Load[] = []
): boolean {
  if (!driver) {
    return false;
  }

  // If a manual override is active, dispatcher decision is absolute truth — never clear arrival
  if (load.manualOverrideAt) {
    return false;
  }

  // If load is already in transit (loaded) or beyond, do not regress/wipe
  const currentStatusRank = STATUS_LIFECYCLE_ORDER[load.status] ?? 0;
  if (currentStatusRank >= STATUS_LIFECYCLE_ORDER['in-transit']) {
    return false;
  }

  // Check if load has any arrival timestamp or arrived/detention state logged
  const hasArrivalLogged = Boolean(
    load.arrivedAt ||
    load.arrivalTimestamp ||
    load.detentionActive ||
    load.status === 'arrived' ||
    (load as any).status === 'Arrived' ||
    load.status === 'arrived-origin' ||
    load.driverPhase === 'Arrived'
  );

  if (!hasArrivalLogged) {
    return false;
  }

  // 1. If driver's live telemetry explicitly indicates 'Deadheading', any arrival timestamp is strictly erroneous
  if (isDriverDeadheading(load, allLoads, driver)) {
    return true;
  }

  // 2. If driver is broadcasting GPS coordinates and is > 1 mile away from origin
  if (isDriverBroadcastingGPS(driver)) {
    const dLat = driver.currentLat!;
    const dLng = driver.currentLng!;

    const oLat = typeof load.origin?.lat === 'number' ? load.origin.lat : (typeof load.originLat === 'number' ? load.originLat : null);
    const oLng = typeof load.origin?.lng === 'number' ? load.origin.lng : (typeof load.originLng === 'number' ? load.originLng : null);

    if (oLat !== null && oLng !== null) {
      const distToOrigin = haversineDistanceMiles(dLat, dLng, oLat, oLng);
      return distToOrigin > 1.0;
    }
  }

  return false;
}
