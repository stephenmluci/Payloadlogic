import type { Load, DriverProfile, Vehicle, Settings } from '@/types';
import { haversineDistanceMiles, resolveCoordinates, type Coordinates } from '@/lib/routeUtils';

export interface NextLoadCandidate {
  load: Load;
  deadheadMiles: number;
  deadheadCost: number;
  anchorLocationName: string;
  pickupLocationName: string;
  deliveryLocationName: string;
  windowFit: 'Fits Schedule' | 'Tight Window' | 'Past Pickup Window' | 'Flexible Schedule';
  windowFitDetails: string;
  projectedGross: number;
  ratePerMile: number;
  cargoWeight: number;
  cargoLinearFeet: number;
  fitsCapacity: boolean;
  capacityNotes: string;
}

export interface CandidateSearchOptions {
  driver: DriverProfile;
  activeLoad?: Load | null;
  allLoads: Load[];
  truck?: Vehicle | null;
  trailer?: Vehicle | null;
  settings: Settings;
  currentTimeMs?: number;
  driverEstArrivalMs?: number;
  maxResults?: number;
}

/**
 * Automatically evaluates the unassigned load pool and surfaces the top-ranked
 * next loads for a driver based on deadhead distance, deadhead cost, and pickup window compatibility.
 */
export function findCandidateNextLoads({
  driver,
  activeLoad,
  allLoads,
  truck,
  trailer,
  settings,
  currentTimeMs = Date.now(),
  driverEstArrivalMs,
  maxResults = 4,
}: CandidateSearchOptions): NextLoadCandidate[] {
  // Off-duty drivers must not be routed new freight
  if (
    driver.status === 'off-duty' ||
    driver.status === 'Off Duty' ||
    driver.availabilityStatus === 'Off Duty'
  ) {
    return [];
  }

  // 1. Determine driver's anchor point (where the next trip will start from)
  let anchorCoords: Coordinates | null = null;
  let anchorLocationName = 'Current Location';
  let driverFreeTimestamp = currentTimeMs;

  if (activeLoad && activeLoad.status !== 'delivered') {
    // Driver is currently on a load: next load begins at this load's destination
    const dest = activeLoad.destination;
    const destCity = dest?.city ? `${dest.city}, ${dest.state || ''}` : 'Active Destination';
    anchorLocationName = destCity;

    if (typeof dest?.lat === 'number' && typeof dest?.lng === 'number') {
      anchorCoords = { lat: dest.lat, lng: dest.lng };
    } else if (typeof activeLoad.destinationLat === 'number' && typeof activeLoad.destinationLng === 'number') {
      anchorCoords = { lat: activeLoad.destinationLat, lng: activeLoad.destinationLng };
    } else if (dest?.city) {
      anchorCoords = resolveCoordinates(dest.city, dest.state);
    }

    // Free timestamp is delivery ETA + 45 min unloading buffer
    if (driverEstArrivalMs && driverEstArrivalMs > currentTimeMs) {
      driverFreeTimestamp = driverEstArrivalMs + 45 * 60 * 1000;
    } else {
      driverFreeTimestamp = currentTimeMs + 90 * 60 * 1000; // Estimated 1.5 hr buffer
    }
  } else {
    // Driver is available or between loads: anchor point is current staging, GPS, or last known location
    const stagingText = driver.currentStaging?.trim() || (driver.lastLocationCity ? `${driver.lastLocationCity}, ${driver.lastLocationState || ''}`.trim() : '');
    if (typeof driver.currentLat === 'number' && typeof driver.currentLng === 'number' && (driver.currentLat !== 39.8283 || driver.currentLng !== -98.5795)) {
      anchorCoords = { lat: driver.currentLat, lng: driver.currentLng };
      anchorLocationName = stagingText || 'Driver GPS Location';
    } else if (stagingText) {
      anchorLocationName = stagingText;
      anchorCoords = resolveCoordinates(stagingText);
    } else if (settings.carrierAddress?.city) {
      anchorLocationName = `${settings.carrierAddress.city}, ${settings.carrierAddress.state || ''} (Yard)`;
      anchorCoords = resolveCoordinates(settings.carrierAddress.city, settings.carrierAddress.state);
    }
  }

  // Fallback to center US if still unresolved
  if (!anchorCoords) {
    anchorCoords = { lat: 39.8283, lng: -98.5795 };
  }

  // 2. Filter available unassigned candidate loads
  const unassignedLoads = allLoads.filter(load => {
    if (load.id === activeLoad?.id) return false;
    const isAvailableStatus = load.status === 'pending' || load.status === 'client-request-approved';
    const isUnassigned = !load.assignedDriverId || load.assignedDriverId === 'none' || load.assignedDriverId === '';
    return isAvailableStatus && isUnassigned;
  });

  if (unassignedLoads.length === 0) return [];

  // Vehicle operating CPM metrics
  const operatingCpm = truck?.operatingCostPerMile ?? settings.defaultOperatingCostPerMile ?? 0.20;
  const fuelMpg = truck?.mpg ?? settings.truckMpg ?? 9.5;
  const fuelCostPerGallon = settings.defaultFuelCostPerGallon ?? 3.85;
  const fuelCpm = fuelMpg > 0 ? fuelCostPerGallon / fuelMpg : 0.40;
  const totalDeadheadCpm = operatingCpm + fuelCpm;

  const trailerMaxPayload = trailer?.payloadCapacity
    || Math.max(0, (trailer?.gvwr ?? 0) - (trailer?.emptyWeight ?? 0))
    || 15000;
  const trailerDeckLength = trailer?.trailerLength ?? 40;

  // 3. Score and rank candidates
  const scoredCandidates: NextLoadCandidate[] = [];

  for (const candidate of unassignedLoads) {
    // Determine candidate pickup coordinates
    let pickupCoords: Coordinates | null = null;
    const orig = candidate.origin;
    const pickupLocationName = orig?.city ? `${orig.city}, ${orig.state || ''}` : 'Pickup Terminal';
    const dest = candidate.destination;
    const deliveryLocationName = dest?.city ? `${dest.city}, ${dest.state || ''}` : 'Delivery Terminal';

    if (typeof orig?.lat === 'number' && typeof orig?.lng === 'number') {
      pickupCoords = { lat: orig.lat, lng: orig.lng };
    } else if (typeof candidate.originLat === 'number' && typeof candidate.originLng === 'number') {
      pickupCoords = { lat: candidate.originLat, lng: candidate.originLng };
    } else if (orig?.city) {
      pickupCoords = resolveCoordinates(orig.city, orig.state);
    }

    if (!pickupCoords) {
      pickupCoords = { lat: 39.8283, lng: -98.5795 };
    }

    // Calculate approximate road deadhead miles (haversine * 1.25 road curvature factor)
    const rawHaversine = haversineDistanceMiles(
      anchorCoords.lat,
      anchorCoords.lng,
      pickupCoords.lat,
      pickupCoords.lng
    );
    const deadheadMiles = Math.max(5, Math.round(rawHaversine * 1.22));
    const deadheadCost = parseFloat((deadheadMiles * totalDeadheadCpm).toFixed(2));

    // Delivery window analysis
    let windowFit: NextLoadCandidate['windowFit'] = 'Flexible Schedule';
    let windowFitDetails = 'Flexible pickup timeframe';

    if (candidate.pickupDateTime) {
      const pickupTimeMs = new Date(candidate.pickupDateTime).getTime();
      if (!isNaN(pickupTimeMs)) {
        const diffMs = pickupTimeMs - driverFreeTimestamp;
        const diffHours = Math.round(diffMs / (3600 * 1000));

        if (diffHours >= 1) {
          windowFit = 'Fits Schedule';
          windowFitDetails = `Ready ~${diffHours}h before scheduled pickup`;
        } else if (diffHours >= -1) {
          windowFit = 'Tight Window';
          windowFitDetails = `Tight window (~${Math.abs(diffHours)}h turnaround)`;
        } else {
          windowFit = 'Past Pickup Window';
          windowFitDetails = `Pickup scheduled ${Math.abs(diffHours)}h before driver becomes free`;
        }
      }
    }

    // Capacity & Physical Cargo check
    const cargoWeight = candidate.cargoWeightNum || 0;
    const cargoLinearFeet = candidate.cargoLength || 0;
    let fitsCapacity = true;
    const notes: string[] = [];

    if (cargoWeight > 0 && trailerMaxPayload > 0 && cargoWeight > trailerMaxPayload) {
      fitsCapacity = false;
      notes.push(`Exceeds trailer payload capacity by ${(cargoWeight - trailerMaxPayload).toLocaleString()} lbs`);
    }
    if (cargoLinearFeet > 0 && trailerDeckLength > 0 && cargoLinearFeet > trailerDeckLength) {
      fitsCapacity = false;
      notes.push(`Exceeds deck length by ${(cargoLinearFeet - trailerDeckLength).toFixed(1)} ft`);
    }

    const ratePerMile = candidate.distance && candidate.distance > 0
      ? candidate.totalAgreedRate / candidate.distance
      : (candidate.ratePerMile || 0);

    scoredCandidates.push({
      load: candidate,
      deadheadMiles,
      deadheadCost,
      anchorLocationName,
      pickupLocationName,
      deliveryLocationName,
      windowFit,
      windowFitDetails,
      projectedGross: candidate.totalAgreedRate,
      ratePerMile: parseFloat(ratePerMile.toFixed(2)),
      cargoWeight,
      cargoLinearFeet,
      fitsCapacity,
      capacityNotes: notes.join('; ') || 'Fits trailer payload & deck',
    });
  }

  // 4. Sort: Fits Schedule first, then lowest deadhead miles, then highest rate per mile
  scoredCandidates.sort((a, b) => {
    // Penalize loads that don't fit physically
    if (a.fitsCapacity !== b.fitsCapacity) {
      return a.fitsCapacity ? -1 : 1;
    }

    // Prefer fitting schedules
    const windowScore = (fit: NextLoadCandidate['windowFit']) => {
      if (fit === 'Fits Schedule') return 0;
      if (fit === 'Flexible Schedule') return 1;
      if (fit === 'Tight Window') return 2;
      return 3;
    };

    const winDiff = windowScore(a.windowFit) - windowScore(b.windowFit);
    if (winDiff !== 0) return winDiff;

    // Smallest deadhead distance
    const dhDiff = a.deadheadMiles - b.deadheadMiles;
    if (Math.abs(dhDiff) > 15) return dhDiff;

    // Best revenue per mile
    return b.ratePerMile - a.ratePerMile;
  });

  return scoredCandidates.slice(0, maxResults);
}
