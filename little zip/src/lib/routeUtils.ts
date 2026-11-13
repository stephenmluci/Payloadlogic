/**
 * routeUtils.ts
 * Route utilities for LIFO deck sequencing, OSRM mileage estimation,
 * Google Maps multi-stop URL building, and RouteLeg construction.
 */

import type { Load, RouteLeg, DeckPosition, Address, DriverProfile } from '@/types';

// ── 1. LIFO DECK SEQUENCING ──────────────────────────────────────────────────

export function sequenceLoadsLIFO(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    const distDiff = (b.distance ?? 0) - (a.distance ?? 0);
    if (distDiff !== 0) return distDiff;
    return new Date(a.deliveryDateTime).getTime() - new Date(b.deliveryDateTime).getTime();
  });
}

export function computeDeckPositions(loads: Load[]): DeckPosition[] {
  const lifoSorted = sequenceLoadsLIFO(loads);
  const n = lifoSorted.length;
  return lifoSorted.map((load, idx) => ({
    loadId: load.id!,
    deckOrder: n - idx,
    deliveryDistance: load.distance ?? 0,
    isBottomLoad: idx === 0,
    isTopLoad: idx === n - 1,
  }));
}

// ── 2. MULTI-STOP ROUTE LEGS ──────────────────────────────────────────────────

/**
 * Strict Searchable Address Formatter
 * Construct address string using ONLY the raw street, city, state, and zip variables.
 * Do NOT use any 'company', 'client', 'name', or 'display' fields.
 * Exact format: `${streetVariable}, ${cityVariable}, ${stateVariable} ${zipVariable}`
 */
export function cleanSearchableAddress(addr?: Address | string | null): string {
  if (!addr) return '';

  if (typeof addr === 'string') {
    let clean = addr.trim();
    // Strip prefixes like "Home (1424 Mayfield Ave)" -> "1424 Mayfield Ave"
    clean = clean.replace(/^(?:home|work|office|yard|depot|facility|warehouse|hq|carrier hq)\s*[:(-]\s*/i, '');
    clean = clean.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean;
  }

  // Address object: Strictly extract ONLY raw street, city, state, and zip
  // Do NOT include companyName, contactName, etc.
  let street = (addr.street || '').trim();
  let city = (addr.city || '').trim();
  let state = (addr.state || '').trim();
  let zip = (addr.zip || '').trim();

  // If street accidentally contains company name prefix or parenthesis, strip it
  street = street.replace(/^(?:home|work|office|yard|depot|facility|warehouse|hq|carrier hq)\s*[:(-]\s*/i, '');
  street = street.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

  // Guard against duplicate city in street field (e.g. "Clarksburg, Clarksburg")
  if (city && street) {
    const streetCityRegex = new RegExp(`,?\\s*${city}\\s*$`, 'i');
    street = street.replace(streetCityRegex, '').trim();
  }

  // Build clean address strictly matching: `${streetVariable}, ${cityVariable}, ${stateVariable} ${zipVariable}`
  const stateZip = [state, zip].filter(Boolean).join(' ').trim();
  const addressParts: string[] = [];
  if (street) addressParts.push(street);
  if (city) addressParts.push(city);
  if (stateZip) addressParts.push(stateZip);

  return addressParts.join(', ').trim();
}

export function formatAddressForRoute(addr?: Address | null): string {
  return cleanSearchableAddress(addr);
}

export function buildMultiStopLegs(loads: Load[]): RouteLeg[] {
  if (loads.length === 0) return [];
  // Use chronological ordering and deduplication pipeline
  const chronologicalStops = buildChronologicalTripStops(loads);
  return chronologicalStops.map(stop => ({
    type: stop.type,
    location: stop.location,
    loadId: stop.loadId,
    label: stop.loadNumber ? `Load #${stop.loadNumber}` : undefined,
  }));
}

/**
 * Automatically pulls the driver's last known location.
 * Prioritizes the Destination address of their most recently 'Completed' load,
 * followed by driverProfile lastLocationCity/lastLocationState and GPS coordinates.
 */
export function getDriverLastKnownLocation(
  driver?: DriverProfile | null,
  allLoads: Load[] = [],
  activeLoad?: Load | null
): string {
  // 1. Explicit current staging location from driver profile
  if (driver?.currentStaging && driver.currentStaging.trim()) {
    return driver.currentStaging.trim();
  }

  // 2. Explicit current location from driver profile (city & state)
  if (driver?.lastLocationCity && driver?.lastLocationState) {
    return `${driver.lastLocationCity.trim()}, ${driver.lastLocationState.trim()}`;
  }
  if (driver?.lastLocationCity) {
    return driver.lastLocationCity.trim();
  }

  // 3. Explicit current GPS coordinates from driver profile
  if (typeof driver?.currentLat === 'number' && typeof driver?.currentLng === 'number' && !isNaN(driver.currentLat)) {
    return `${driver.currentLat},${driver.currentLng}`;
  }

  // 3. Destination address of their most recently 'Completed' / 'delivered' load
  const driverUid = driver?.uid || driver?.id || activeLoad?.assignedDriverId;
  if (driverUid && allLoads.length > 0) {
    const completedLoads = allLoads.filter(l => {
      if (activeLoad && l.id === activeLoad.id) return false;
      const isAssigned = l.assignedDriverId === driverUid || (l as any).driverId === driverUid;
      const statusLower = String(l.status || '').toLowerCase().trim();
      const isCompleted = statusLower === 'delivered' || statusLower === 'completed';
      return isAssigned && isCompleted;
    });

    if (completedLoads.length > 0) {
      completedLoads.sort((a, b) => {
        const timeA = new Date(a.deliveryDateTime || (a as any).lastCompletionTimestamp || a.pickupDateTime || 0).getTime();
        const timeB = new Date(b.deliveryDateTime || (b as any).lastCompletionTimestamp || b.pickupDateTime || 0).getTime();
        return timeB - timeA;
      });

      const lastDest = completedLoads[0].destination;
      const formatted = formatAddressForRoute(lastDest);
      if (formatted) return formatted;
    }
  }

  return '';
}

/**
 * Builds the sequenced route legs for a driver.
 * Injects the driver's last known location (e.g. destination of most recently completed load)
 * as the true starting point of the active route, followed by the active load pickup origin
 * and destination delivery waypoint:
 * [Driver's Last Known Location] -> [Active Load Origin (Pickup)] -> [Active Load Destination (Delivery)].
 */
export function buildDriverProgressLegs(
  activeLoad: Load,
  allLoads: Load[] = [],
  driver?: DriverProfile | null
): RouteLeg[] {
  // Group all loads in the same trip container. If no trip container exists,
  // the state must be strictly isolated to the active Dispatch ID.
  let contextLoads: Load[] = [];

  if (activeLoad.tripId && activeLoad.tripId !== 'none') {
    // Include all loads assigned to this trip container that are not yet fully completed/delivered
    contextLoads = allLoads.filter(
      l => l.tripId === activeLoad.tripId && l.status !== 'delivered' && (l.status as any) !== 'completed'
    );
  } else {
    contextLoads = [activeLoad];
  }

  if (!contextLoads.some(l => l.id === activeLoad.id)) {
    contextLoads.push(activeLoad);
  }

  const legs: RouteLeg[] = [];
  const addedLocations = new Set<string>();

  if (activeLoad.tripId && activeLoad.tripId !== 'none' && contextLoads.length > 1) {
    // Multi-stop trip container: build strict chronological / sequential stops
    const tripStops = buildChronologicalTripStops(contextLoads);
    for (const stop of tripStops) {
      const stopKey = `${stop.type}:${stop.location.toLowerCase()}`;
      if (!addedLocations.has(stopKey)) {
        legs.push({
          type: stop.type,
          location: stop.location,
          loadId: stop.loadId || activeLoad.id!,
        });
        addedLocations.add(stopKey);
      }
    }
  } else {
    const sortedLoads = sequenceLoadsLIFO(contextLoads);

    // 1. Primary Origin (Pickup) & intermediate pickups
    for (const load of sortedLoads) {
      const orig = formatAddressForRoute(load.origin);
      if (orig && !addedLocations.has(`pickup:${orig}`)) {
        legs.push({ type: 'pickup', location: orig, loadId: load.id! });
        addedLocations.add(`pickup:${orig}`);
      }
    }

    // 2. Scheduled Delivery Waypoints
    const deliveryOrder = [...sortedLoads].reverse();
    for (const load of deliveryOrder) {
      if (load.status !== 'delivered') {
        const dest = formatAddressForRoute(load.destination);
        if (dest && !addedLocations.has(`dropoff:${dest}`)) {
          legs.push({ type: 'dropoff', location: dest, loadId: load.id! });
          addedLocations.add(`dropoff:${dest}`);
        }
      }
    }
  }

  // Fallback if no legs were generated
  if (legs.length === 0) {
    const orig = formatAddressForRoute(activeLoad.origin);
    const dest = formatAddressForRoute(activeLoad.destination);
    if (orig) {
      legs.push({ type: 'pickup', location: orig, loadId: activeLoad.id! });
    }
    if (dest && dest !== orig) {
      legs.push({ type: 'dropoff', location: dest, loadId: activeLoad.id! });
    }
  }

  // 3. Inject Driver's Last Known Location as the true starting point of the active route
  const driverStartLoc = getDriverLastKnownLocation(driver, allLoads, activeLoad);
  if (driverStartLoc && legs.length > 0) {
    const cleanStart = driverStartLoc.toLowerCase().trim();
    const cleanPickup = legs[0].location.toLowerCase().trim();

    // Inject as starting point if distinct from the primary pickup origin
    if (cleanStart !== cleanPickup) {
      legs.unshift({
        type: 'pickup',
        location: driverStartLoc,
        loadId: activeLoad.id!,
        isDeadhead: true,
        label: "Driver's Last Known Location",
      });
    }
  }

  return legs;
}

// ── 3. GOOGLE MAPS URL BUILDER ────────────────────────────────────────────────

export interface ChronologicalTripStop {
  type: 'pickup' | 'dropoff';
  searchableAddress: string;
  location: string; // backwards compatibility alias for searchableAddress
  rawAddress?: Address;
  dateObj: Date;
  timestamp: number;
  dateTimeStr: string;
  loadId: string;
  loadNumber?: string;
  cargoDescription?: string;
}

/**
 * Strict pipeline for consolidated trip containers:
 * 1. Data Extraction & Normalization:
 *    For every load in the container, extract the Pickup and Delivery stops.
 *    Create a strictly formatted searchableAddress string that ONLY includes
 *    Street, City, State, and Zip (stripping company names, contact names, or prefixes).
 * 2. Chronological Sort:
 *    Sort the flattened array of stops strictly by their JavaScript Date objects (pickupDate and deliveryDate).
 * 3. Deduplication:
 *    Loop through the sorted array. If searchableAddress of current stop exactly matches
 *    searchableAddress of previous stop, remove the duplicate.
 */
export function buildChronologicalTripStops(loads: Load[]): ChronologicalTripStop[] {
  // Step 1: Data Extraction & Normalization
  const rawStops: ChronologicalTripStop[] = [];

  for (const load of loads) {
    // Skip already delivered loads if filtering for remaining transit
    const statusLower = String(load.status || '').toLowerCase().trim();
    if (statusLower === 'delivered' || statusLower === 'completed') {
      continue;
    }

    const pickupAddressStr = cleanSearchableAddress(load.origin);
    const dropoffAddressStr = cleanSearchableAddress(load.destination);

    // Support either pickupDateTime / pickupDate or deliveryDateTime / deliveryDate
    const rawPickupDate = (load as any).pickupDate || load.pickupDateTime;
    const rawDeliveryDate = (load as any).deliveryDate || load.deliveryDateTime;

    const pickupDateObj = rawPickupDate ? new Date(rawPickupDate) : new Date(0);
    const deliveryDateObj = rawDeliveryDate ? new Date(rawDeliveryDate) : new Date(0);

    const pickupTime = !isNaN(pickupDateObj.getTime()) ? pickupDateObj.getTime() : 0;
    const deliveryTime = !isNaN(deliveryDateObj.getTime()) ? deliveryDateObj.getTime() : 0;

    if (pickupAddressStr) {
      rawStops.push({
        type: 'pickup',
        searchableAddress: pickupAddressStr,
        location: pickupAddressStr,
        rawAddress: load.origin,
        dateObj: pickupDateObj,
        timestamp: pickupTime,
        dateTimeStr: String(rawPickupDate || ''),
        loadId: load.id || '',
        loadNumber: load.loadNumber,
        cargoDescription: load.cargoDescription,
      });
    }

    if (dropoffAddressStr) {
      rawStops.push({
        type: 'dropoff',
        searchableAddress: dropoffAddressStr,
        location: dropoffAddressStr,
        rawAddress: load.destination,
        dateObj: deliveryDateObj,
        timestamp: deliveryTime,
        dateTimeStr: String(rawDeliveryDate || ''),
        loadId: load.id || '',
        loadNumber: load.loadNumber,
        cargoDescription: load.cargoDescription,
      });
    }
  }

  // Step 2: Chronological Sort strictly by JavaScript Date objects
  rawStops.sort((a, b) => {
    const timeA = a.dateObj.getTime();
    const timeB = b.dateObj.getTime();
    if (timeA !== timeB) {
      // If one timestamp is 0/invalid, place the valid timestamp earlier
      if (timeA === 0 && timeB > 0) return 1;
      if (timeB === 0 && timeA > 0) return -1;
      return timeA - timeB;
    }
    // Secondary tie-breaker: Pickups precede dropoffs
    if (a.type !== b.type) {
      return a.type === 'pickup' ? -1 : 1;
    }
    return 0;
  });

  // Step 3: Deduplication
  // Loop through sorted array. If searchableAddress of current stop exactly matches previous stop, remove duplicate
  const deduplicatedStops: ChronologicalTripStop[] = [];
  for (const stop of rawStops) {
    if (deduplicatedStops.length === 0) {
      deduplicatedStops.push(stop);
      continue;
    }

    const prevStop = deduplicatedStops[deduplicatedStops.length - 1];
    const prevAddrNorm = prevStop.searchableAddress.trim().toLowerCase().replace(/\s+/g, ' ');
    const currAddrNorm = stop.searchableAddress.trim().toLowerCase().replace(/\s+/g, ' ');

    if (prevAddrNorm === currAddrNorm) {
      // Exactly matches previous stop: drop duplicate waypoint
      if (!prevStop.loadNumber && stop.loadNumber) {
        prevStop.loadNumber = stop.loadNumber;
      }
      continue;
    }

    deduplicatedStops.push(stop);
  }

  return deduplicatedStops;
}

/**
 * Step 4: URL Construction
 * Maps the final cleaned array into a Google Maps URL (https://www.google.com/maps/dir/...).
 * MUST use encodeURIComponent() on every address string before appending it to the URL with slashes.
 * Do not pass raw spaces or special characters into the URL.
 */
export function generateGoogleMapsUrl(
  stopsOrLoads: (ChronologicalTripStop | Load)[],
  driverLocation?: string
): string {
  let cleanedAddresses: string[] = [];

  // Optional driver starting location
  if (driverLocation) {
    const cleanedDriverLoc = cleanSearchableAddress(driverLocation);
    if (cleanedDriverLoc) {
      cleanedAddresses.push(cleanedDriverLoc);
    }
  }

  if (stopsOrLoads.length > 0) {
    // Check if input is Load[] or ChronologicalTripStop[]
    const isLoadArray = 'origin' in stopsOrLoads[0] || 'destination' in stopsOrLoads[0];
    const stops: ChronologicalTripStop[] = isLoadArray
      ? buildChronologicalTripStops(stopsOrLoads as Load[])
      : (stopsOrLoads as ChronologicalTripStop[]);

    for (const stop of stops) {
      const addr = stop.searchableAddress?.trim() || stop.location?.trim();
      if (!addr) continue;

      // Ensure no back-to-back duplicate with driverLocation or previous address
      if (cleanedAddresses.length > 0) {
        const lastNorm = cleanedAddresses[cleanedAddresses.length - 1].toLowerCase().replace(/\s+/g, ' ');
        const curNorm = addr.toLowerCase().replace(/\s+/g, ' ');
        if (lastNorm === curNorm) {
          continue;
        }
      }
      cleanedAddresses.push(addr);
    }
  }

  if (cleanedAddresses.length === 0) {
    return 'https://www.google.com/maps';
  }

  if (cleanedAddresses.length === 1) {
    return `https://www.google.com/maps/dir/${encodeURIComponent(cleanedAddresses[0])}`;
  }

  // Map each address string strictly through encodeURIComponent() and join with slashes
  const encodedPath = cleanedAddresses.map(addr => encodeURIComponent(addr)).join('/');
  return `https://www.google.com/maps/dir/${encodedPath}`;
}

/**
 * Backward compatibility alias for generateGoogleMapsUrl
 */
export function buildChronologicalTripGoogleMapsUrl(
  loads: Load[],
  driverLocation?: string
): string {
  return generateGoogleMapsUrl(loads, driverLocation);
}

export function getGoogleMapsUrl(legs: RouteLeg[]): string {
  if (legs.length === 0) return 'https://www.google.com/maps';
  const cleanAddrs = legs.map(l => cleanSearchableAddress(l.location)).filter(Boolean);
  if (cleanAddrs.length === 0) return 'https://www.google.com/maps';
  const encodedPath = cleanAddrs.map(a => encodeURIComponent(a)).join('/');
  return `https://www.google.com/maps/dir/${encodedPath}`;
}

export function getNavigateToUrl(addr: Address): string {
  const clean = cleanSearchableAddress(addr);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(clean)}&travelmode=driving`;
}

/**
 * Navigation Destination Info for a Load
 */
export interface NextStopDestination {
  type: 'pickup' | 'delivery';
  label: string; // e.g. "Navigate to Pickup" or "Navigate to Delivery"
  shortLabel: string; // e.g. "To Pickup" or "To Delivery"
  fullLabel: string; // e.g. "Navigate to Pickup (Dallas, TX)"
  address?: Address;
  cleanAddress: string;
  cityState: string;
  isCompleted: boolean;
}

/**
 * Returns the logical next stop for a load based on its current status.
 * - dispatched, pending, client-request-approved, approved, arrived-origin, loading: PICKUP (origin)
 * - in-transit, arrived, arrived-destination, unloading, waiting, etc.: DELIVERY (destination)
 */
export function getNextStopForLoad(load: Load): NextStopDestination {
  const status = (load.status || '').toLowerCase().trim();

  // Load has not yet departed origin:
  const isPickupPhase = [
    'dispatched',
    'pending',
    'client-request-approved',
    'approved',
    'arrived-origin',
    'loading',
  ].includes(status);

  if (isPickupPhase) {
    const cityState = [load.origin?.city, load.origin?.state].filter(Boolean).join(', ');
    const cleanAddr = cleanSearchableAddress(load.origin);
    return {
      type: 'pickup',
      label: 'Navigate to Pickup',
      shortLabel: 'To Pickup',
      fullLabel: cityState ? `Navigate to Pickup (${cityState})` : 'Navigate to Pickup',
      address: load.origin,
      cleanAddress: cleanAddr,
      cityState: cityState || 'Pickup Location',
      isCompleted: false,
    };
  }

  // In-transit or arrived at destination:
  const isDelivered = status === 'delivered' || status === 'completed';
  const cityState = [load.destination?.city, load.destination?.state].filter(Boolean).join(', ');
  const cleanAddr = cleanSearchableAddress(load.destination);
  return {
    type: 'delivery',
    label: 'Navigate to Delivery',
    shortLabel: 'To Delivery',
    fullLabel: cityState ? `Navigate to Delivery (${cityState})` : 'Navigate to Delivery',
    address: load.destination,
    cleanAddress: cleanAddr,
    cityState: cityState || 'Delivery Location',
    isCompleted: isDelivered,
  };
}

/**
 * Generates a Google Maps directions URL to a single destination stop.
 * Crucially: Omitting 'origin' causes Google Maps on mobile (app & browser)
 * to automatically start directions from the driver's current device GPS ("Your location").
 * If userCoordinates { lat, lng } are explicitly provided, they are included.
 */
export function getNextStopGoogleMapsUrl(
  destination: string | Address,
  userCoordinates?: { lat: number; lng: number } | null
): string {
  const cleanDest = cleanSearchableAddress(destination);
  if (!cleanDest) return 'https://www.google.com/maps';

  const destEncoded = encodeURIComponent(cleanDest);

  if (userCoordinates && typeof userCoordinates.lat === 'number' && typeof userCoordinates.lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&origin=${userCoordinates.lat},${userCoordinates.lng}&destination=${destEncoded}&travelmode=driving`;
  }

  // Omit origin: Google Maps natively defaults to device GPS / "Your location"
  return `https://www.google.com/maps/dir/?api=1&destination=${destEncoded}&travelmode=driving`;
}

/**
 * Generates an Apple Maps directions URL for iOS / macOS devices.
 * Uses daddr (destination address) and dirflg=d (driving directions).
 * Apple Maps automatically routes from the device's Current Location to daddr.
 */
export function getNextStopAppleMapsUrl(destination: string | Address): string {
  const cleanDest = cleanSearchableAddress(destination);
  if (!cleanDest) return 'https://maps.apple.com';
  return `https://maps.apple.com/?daddr=${encodeURIComponent(cleanDest)}&dirflg=d`;
}

/**
 * Generates a Google Maps URL for all remaining stops of an active load or trip.
 * Skips already completed stops (e.g. if load is in-transit, pickup is omitted).
 * Omits 'origin' so Google Maps starts from the driver's current device GPS.
 */
export function getFullRemainingRouteGoogleMapsUrl(
  load: Load,
  allLoads: Load[] = [],
  driver?: DriverProfile | null,
  userCoordinates?: { lat: number; lng: number } | null
): string {
  // If part of a multi-stop trip with multiple loads:
  if (load.tripId && load.tripId !== 'none') {
    const tripLoads = allLoads.filter(l => l.tripId === load.tripId && l.status !== 'delivered');
    if (tripLoads.length > 1) {
      const stops = buildChronologicalTripStops(tripLoads);
      // Filter out completed stops
      const remainingStops = stops.filter(stop => {
        const matched = tripLoads.find(l => l.id === stop.loadId);
        if (!matched) return true;
        const s = String(matched.status || '').toLowerCase();
        if (stop.type === 'pickup') {
          return !['loading', 'in-transit', 'arrived-destination', 'unloading', 'delivered', 'completed'].includes(s);
        }
        return s !== 'delivered' && s !== 'completed';
      });

      if (remainingStops.length === 0) return 'https://www.google.com/maps';
      if (remainingStops.length === 1) {
        return getNextStopGoogleMapsUrl(remainingStops[0].searchableAddress, userCoordinates);
      }

      const finalStop = remainingStops[remainingStops.length - 1].searchableAddress;
      const intermediateWaypoints = remainingStops
        .slice(0, -1)
        .map(s => s.searchableAddress)
        .filter(Boolean)
        .join('|');

      const originParam = userCoordinates 
        ? `&origin=${userCoordinates.lat},${userCoordinates.lng}` 
        : '';

      return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(finalStop)}&waypoints=${encodeURIComponent(intermediateWaypoints)}&travelmode=driving`;
    }
  }

  // Standalone load:
  const status = (load.status || '').toLowerCase().trim();
  const isPickupPhase = [
    'dispatched',
    'pending',
    'client-request-approved',
    'approved',
    'arrived-origin',
    'loading',
  ].includes(status);

  const cleanDest = cleanSearchableAddress(load.destination);
  const cleanOrig = cleanSearchableAddress(load.origin);

  const originParam = userCoordinates 
    ? `&origin=${userCoordinates.lat},${userCoordinates.lng}` 
    : '';

  // If in pickup phase, remaining route is: Live GPS -> Pickup -> Delivery
  if (isPickupPhase && cleanOrig && cleanDest) {
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(cleanDest)}&waypoints=${encodeURIComponent(cleanOrig)}&travelmode=driving`;
  }

  // If already loaded / in-transit, pickup is done! Remaining route is just Live GPS -> Delivery
  if (cleanDest) {
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(cleanDest)}&travelmode=driving`;
  }

  return 'https://www.google.com/maps';
}

/**
 * Helper to detect iOS device (iPhone, iPad, iPod)
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (typeof navigator.platform === 'string' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

/**
 * Generates a Google Maps navigation URL following the explicit sequence.
 * Prefers live device GPS (omits origin) unless driver location is explicitly provided.
 */
export function getDriverProgressRouteUrl(
  activeLoad: Load,
  allLoads: Load[] = [],
  driver?: DriverProfile | null,
  userCoordinates?: { lat: number; lng: number } | null
): string {
  return getFullRemainingRouteGoogleMapsUrl(activeLoad, allLoads, driver, userCoordinates);
}

// ── 4. MILEAGE ESTIMATION — OSRM + Haversine fallback ─────────────────────────

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export type Coordinates = {
  lat: number;
  lng: number;
};

export type EstimatedLocationInfo = {
  coordinates: Coordinates;
  originCoordinates: Coordinates;
  destCoordinates: Coordinates;
  progressPercentage: number;
  interpolatedLat: number;
  interpolatedLng: number;
  googleMapsPinUrl: string;
  googleMapsNavUrl: string;
  googleMapsRouteUrl: string;
  osmEmbedUrl: string;
  formattedCoordinates: string;
  source: 'driver_gps' | 'interpolated' | 'fallback';
};

export const US_STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  al: { lat: 32.806671, lng: -86.79113 },
  ak: { lat: 61.370716, lng: -152.404419 },
  az: { lat: 33.729759, lng: -111.431221 },
  ar: { lat: 34.969704, lng: -92.373123 },
  ca: { lat: 36.116203, lng: -119.681564 },
  co: { lat: 39.059811, lng: -105.311104 },
  ct: { lat: 41.597782, lng: -72.755371 },
  de: { lat: 39.318523, lng: -75.507141 },
  fl: { lat: 27.766279, lng: -81.686783 },
  ga: { lat: 33.040619, lng: -83.643074 },
  hi: { lat: 21.094318, lng: -157.498337 },
  id: { lat: 44.240459, lng: -114.478828 },
  il: { lat: 40.349457, lng: -88.986137 },
  in: { lat: 39.849426, lng: -86.258278 },
  ia: { lat: 42.011539, lng: -93.210526 },
  ks: { lat: 38.5266, lng: -96.726486 },
  ky: { lat: 37.66814, lng: -84.670067 },
  la: { lat: 31.169546, lng: -91.867805 },
  me: { lat: 44.693947, lng: -69.381927 },
  md: { lat: 39.063946, lng: -76.802101 },
  ma: { lat: 42.230171, lng: -71.530106 },
  mi: { lat: 43.326618, lng: -84.536095 },
  mn: { lat: 45.694454, lng: -93.900192 },
  ms: { lat: 32.741646, lng: -89.678696 },
  mo: { lat: 38.456085, lng: -92.288368 },
  mt: { lat: 46.921925, lng: -110.454353 },
  ne: { lat: 41.12537, lng: -98.268082 },
  nv: { lat: 38.313515, lng: -117.055374 },
  nh: { lat: 43.452492, lng: -71.563896 },
  nj: { lat: 40.298904, lng: -74.521011 },
  nm: { lat: 34.840515, lng: -106.248482 },
  ny: { lat: 42.165726, lng: -74.948051 },
  nc: { lat: 35.630066, lng: -79.806419 },
  nd: { lat: 47.528912, lng: -99.784012 },
  oh: { lat: 40.388783, lng: -82.764915 },
  ok: { lat: 35.565342, lng: -96.928917 },
  or: { lat: 44.572021, lng: -122.070938 },
  pa: { lat: 40.590752, lng: -77.209755 },
  ri: { lat: 41.680893, lng: -71.51178 },
  sc: { lat: 33.856892, lng: -80.945007 },
  sd: { lat: 44.299782, lng: -99.438828 },
  tn: { lat: 35.747845, lng: -86.692345 },
  tx: { lat: 31.054487, lng: -97.563461 },
  ut: { lat: 40.150032, lng: -111.862434 },
  vt: { lat: 44.045876, lng: -72.710686 },
  va: { lat: 37.769337, lng: -78.169968 },
  wa: { lat: 47.400902, lng: -121.490494 },
  wv: { lat: 38.491226, lng: -80.954453 },
  wi: { lat: 44.268543, lng: -89.616508 },
  wy: { lat: 42.755966, lng: -107.30249 },
};

export const KNOWN_US_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  // Illinois / Midwest Hubs
  'marengo, il': { lat: 42.24905, lng: -88.62152 },
  'joliet, il': { lat: 41.5250, lng: -88.0817 },
  'chicago, il': { lat: 41.8781, lng: -87.6298 },
  'peoria, il': { lat: 40.6936, lng: -89.5890 },
  'rockford, il': { lat: 42.2711, lng: -89.0940 },
  'springfield, il': { lat: 39.7817, lng: -89.6501 },
  'naperville, il': { lat: 41.7508, lng: -88.1535 },
  'aurora, il': { lat: 41.7606, lng: -88.3201 },
  'elgin, il': { lat: 42.0354, lng: -88.2826 },
  'quad cities, il': { lat: 41.5067, lng: -90.5151 },
  'moline, il': { lat: 41.5067, lng: -90.5151 },

  // Nebraska / Iowa Corridor Hubs
  'grand island, ne': { lat: 40.9264, lng: -98.3420 },
  'lincoln, ne': { lat: 40.8136, lng: -96.7026 },
  'kearney, ne': { lat: 40.6995, lng: -99.0815 },
  'davenport, ia': { lat: 41.5236, lng: -90.5776 },
  'cedar rapids, ia': { lat: 41.9779, lng: -91.6656 },
  'iowa city, ia': { lat: 41.6611, lng: -91.5302 },

  // West Virginia Corridor
  'morgantown, wv': { lat: 39.6295, lng: -79.9559 },
  'oak hill, wv': { lat: 37.9723, lng: -81.1487 },
  'charleston, wv': { lat: 38.3498, lng: -81.6326 },
  'beckley, wv': { lat: 37.7782, lng: -81.1882 },
  'fairmont, wv': { lat: 39.4851, lng: -80.1440 },
  'clarksburg, wv': { lat: 39.2806, lng: -80.3445 },
  'sutton, wv': { lat: 38.6645, lng: -80.7093 },
  'flatwoods, wv': { lat: 38.7209, lng: -80.6526 },
  'bluefield, wv': { lat: 37.2698, lng: -81.2223 },
  'wheeling, wv': { lat: 40.0640, lng: -80.7209 },
  'huntington, wv': { lat: 38.4192, lng: -82.4452 },
  'parkersburg, wv': { lat: 39.2667, lng: -81.5615 },
  'fayetteville, wv': { lat: 38.0515, lng: -81.1043 },

  // South Carolina / North Carolina Hubs
  'kershaw, sc': { lat: 34.5496, lng: -80.5842 },
  'charlotte, nc': { lat: 35.2271, lng: -80.8431 },
  'columbia, sc': { lat: 34.0007, lng: -81.0348 },
  'rock hill, sc': { lat: 34.9249, lng: -81.0259 },
  'lancaster, sc': { lat: 34.7204, lng: -80.7709 },
  'greenville, sc': { lat: 34.8526, lng: -82.3940 },
  'spartanburg, sc': { lat: 34.9496, lng: -81.9321 },
  'charleston, sc': { lat: 32.7765, lng: -79.9311 },
  'myrtle beach, sc': { lat: 33.6891, lng: -78.8867 },
  'florence, sc': { lat: 34.1954, lng: -79.7626 },
  'raleigh, nc': { lat: 35.7796, lng: -78.6382 },
  'greensboro, nc': { lat: 36.0726, lng: -79.7920 },
  'winston-salem, nc': { lat: 36.0999, lng: -80.2442 },
  'asheville, nc': { lat: 35.5951, lng: -82.5515 },
  'wilmington, nc': { lat: 34.2257, lng: -77.9447 },

  // Virginia Hubs
  'wytheville, va': { lat: 36.9490, lng: -81.0845 },
  'richmond, va': { lat: 37.5407, lng: -77.4360 },
  'roanoke, va': { lat: 37.2710, lng: -79.9414 },
  'norfolk, va': { lat: 36.8508, lng: -76.2859 },
  'virginia beach, va': { lat: 36.8529, lng: -75.9780 },
  'lynchburg, va': { lat: 37.4138, lng: -79.1422 },

  // Ohio & Indiana & Kentucky
  'columbus, oh': { lat: 39.9612, lng: -82.9988 },
  'cleveland, oh': { lat: 41.4993, lng: -81.6944 },
  'cincinnati, oh': { lat: 39.1031, lng: -84.5120 },
  'dayton, oh': { lat: 39.7589, lng: -84.1916 },
  'akron, oh': { lat: 41.0814, lng: -81.5190 },
  'toledo, oh': { lat: 41.6528, lng: -83.5379 },
  'indianapolis, in': { lat: 39.7684, lng: -86.1581 },
  'fort wayne, in': { lat: 41.0793, lng: -85.1394 },
  'south bend, in': { lat: 41.6764, lng: -86.2520 },
  'louisville, ky': { lat: 38.2527, lng: -85.7585 },
  'lexington, ky': { lat: 38.0406, lng: -84.5037 },
  'bowling green, ky': { lat: 36.9685, lng: -86.4808 },

  // Pennsylvania & Mid-Atlantic
  'pittsburgh, pa': { lat: 40.4406, lng: -79.9959 },
  'philadelphia, pa': { lat: 39.9526, lng: -75.1652 },
  'harrisburg, pa': { lat: 40.2732, lng: -76.8867 },
  'allentown, pa': { lat: 40.6023, lng: -75.4714 },
  'erie, pa': { lat: 42.1292, lng: -80.0851 },
  'baltimore, md': { lat: 39.2904, lng: -76.6122 },
  'washington, dc': { lat: 38.9072, lng: -77.0369 },

  // Southeast & Florida
  'atlanta, ga': { lat: 33.7490, lng: -84.3880 },
  'savannah, ga': { lat: 32.0809, lng: -81.0912 },
  'augusta, ga': { lat: 33.4735, lng: -82.0105 },
  'macon, ga': { lat: 32.8407, lng: -83.6324 },
  'jacksonville, fl': { lat: 30.3322, lng: -81.6557 },
  'orlando, fl': { lat: 28.5383, lng: -81.3792 },
  'tampa, fl': { lat: 27.9506, lng: -82.4572 },
  'miami, fl': { lat: 25.7617, lng: -80.1918 },
  'tallahassee, fl': { lat: 30.4383, lng: -84.2807 },

  // Tennessee & Alabama & Mississippi & Louisiana
  'knoxville, tn': { lat: 35.9606, lng: -83.9207 },
  'nashville, tn': { lat: 36.1627, lng: -86.7816 },
  'memphis, tn': { lat: 35.1495, lng: -90.0490 },
  'chattanooga, tn': { lat: 35.0456, lng: -85.3097 },
  'birmingham, al': { lat: 33.5186, lng: -86.8104 },
  'mobile, al': { lat: 30.6954, lng: -88.0399 },
  'montgomery, al': { lat: 32.3792, lng: -86.3077 },
  'huntsville, al': { lat: 34.7304, lng: -86.5861 },
  'jackson, ms': { lat: 32.2988, lng: -90.1848 },
  'new orleans, la': { lat: 29.9511, lng: -90.0715 },
  'baton rouge, la': { lat: 30.4515, lng: -91.1871 },
  'shreveport, la': { lat: 32.5252, lng: -93.7502 },

  // Texas & Oklahoma & Arkansas
  'dallas, tx': { lat: 32.7767, lng: -96.7970 },
  'fort worth, tx': { lat: 32.7555, lng: -97.3308 },
  'houston, tx': { lat: 29.7604, lng: -95.3698 },
  'austin, tx': { lat: 30.2672, lng: -97.7431 },
  'san antonio, tx': { lat: 29.4241, lng: -98.4936 },
  'el paso, tx': { lat: 31.7619, lng: -106.4850 },
  'texarkana, tx': { lat: 33.4251, lng: -94.0477 },
  'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
  'tulsa, ok': { lat: 36.1540, lng: -95.9928 },
  'little rock, ar': { lat: 34.7465, lng: -92.2896 },

  // Midwest & Plains & Mountain & West
  'st. louis, mo': { lat: 38.6270, lng: -90.1994 },
  'saint louis, mo': { lat: 38.6270, lng: -90.1994 },
  'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
  'detroit, mi': { lat: 42.3314, lng: -83.0458 },
  'grand rapids, mi': { lat: 42.9634, lng: -85.6681 },
  'milwaukee, wi': { lat: 43.0389, lng: -87.9065 },
  'madison, wi': { lat: 43.0731, lng: -89.4012 },
  'minneapolis, mn': { lat: 44.9778, lng: -93.2650 },
  'des moines, ia': { lat: 41.5868, lng: -93.6250 },
  'omaha, ne': { lat: 41.2565, lng: -95.9345 },
  'denver, co': { lat: 39.7392, lng: -104.9903 },
  'colorado springs, co': { lat: 38.8339, lng: -104.8214 },
  'salt lake city, ut': { lat: 40.7608, lng: -111.8910 },
  'phoenix, az': { lat: 33.4484, lng: -112.0740 },
  'tucson, az': { lat: 32.2226, lng: -110.9747 },
  'las vegas, nv': { lat: 36.1699, lng: -115.1398 },
  'reno, nv': { lat: 39.5296, lng: -119.8138 },
  'albuquerque, nm': { lat: 35.0844, lng: -106.6504 },
  // California Cities & Freight Hubs
  'long beach, ca': { lat: 33.7701, lng: -118.1937 },
  'long beach, california': { lat: 33.7701, lng: -118.1937 },
  'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
  'los angeles, california': { lat: 34.0522, lng: -118.2437 },
  'ontario, ca': { lat: 34.0633, lng: -117.6509 },
  'san bernardino, ca': { lat: 34.1083, lng: -117.2898 },
  'riverside, ca': { lat: 33.9806, lng: -117.3755 },
  'anaheim, ca': { lat: 33.8366, lng: -117.9143 },
  'irvine, ca': { lat: 33.6846, lng: -117.8265 },
  'santa ana, ca': { lat: 33.7455, lng: -117.8677 },
  'fontana, ca': { lat: 34.0922, lng: -117.4350 },
  'bakersfield, ca': { lat: 35.3733, lng: -119.0187 },
  'fresno, ca': { lat: 36.7468, lng: -119.7726 },
  'stockton, ca': { lat: 37.9577, lng: -121.2908 },
  'oakland, ca': { lat: 37.8044, lng: -122.2712 },
  'san francisco, ca': { lat: 37.7749, lng: -122.4194 },
  'san jose, ca': { lat: 37.3382, lng: -121.8863 },
  'san diego, ca': { lat: 32.7157, lng: -117.1611 },
  'sacramento, ca': { lat: 38.5816, lng: -121.4944 },
  'portland, or': { lat: 45.5152, lng: -122.6784 },
  'seattle, wa': { lat: 47.6062, lng: -122.3321 },
};

export const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co',
  connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
  illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la',
  maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn',
  mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or',
  pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd',
  tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa',
  'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
};

/**
 * Extracts normalized city, state, and optional zip code from diverse address formats:
 * - "123 Main St, Joliet, IL, 60436"
 * - "500 S Michigan Ave, Chicago, IL 60605"
 * - "Long Beach, California"
 * - "Joliet, IL"
 * - "Chicago, IL 60601"
 */
export function extractCityStateFromAddress(rawLocation: string): { city: string; state: string; zip?: string } {
  if (!rawLocation) return { city: '', state: '' };

  const trimmed = rawLocation.trim();
  const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);

  if (parts.length === 1) {
    const single = parts[0];
    const match = single.match(/^(.+?)\s+([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
    if (match) {
      return { city: match[1].toLowerCase().trim(), state: match[2].toLowerCase(), zip: match[3] };
    }
    // Check if single string contains city and full state name
    const lowerSingle = single.toLowerCase();
    for (const [name, abbr] of Object.entries(US_STATE_NAME_TO_ABBR)) {
      if (lowerSingle.endsWith(name)) {
        const c = lowerSingle.slice(0, -name.length).replace(/,$/, '').trim();
        if (c) return { city: c, state: abbr };
      }
    }
    return { city: single.toLowerCase().trim(), state: '' };
  }

  let state = '';
  let city = '';
  let zip = '';

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    if (/^\d{5}(-\d{4})?$/.test(part)) {
      zip = part;
      continue;
    }
    const stateZipMatch = part.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      state = stateZipMatch[1].toLowerCase();
      zip = stateZipMatch[2];
      if (i > 0) {
        city = parts[i - 1].toLowerCase().replace(/^(suite|apt|ste|unit|#)\s*\w+/i, '').trim();
      }
      return { city, state, zip };
    }
    const lowerPart = part.toLowerCase();
    if (/^[A-Za-z]{2}$/.test(part) && !state) {
      state = lowerPart;
      if (i > 0) {
        city = parts[i - 1].toLowerCase().replace(/^(suite|apt|ste|unit|#)\s*\w+/i, '').trim();
      }
      return { city, state, zip };
    }
    if (US_STATE_NAME_TO_ABBR[lowerPart] && !state) {
      state = US_STATE_NAME_TO_ABBR[lowerPart];
      if (i > 0) {
        city = parts[i - 1].toLowerCase().replace(/^(suite|apt|ste|unit|#)\s*\w+/i, '').trim();
      }
      return { city, state, zip };
    }
  }

  // Fallback
  let last = parts[parts.length - 1]?.trim() || '';
  let secondLast = parts.length >= 2 ? parts[parts.length - 2]?.trim() : '';
  if (/^\d{5}/.test(last) && parts.length >= 3) {
    last = parts[parts.length - 2]?.trim();
    secondLast = parts[parts.length - 3]?.trim();
  }
  const stateTokens = last.split(' ').filter(Boolean);
  const rawStateToken = (stateTokens[0] || '').toLowerCase();
  state = US_STATE_NAME_TO_ABBR[rawStateToken] || rawStateToken;
  city = secondLast.toLowerCase().replace(/^(suite|apt|ste|unit|#)\s*\w+/i, '').trim();

  return { city, state, zip };
}

/**
 * Resolves latitude and longitude coordinates from a location string, address,
 * explicit coordinate pair, known city/state dictionary, or state centroid.
 */
export function resolveCoordinates(city: string, state?: string): Coordinates {
  return resolveLocationCoordinates(state ? `${city}, ${state}` : city);
}

export function resolveLocationCoordinates(rawLocation: string): Coordinates {
  if (!rawLocation) return { lat: 39.8283, lng: -98.5795 }; // US center fallback

  const trimmed = rawLocation.trim();

  // 1. Direct coordinate format: "39.6295, -79.9559" or "GPS (39.63, -79.96)"
  const coordMatch = trimmed.match(/(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[3]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= 18 && lat <= 72 && lng >= -170 && lng <= -60) {
      return { lat, lng };
    }
  }

  // 2. Structured address extraction
  const { city, state } = extractCityStateFromAddress(trimmed);

  if (city && state) {
    const key = `${city}, ${state}`;
    if (KNOWN_US_LOCATIONS[key]) {
      return KNOWN_US_LOCATIONS[key];
    }
  }

  // 3. Known locations substring match with state boundary guard
  const lowerRaw = trimmed.toLowerCase();
  
  // Pass 1: Strict substring match requiring both city and state abbreviation
  for (const [k, coord] of Object.entries(KNOWN_US_LOCATIONS)) {
    const [kCity, kState] = k.split(',').map(s => s.trim());
    if (lowerRaw.includes(kCity) && (lowerRaw.includes(kState) || (state && kState === state))) {
      return coord;
    }
  }

  // Pass 2: Fallback to city-only match if state wasn't explicitly mentioned
  for (const [k, coord] of Object.entries(KNOWN_US_LOCATIONS)) {
    const kCity = k.split(',')[0].trim();
    if (lowerRaw.includes(kCity)) {
      return coord;
    }
  }

  // 5. State centroid fallback
  if (state && US_STATE_CENTROIDS[state]) {
    return US_STATE_CENTROIDS[state];
  }

  // 6. Substring check for full state names or abbreviations
  for (const [name, abbr] of Object.entries(US_STATE_NAME_TO_ABBR)) {
    if (lowerRaw.includes(name) && US_STATE_CENTROIDS[abbr]) {
      return US_STATE_CENTROIDS[abbr];
    }
  }

  for (const [st, centroid] of Object.entries(US_STATE_CENTROIDS)) {
    const pattern = new RegExp(`\\b${st}\\b`, 'i');
    if (pattern.test(lowerRaw)) {
      return centroid;
    }
  }

  return { lat: 39.8283, lng: -98.5795 };
}

/**
 * Builds an OpenStreetMap embed iframe URL with a bounding box and marker pin.
 */
export function buildOsmEmbedUrl(lat: number, lng: number, orig?: Coordinates, dest?: Coordinates): string {
  const lats = [lat, orig?.lat, dest?.lat].filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const lngs = [lng, orig?.lng, dest?.lng].filter((v): v is number => typeof v === 'number' && !isNaN(v));

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latSpan = Math.max(0.4, (maxLat - minLat) * 1.35);
  const lngSpan = Math.max(0.4, (maxLng - minLng) * 1.35);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  const boxMinLng = (centerLng - lngSpan / 2).toFixed(4);
  const boxMinLat = (centerLat - latSpan / 2).toFixed(4);
  const boxMaxLng = (centerLng + lngSpan / 2).toFixed(4);
  const boxMaxLat = (centerLat + latSpan / 2).toFixed(4);

  return `https://www.openstreetmap.org/export/embed.html?bbox=${boxMinLng}%2C${boxMinLat}%2C${boxMaxLng}%2C${boxMaxLat}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;
}

/**
 * Calculates the estimated real-time coordinates of a driver along their active leg
 * based on leg progress percentage, correctly interpolating along the actual path between
 * the active leg's origin (e.g. starting yard or prior stop) and destination waypoint.
 */
export function calculateEstimatedDriverLocation(
  fromLocation: string,
  toLocation: string,
  progressFraction: number,
  driverCurrentLat?: number | null,
  driverCurrentLng?: number | null,
  overrideOrigCoords?: Coordinates | null,
  overrideDestCoords?: Coordinates | null
): EstimatedLocationInfo {
  const normFraction = Math.max(0, Math.min(1, isNaN(progressFraction) ? 0 : progressFraction));
  const origCoord = (overrideOrigCoords && typeof overrideOrigCoords.lat === 'number' && !isNaN(overrideOrigCoords.lat))
    ? overrideOrigCoords
    : resolveLocationCoordinates(fromLocation);
  const destCoord = (overrideDestCoords && typeof overrideDestCoords.lat === 'number' && !isNaN(overrideDestCoords.lat))
    ? overrideDestCoords
    : resolveLocationCoordinates(toLocation);

  // If driver has verified live GPS or explicit profile coordinates, use them directly
  const hasDirectCoords = typeof driverCurrentLat === 'number' && typeof driverCurrentLng === 'number' &&
    !isNaN(driverCurrentLat) && !isNaN(driverCurrentLng) &&
    (driverCurrentLat !== 0 || driverCurrentLng !== 0) &&
    !(Math.abs(driverCurrentLat - 39.8283) < 0.001 && Math.abs(driverCurrentLng - (-98.5795)) < 0.001);

  // Linear interpolation along the active leg corridor between origin and destination
  const lat = hasDirectCoords ? driverCurrentLat : (origCoord.lat + (destCoord.lat - origCoord.lat) * normFraction);
  const lng = hasDirectCoords ? driverCurrentLng : (origCoord.lng + (destCoord.lng - origCoord.lng) * normFraction);
  const roundedLat = parseFloat(lat.toFixed(5));
  const roundedLng = parseFloat(lng.toFixed(5));
  const formatted = `${Math.abs(roundedLat).toFixed(4)}° ${roundedLat >= 0 ? 'N' : 'S'}, ${Math.abs(roundedLng).toFixed(4)}° ${roundedLng >= 0 ? 'E' : 'W'}`;

  // ── Google Maps URL Builders ────────────────────────────────────────────────
  // All URLs use lat/lng coordinates for origin and destination so that Maps
  // renders the full corridor route rather than a dropped pin in an arbitrary region.

  // Origin and destination as URI-encoded address strings to ensure Google Maps uses the exact location names
  // rather than reverse-geocoding approximated state-centroid coordinates (e.g. Asheboro, NC or Heyworth, IL)
  const encodedOrigin = encodeURIComponent(fromLocation);
  const encodedDest = encodeURIComponent(toLocation);
  
  // Driver's interpolated live position remains a precise GPS coordinate pair
  const currentLatLng = `${roundedLat},${roundedLng}`;

  // "Open in Google Maps" — full leg Directions URL: origin → destination,
  // with driver's position as a waypoint for complete consistency across all map buttons
  const googleMapsPinUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDest}&waypoints=${currentLatLng}&travelmode=driving`;

  // "Navigate from Current Location" — retain original origin and destination to preserve corridor,
  // but inject the driver's current position as a waypoint to center the map and drop a pin on the progress point
  const googleMapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDest}&waypoints=${currentLatLng}&travelmode=driving`;

  // "Full Leg Route" — full leg using exact address strings for origin and destination,
  // with driver's current position as an intermediate waypoint for corridor context
  const googleMapsRouteUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDest}&waypoints=${currentLatLng}&travelmode=driving`;

  return {
    coordinates: { lat: roundedLat, lng: roundedLng },
    originCoordinates: origCoord,
    destCoordinates: destCoord,
    progressPercentage: Math.round(normFraction * 100),
    interpolatedLat: roundedLat,
    interpolatedLng: roundedLng,
    googleMapsPinUrl,
    googleMapsNavUrl,
    googleMapsRouteUrl,
    osmEmbedUrl: buildOsmEmbedUrl(roundedLat, roundedLng, origCoord, destCoord),
    formattedCoordinates: formatted,
    source: 'interpolated',
  };
}

function cleanCityAndState(rawCity: string, rawState: string): { city: string; state: string } {
  let c = (rawCity || '').trim();
  let s = (rawState || '').trim();

  if (c.includes(',')) {
    const parts = c.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      c = parts[parts.length - 1];
    }
  }

  if (s.includes(' ')) {
    s = s.split(' ')[0].trim();
  }

  c = c.replace(/^(suite|apt|ste|unit|#)\s*\w+/i, '').trim();

  return { city: c, state: s };
}

async function geocodeCityState(rawCity: string, rawState: string): Promise<{ lat: number; lng: number } | null> {
  const { city, state } = cleanCityAndState(rawCity, rawState);
  const key = `${city.toLowerCase()}, ${state.toLowerCase()}`;
  if (KNOWN_US_LOCATIONS[key]) {
    return KNOWN_US_LOCATIONS[key];
  }

  try {
    const q = encodeURIComponent(`${city}, ${state}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=us&limit=1&format=json`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PayloadLogic/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    // Sanity check: Continental USA latitudes ~24° to 50°, longitudes -125° to -66°
    if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type MileageResult = {
  distanceMiles: number;
  durationMinutes: number;
  source: 'osrm' | 'haversine';
};

export async function estimateMileage(
  originCity: string, originState: string,
  destCity: string, destState: string,
): Promise<MileageResult> {
  try {
    const [orig, dest] = await Promise.all([
      geocodeCityState(originCity, originState),
      geocodeCityState(destCity, destState),
    ]);
    if (!orig || !dest) throw new Error('geocode failed');
    const url = `${OSRM_BASE}/${orig.lng},${orig.lat};${dest.lng},${dest.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('osrm unavailable');
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      const r = data.routes[0];
      return { distanceMiles: parseFloat((r.distance / 1609.34).toFixed(1)), durationMinutes: Math.round(r.duration / 60), source: 'osrm' };
    }
    throw new Error('no route');
  } catch {
    try {
      const [orig, dest] = await Promise.all([
        geocodeCityState(originCity, originState),
        geocodeCityState(destCity, destState),
      ]);
      if (orig && dest) {
        const d = haversineDistanceMiles(orig.lat, orig.lng, dest.lat, dest.lng) * 1.25;
        return { distanceMiles: parseFloat(d.toFixed(1)), durationMinutes: Math.round((d / 55) * 60), source: 'haversine' };
      }
    } catch { /* */ }
    return { distanceMiles: 0, durationMinutes: 0, source: 'haversine' };
  }
}

export async function estimateMultiStopMileage(loads: Load[]): Promise<MileageResult> {
  if (loads.length === 0) return { distanceMiles: 0, durationMinutes: 0, source: 'haversine' };
  if (loads.length === 1) {
    return estimateMileage(loads[0].origin.city, loads[0].origin.state, loads[0].destination.city, loads[0].destination.state);
  }

  // Build ordered list of all stops (Pickups in LIFO sequence -> Deliveries in reverse LIFO)
  const orderedLegs = buildMultiStopLegs(loads);
  if (orderedLegs.length <= 1) {
    return estimateMileage(loads[0].origin.city, loads[0].origin.state, loads[0].destination.city, loads[0].destination.state);
  }

  let totalMiles = 0;
  let totalMinutes = 0;
  let anyOsrm = false;

  for (let i = 0; i < orderedLegs.length - 1; i++) {
    const fromAddr = orderedLegs[i].location;
    const toAddr = orderedLegs[i + 1].location;

    const fromParts = fromAddr.split(',').map(p => p.trim());
    const toParts = toAddr.split(',').map(p => p.trim());

    const fromCity = fromParts.length >= 2 ? fromParts[fromParts.length - 2] : fromParts[0];
    const fromState = fromParts.length >= 2 ? fromParts[fromParts.length - 1].split(' ')[0] : '';

    const toCity = toParts.length >= 2 ? toParts[toParts.length - 2] : toParts[0];
    const toState = toParts.length >= 2 ? toParts[toParts.length - 1].split(' ')[0] : '';

    const r = await estimateMileage(fromCity, fromState, toCity, toState);
    totalMiles += r.distanceMiles;
    totalMinutes += r.durationMinutes;
    if (r.source === 'osrm') anyOsrm = true;
  }

  return {
    distanceMiles: parseFloat(totalMiles.toFixed(1)),
    durationMinutes: totalMinutes,
    source: anyOsrm ? 'osrm' : 'haversine',
  };
}

// ── 5. CORRIDOR MILESTONES & LEG-AWARE PROGRESS ──────────────────────────────

export type LegProgressInfo = {
  legIndex: number;
  totalLegs: number;
  fromLocation: string;
  toLocation: string;
  fromCoordinates?: Coordinates;
  toCoordinates?: Coordinates;
  toType: 'pickup' | 'dropoff';
  isDeadhead?: boolean;
  nextStopName: string;
  nextStopType: 'pickup' | 'dropoff';
  nextStopEtaFormatted: string;
  nextStopCountdownFormatted: string;
  nextStopDurationFormatted: string;
  nextStopEtaTimestamp: number;
  finalEtaFormatted: string;
  finalCountdownFormatted: string;
  finalEtaTimestamp: number;
  totalRemainingMiles: number;
  totalTripMiles: number;
  totalCoveredMiles: number;
  legDistance: number;
  legCoveredMiles: number;
  legRemainingMiles: number;
  legFraction: number;
  activeLegTitle: string;
  nextStopDistanceText: string;
  corridorMilestone: string;
  allLegs: {
    index: number;
    fromLocation: string;
    toLocation: string;
    fromCoordinates?: Coordinates;
    toCoordinates?: Coordinates;
    toType: 'pickup' | 'dropoff';
    status: 'completed' | 'active' | 'upcoming' | 'pending';
    loadId?: string;
    loadStatus?: string;
    isQueued?: boolean;
    isDeadhead?: boolean;
    label?: string;
    legDistance: number;
    legCoveredMiles: number;
    legRemainingMiles: number;
    legFraction: number;
    legEtaFormatted?: string;
    legCountdownFormatted?: string;
  }[];
};

/**
 * Generates an estimated landmark or state milestone along the active corridor.
 */
export function estimateLegDistanceSync(fromLoc: string, toLoc: string, fallbackDefault = 100): number {
  try {
    const orig = resolveLocationCoordinates(fromLoc);
    const dest = resolveLocationCoordinates(toLoc);
    const haversine = haversineDistanceMiles(orig.lat, orig.lng, dest.lat, dest.lng);
    return Math.max(15, Math.round(haversine * 1.25));
  } catch {
    return fallbackDefault;
  }
}

/**
 * Generates an estimated landmark or state milestone along the active corridor.
 * Coordinates and corridor descriptions are derived strictly from the active leg's true origin and destination.
 */
export function getCorridorMilestone(
  fromLoc: string,
  toLoc: string,
  legFraction: number
): string {
  const norm = (s: string) => (s || '').toLowerCase();
  const from = norm(fromLoc);
  const to = norm(toLoc);
  const pct = Math.min(1.0, Math.max(0.0, legFraction));

  const extractCityState = (raw: string) => {
    if (!raw) return { city: 'Origin', state: '' };
    const coordMatch = raw.trim().match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      return { city: `Current Location (${parseFloat(coordMatch[1]).toFixed(2)}, ${parseFloat(coordMatch[3]).toFixed(2)})`, state: '' };
    }
    const parts = (raw || '').split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { city: parts[parts.length - 2] || parts[0], state: parts[parts.length - 1].split(' ')[0] };
    }
    return { city: parts[0] || 'Origin', state: '' };
  };

  const origInfo = extractCityState(fromLoc);
  const destInfo = extractCityState(toLoc);

  // Preliminary Deadhead / Departure corridor
  if (from.includes('current location') || from.includes('gps') || from.includes('yard') || from.includes('terminal')) {
    if (pct < 0.30) return `Terminal Departure Corridor — Outbound dispatch toward ${destInfo.city}`;
    if (pct < 0.70) return `Transit Route — Intermediate deadhead arterial en route to ${destInfo.city}`;
    return `Arrival Approach — Final corridor approach to ${destInfo.city} pickup terminal`;
  }

  // 1. Chicagoland / Joliet, IL -> Morgantown / Wheeling, WV (Leg 1: ~480 mi)
  if ((from.includes('il') || from.includes('joliet') || from.includes('chicago')) &&
      (to.includes('morgantown') || to.includes('wheeling') || (to.includes('wv') && !to.includes('oak hill') && !to.includes('beckley') && !to.includes('sc') && !to.includes('kershaw')))) {
    if (pct < 0.20) return 'I-80 E / I-65 Corridor — Departing Chicagoland toward Northwest Indiana';
    if (pct < 0.45) return 'I-65 / I-70 E Corridor — Traversing Indianapolis, IN Metro Beltway (I-465)';
    if (pct < 0.70) return 'I-70 E Corridor — Columbus, OH Outerbelt & Logistics Bypass';
    if (pct < 0.88) return 'I-70 / I-79 S Corridor — Ohio River Crossing via Wheeling, WV & PA Border';
    return 'I-79 S Corridor — Monongalia Valley approaching Morgantown, WV Gateway';
  }

  // 2. Morgantown, WV -> Oak Hill / Beckley / Charleston, WV (Leg 2: ~140 mi)
  if ((from.includes('morgantown') || from.includes('fairmont') || from.includes('clarksburg')) &&
      (to.includes('oak hill') || to.includes('beckley') || to.includes('charleston') || to.includes('fayetteville'))) {
    if (pct < 0.25) return 'I-79 S Corridor — Outbound Morgantown / Fairmont Interchange';
    if (pct < 0.60) return 'I-79 S Mountain Summit Corridor — Flatwoods / Sutton Milepost 67';
    if (pct < 0.85) return 'US-19 S Corridor — Gauley Bridge & New River Gorge National Gateway';
    return 'US-19 S Corridor — Approaching Oak Hill / Fayette Logistics Hub';
  }

  // 3. Oak Hill / Beckley / Charleston, WV -> Kershaw / Charlotte / Columbia / SC (Leg 3: ~280 mi)
  if ((from.includes('oak hill') || from.includes('beckley') || from.includes('charleston') || from.includes('fayetteville')) &&
      (to.includes('kershaw') || to.includes('charlotte') || to.includes('columbia') || to.includes('lancaster') || to.includes('sc') || to.includes('nc'))) {
    if (pct < 0.20) return 'US-19 S to I-77 S — Exiting Oak Hill / Beckley via West Virginia Turnpike';
    if (pct < 0.45) return 'I-77 S Appalachian Pass — East River Mountain Tunnel into Wytheville, VA';
    if (pct < 0.70) return 'I-77 S Mountain Descent — Fancy Gap crossing Virginia into North Carolina';
    if (pct < 0.88) return 'I-77 S / I-485 Outerbelt — Charlotte, NC Metro passing into Upstate South Carolina';
    return 'SC-9 / US-521 Corridor — Lancaster County approaching Kershaw, SC destination';
  }

  // 4. Chicagoland / Joliet, IL -> Kershaw / Carolinas (Direct: ~750 mi)
  if ((from.includes('il') || from.includes('joliet')) &&
      (to.includes('sc') || to.includes('kershaw') || to.includes('columbia') || to.includes('lancaster'))) {
    if (pct < 0.22) return 'I-65 S Corridor — Northwest Indiana towards Indianapolis interchange';
    if (pct < 0.45) return 'I-65 S / I-71 Corridor — Louisville, KY & Ohio River Bridge Crossing';
    if (pct < 0.70) return 'I-75 S / I-40 E — Knoxville, TN Foothills & Great Smoky Mountain Corridor';
    if (pct < 0.88) return 'I-26 E Corridor — Blue Ridge Gap passing Asheville into Upstate SC';
    return 'US-521 / SC-9 Corridor — Lancaster County approaching Kershaw destination';
  }

  // 5. Texas routes (TX -> GA/FL/NC/SC or Midwest -> TX)
  if (to.includes('tx') || to.includes('dallas') || to.includes('houston')) {
    if (pct < 0.25) return `I-55 / I-30 W Corridor — Outbound ${origInfo.city} towards Arkansas transit line`;
    if (pct < 0.55) return 'I-30 W Corridor — Little Rock, AR Metro Logistics Corridor';
    if (pct < 0.85) return 'I-30 W Corridor — Texarkana Twin Cities / Texas State Line Crossing';
    return `Texas Interstate Corridor — Approaching ${destInfo.city} Metro distribution perimeter`;
  }

  // 6. General Interstate & State Landmark Generator
  const origLabel = origInfo.city || 'Origin';
  const destLabel = destInfo.city || 'Destination';
  const destState = destInfo.state ? `, ${destInfo.state}` : '';

  if (origInfo.state && destInfo.state && origInfo.state !== destInfo.state) {
    if (pct < 0.20) return `Interstate Corridor — Departing ${origLabel}, ${origInfo.state} commercial terminal`;
    if (pct < 0.45) return `Regional Highway Arterial — Traversing ${origInfo.state} state transit line`;
    if (pct < 0.70) return `Interstate Corridor — Midpoint checkpoint crossing towards ${destInfo.state} border`;
    if (pct < 0.90) return `Major Highway Corridor — Entering ${destInfo.state} regional sector towards ${destLabel}`;
    return `Final Approach Corridor — ${destLabel}${destState} delivery gateway`;
  }

  if (pct < 0.25) return `Intrastate Route — Departing ${origLabel} perimeter`;
  if (pct < 0.50) return `Highway Milepost Corridor — Mid-state transport artery towards ${destLabel}`;
  if (pct < 0.75) return `Regional Corridor — Approaching ${destLabel} county perimeter`;
  return `${destLabel}${destState} Local Delivery Arterial`;
}

/**
 * Calculates progress partitioned across individual legs of a multi-stop trip,
 * including any preliminary deadhead / starting yard transit segment.
 * Dynamically computes next waypoint ETA, countdown clocks, and milestone progression.
 */
export function calculateLegProgress(
  load: Load,
  allLoads: Load[],
  totalLoadedMiles: number,
  overallTransitFraction: number,
  avgSpeed: number = 55,
  currentTimeMs: number = Date.now(),
  driver?: DriverProfile | null
): LegProgressInfo {
  const legs = buildDriverProgressLegs(load, allLoads, driver);
  const effectiveSpeed = avgSpeed > 0 ? avgSpeed : 55;

  const cleanLocationName = (loc: string) => {
    if (!loc) return 'Stop';
    const coordMatch = loc.trim().match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      return `GPS (${parseFloat(coordMatch[1]).toFixed(2)}, ${parseFloat(coordMatch[3]).toFixed(2)})`;
    }
    const parts = loc.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1].split(' ')[0]}`;
    }
    return parts[0];
  };

  const isTripInTransit = load.status === 'in-transit' || overallTransitFraction > 0.02;
  const isLoadPending = (load.status === 'pending' || load.status === 'client-request-approved') && !isTripInTransit;

  if (legs.length <= 1) {
    const fromLoc = formatAddressForRoute(load.origin) || 'Origin';
    const toLoc = formatAddressForRoute(load.destination) || 'Destination';
    const fromCoordinates: Coordinates | undefined = (typeof load.origin?.lat === 'number' && typeof load.origin?.lng === 'number')
      ? { lat: load.origin.lat, lng: load.origin.lng }
      : (typeof load.originLat === 'number' && typeof load.originLng === 'number')
        ? { lat: load.originLat, lng: load.originLng }
        : undefined;
    const toCoordinates: Coordinates | undefined = (typeof load.destination?.lat === 'number' && typeof load.destination?.lng === 'number')
      ? { lat: load.destination.lat, lng: load.destination.lng }
      : (typeof load.destinationLat === 'number' && typeof load.destinationLng === 'number')
        ? { lat: load.destinationLat, lng: load.destinationLng }
        : undefined;

    const legDistance = totalLoadedMiles > 0 ? totalLoadedMiles : estimateLegDistanceSync(fromLoc, toLoc, 100);
    const effectiveFraction = isLoadPending ? 0 : Math.min(1.0, Math.max(0.02, overallTransitFraction));
    const legCoveredMiles = Math.round(legDistance * effectiveFraction);
    const legRemainingMiles = Math.max(0, legDistance - legCoveredMiles);
    const toClean = cleanLocationName(toLoc);
    const milestone = isLoadPending
      ? `Scheduled Route — Awaiting departure from ${cleanLocationName(fromLoc)}`
      : getCorridorMilestone(fromLoc, toLoc, effectiveFraction);

    const remainingDriveHours = legRemainingMiles / effectiveSpeed;
    const remainingDurationMs = Math.round(remainingDriveHours * 3600 * 1000);
    const etaTimestamp = currentTimeMs + remainingDurationMs;
    const etaFormatted = isLoadPending
      ? 'Pending Departure'
      : load.status === 'delivered'
        ? 'Arrived'
        : new Date(etaTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const remH = Math.floor(remainingDriveHours);
    const remM = Math.round((remainingDriveHours - remH) * 60);
    const countdownFormatted = isLoadPending
      ? `~${remH}h ${remM}m drive`
      : load.status === 'delivered'
        ? '0m (Completed)'
        : remH > 0 ? `${remH}h ${remM}m` : `${remM}m`;

    return {
      legIndex: 0,
      totalLegs: 1,
      fromLocation: fromLoc,
      toLocation: toLoc,
      fromCoordinates,
      toCoordinates,
      toType: 'dropoff',
      isDeadhead: false,
      nextStopName: toClean,
      nextStopType: 'dropoff',
      nextStopEtaFormatted: etaFormatted,
      nextStopCountdownFormatted: countdownFormatted,
      nextStopDurationFormatted: countdownFormatted,
      nextStopEtaTimestamp: etaTimestamp,
      finalEtaFormatted: etaFormatted,
      finalCountdownFormatted: countdownFormatted,
      finalEtaTimestamp: etaTimestamp,
      totalRemainingMiles: legRemainingMiles,
      totalTripMiles: legDistance,
      totalCoveredMiles: legCoveredMiles,
      legDistance,
      legCoveredMiles,
      legRemainingMiles,
      legFraction: effectiveFraction,
      activeLegTitle: isLoadPending
        ? `Scheduled: Queued for departure from ${cleanLocationName(fromLoc)}`
        : `Leg 1 of 1: En route to ${toClean} (Delivery)`,
      nextStopDistanceText: `~${legRemainingMiles} mi remaining to ${toClean}`,
      corridorMilestone: milestone,
      allLegs: [{
        index: 0,
        fromLocation: fromLoc,
        toLocation: toLoc,
        fromCoordinates,
        toCoordinates,
        toType: 'dropoff',
        status: isLoadPending ? 'pending' : effectiveFraction >= 1 ? 'completed' : 'active',
        loadId: load.id,
        loadStatus: load.status,
        isQueued: isLoadPending,
        isDeadhead: false,
        legDistance,
        legCoveredMiles,
        legRemainingMiles,
        legFraction: effectiveFraction,
        legEtaFormatted: etaFormatted,
        legCountdownFormatted: countdownFormatted,
      }],
    };
  }

  const numLegs = legs.length - 1;
  const fallbackDistancePerLeg = totalLoadedMiles > 0 ? Math.round(totalLoadedMiles / numLegs) : 100;

  const legList: {
    index: number;
    fromLocation: string;
    toLocation: string;
    fromCoordinates?: Coordinates;
    toCoordinates?: Coordinates;
    toType: 'pickup' | 'dropoff';
    loadId?: string;
    loadStatus?: string;
    isDeadhead?: boolean;
    label?: string;
    legDistance: number;
  }[] = [];

  for (let i = 0; i < numLegs; i++) {
    const from = legs[i].location;
    const to = legs[i + 1].location;
    const toType = legs[i + 1].type;
    const loadId = legs[i + 1].loadId;
    const isDeadhead = Boolean(legs[i].isDeadhead);
    const matchedLoad = allLoads.find(al => al.id === loadId) || (loadId === load.id ? load : undefined);
    
    let lDist = estimateLegDistanceSync(from, to, fallbackDistancePerLeg);
    if (isDeadhead && load.deadheadMiles > 0) {
      lDist = load.deadheadMiles;
    }

    let legFromCoords: Coordinates | undefined = undefined;
    let legToCoords: Coordinates | undefined = undefined;

    if (isDeadhead) {
      if (typeof driver?.currentLat === 'number' && typeof driver?.currentLng === 'number') {
        legFromCoords = { lat: driver.currentLat, lng: driver.currentLng };
      } else {
        legFromCoords = resolveLocationCoordinates(from);
      }
      if (typeof load.origin?.lat === 'number' && typeof load.origin?.lng === 'number') {
        legToCoords = { lat: load.origin.lat, lng: load.origin.lng };
      } else if (typeof load.originLat === 'number' && typeof load.originLng === 'number') {
        legToCoords = { lat: load.originLat, lng: load.originLng };
      } else {
        legToCoords = resolveLocationCoordinates(to);
      }
    } else {
      if (typeof matchedLoad?.origin?.lat === 'number' && typeof matchedLoad?.origin?.lng === 'number') {
        legFromCoords = { lat: matchedLoad.origin.lat, lng: matchedLoad.origin.lng };
      } else if (typeof matchedLoad?.originLat === 'number' && typeof matchedLoad?.originLng === 'number') {
        legFromCoords = { lat: matchedLoad.originLat, lng: matchedLoad.originLng };
      } else {
        legFromCoords = resolveLocationCoordinates(from);
      }
      if (typeof matchedLoad?.destination?.lat === 'number' && typeof matchedLoad?.destination?.lng === 'number') {
        legToCoords = { lat: matchedLoad.destination.lat, lng: matchedLoad.destination.lng };
      } else if (typeof matchedLoad?.destinationLat === 'number' && typeof matchedLoad?.destinationLng === 'number') {
        legToCoords = { lat: matchedLoad.destinationLat, lng: matchedLoad.destinationLng };
      } else {
        legToCoords = resolveLocationCoordinates(to);
      }
    }

    legList.push({
      index: i,
      fromLocation: from,
      toLocation: to,
      fromCoordinates: legFromCoords,
      toCoordinates: legToCoords,
      toType,
      loadId,
      loadStatus: matchedLoad?.status,
      isDeadhead,
      label: isDeadhead ? 'Deadhead / Yard Departure' : undefined,
      legDistance: lDist,
    });
  }

  // ── Journey Distance & State Machine: Explicit Waypoint Progression ────────
  const totalTripMiles = legList.reduce((sum, l) => sum + l.legDistance, 0);

  // Check explicit driverPhase, status, or check-in to find earliest incomplete stop.
  // Waypoints NEVER auto-complete based on elapsed time or distance.
  let manualEarliestIncomplete = 0;
  let allStopsCompleted = true;

  for (let i = 0; i < legList.length; i++) {
    const leg = legList[i];
    const targetLoad = allLoads.find(al => al.id === leg.loadId) || (leg.loadId === load.id ? load : undefined);
    const targetStatus = targetLoad?.status;
    const targetPhase = targetLoad?.driverPhase || load.driverPhase;

    let isStopCompleted = false;

    if (leg.isDeadhead) {
      // Deadhead transit to pickup stop:
      // Completed if arrived at origin, loading, en route to destination, or dispatcher manual override
      if (
        ['in-transit', 'arrived-origin', 'loading', 'arrived', 'unloading', 'delivered'].includes(targetStatus || '') ||
        ['Getting Loaded', 'Enroute to Destination', 'Getting Unloaded', 'Complete'].includes(targetPhase || '') ||
        Boolean(targetLoad?.manualOverrideAt)
      ) {
        isStopCompleted = true;
      }
    } else if (leg.toType === 'pickup') {
      // Intermediate or primary pickup stop:
      // Completed once freight is picked up / en route to destination / unloading / delivered
      if (
        ['in-transit', 'arrived-destination', 'unloading', 'delivered'].includes(targetStatus || '') ||
        ['Enroute to Destination', 'Getting Unloaded', 'Complete'].includes(targetPhase || '') ||
        Boolean(targetLoad?.manualOverrideAt && targetStatus === 'in-transit')
      ) {
        isStopCompleted = true;
      }
    } else {
      // Delivery / Dropoff waypoint:
      // Must remain active and NEVER auto-complete until driver or dispatcher explicitly arrives for unloading or completes delivery
      if (
        ['unloading', 'delivered'].includes(targetStatus || '') ||
        ['Getting Unloaded', 'Complete'].includes(targetPhase || '')
      ) {
        isStopCompleted = true;
      }
    }

    if (!isStopCompleted) {
      manualEarliestIncomplete = i;
      allStopsCompleted = false;
      break;
    }
  }

  if (allStopsCompleted && legList.length > 0) {
    manualEarliestIncomplete = legList.length - 1;
  }

  let activeIndex = 0;
  let activeLegFraction = 0;
  let activeLegCovered = 0;
  let activeLegRemaining = legList[0].legDistance;

  if (load.status === 'delivered' || (allStopsCompleted && legList.length > 0)) {
    activeIndex = legList.length - 1;
    activeLegCovered = legList[activeIndex].legDistance;
    activeLegRemaining = 0;
    activeLegFraction = 1.0;
  } else if (isLoadPending) {
    activeIndex = 0;
    activeLegCovered = 0;
    activeLegRemaining = legList[0].legDistance;
    activeLegFraction = 0;
  } else {
    // Waypoint progression is strictly governed by explicit stop completion.
    // Legs NEVER advance to completed based on elapsed time or distance.
    activeIndex = manualEarliestIncomplete;
    const activeLegDist = legList[activeIndex].legDistance;

    const activeTargetLoad = allLoads.find(al => al.id === legList[activeIndex].loadId) || (legList[activeIndex].loadId === load.id ? load : undefined);
    const activeTargetStatus = activeTargetLoad?.status || load.status;
    const activeTargetPhase = activeTargetLoad?.driverPhase || load.driverPhase;

    if (
      activeTargetStatus === 'arrived' ||
      (activeTargetStatus as any) === 'Arrived' ||
      activeTargetStatus === 'arrived-origin' ||
      activeTargetStatus === 'arrived-destination' ||
      activeTargetPhase === 'Arrived'
    ) {
      // Arrived / stationary at facility: detention clock running
      activeLegCovered = activeLegDist;
      activeLegRemaining = 0;
      activeLegFraction = 0.98;
    } else if (activeTargetStatus === 'loading' || activeTargetPhase === 'Getting Loaded') {
      // Checked in at pickup / loading: staged awaiting departure
      activeLegCovered = Math.max(0, Math.round(activeLegDist * 0.05));
      activeLegRemaining = Math.max(0, activeLegDist - activeLegCovered);
      activeLegFraction = 0.05;
    } else if (activeTargetStatus === 'unloading' || activeTargetPhase === 'Getting Unloaded') {
      // Arrived at destination waypoint / unloading
      activeLegCovered = activeLegDist;
      activeLegRemaining = 0;
      activeLegFraction = 0.98;
    } else {
      // Actively en route along the corridor of the active leg.
      // Re-initialize telemetry math baseline for the active leg:
      // If manualOverrideAt is present, compute progress strictly elapsed since override.
      // Otherwise, interpolate progress isolated to the active leg so it starts fresh from 0%.
      let computedLegFraction = 0.02;

      const overrideIso = activeTargetLoad?.manualOverrideAt || load.manualOverrideAt;
      if (overrideIso) {
        const overrideMs = new Date(overrideIso).getTime();
        if (!isNaN(overrideMs) && currentTimeMs >= overrideMs) {
          const elapsedHours = (currentTimeMs - overrideMs) / 3600000;
          const coveredByTime = elapsedHours * effectiveSpeed;
          computedLegFraction = activeLegDist > 0 ? coveredByTime / activeLegDist : 0.02;
        }
      } else {
        // Multi-leg proportional calculation or fallback to overallTransitFraction
        const previousLegsDist = legList.slice(0, activeIndex).reduce((s, l) => s + l.legDistance, 0);
        if (totalTripMiles > 0 && overallTransitFraction > 0) {
          const totalCoveredCorridorMiles = totalTripMiles * Math.min(1.0, Math.max(0.02, overallTransitFraction));
          const rawCoveredOnActiveLeg = Math.max(0, totalCoveredCorridorMiles - previousLegsDist);
          computedLegFraction = activeLegDist > 0 ? rawCoveredOnActiveLeg / activeLegDist : 0.02;
        }
      }

      // Bound strictly: capped at 95% so active leg never auto-completes without stop confirmation
      activeLegFraction = Math.min(0.95, Math.max(0.02, computedLegFraction));
      activeLegCovered = Math.max(1, Math.min(Math.round(activeLegDist * 0.95), Math.round(activeLegDist * activeLegFraction)));
      activeLegRemaining = Math.max(1, activeLegDist - activeLegCovered);
    }
  }

  const activeLegRaw = legList[activeIndex];
  const activeTargetLoad = allLoads.find(al => al.id === activeLegRaw.loadId) || (activeLegRaw.loadId === load.id ? load : undefined);
  const activeTargetStatus = activeTargetLoad?.status || load.status;
  const toLabel = cleanLocationName(activeLegRaw.toLocation);
  const toTypeLabel = activeLegRaw.isDeadhead ? 'Deadhead to Pickup' : activeLegRaw.toType === 'pickup' ? 'Pickup' : 'Delivery';

  // ── Next Stop ETA & Countdown Clocks ──────────────────────────────────
  const isTargetArrived = activeTargetStatus === 'arrived' || (activeTargetStatus as any) === 'Arrived' || activeTargetLoad?.driverPhase === 'Arrived';
  const nextStopDriveHours = activeLegRemaining / effectiveSpeed;
  const nextStopDurationMs = Math.round(nextStopDriveHours * 3600 * 1000);
  const nextStopEtaTimestamp = currentTimeMs + nextStopDurationMs;
  const nextStopEtaFormatted = isLoadPending
    ? 'Pending Departure'
    : load.status === 'delivered'
      ? 'Arrived'
      : isTargetArrived
        ? 'Arrived (At Facility)'
        : new Date(nextStopEtaTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const nextH = Math.floor(nextStopDriveHours);
  const nextM = Math.round((nextStopDriveHours - nextH) * 60);
  const nextStopCountdownFormatted = isLoadPending
    ? `~${nextH}h ${nextM}m drive`
    : load.status === 'delivered'
      ? '0m (Completed)'
      : isTargetArrived
        ? 'Stationary (Detention Active)'
        : nextH > 0 ? `${nextH}h ${nextM}m` : `${nextM}m`;

  // ── Total Journey Distance & Final Destination ETA ───────────────────
  const totalCoveredMiles = legList.reduce((sum, l, idx) => {
    if (idx < activeIndex) return sum + l.legDistance;
    if (idx === activeIndex) return sum + activeLegCovered;
    return sum;
  }, 0);

  const remainingMilesAfterActive = legList.slice(activeIndex + 1).reduce((sum, l) => {
    return sum + (l.loadStatus === 'pending' || l.loadStatus === 'client-request-approved' ? 0 : l.legDistance);
  }, 0);
  const totalRemainingMiles = activeLegRemaining + remainingMilesAfterActive;

  const finalDriveHours = totalRemainingMiles / effectiveSpeed;
  const finalDurationMs = Math.round(finalDriveHours * 3600 * 1000);
  const finalEtaTimestamp = currentTimeMs + finalDurationMs;
  const finalEtaFormatted = isLoadPending
    ? 'Pending Departure'
    : load.status === 'delivered'
      ? 'Delivered'
      : new Date(finalEtaTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const finH = Math.floor(finalDriveHours);
  const finM = Math.round((finalDriveHours - finH) * 60);
  const finalCountdownFormatted = isLoadPending
    ? `~${finH}h ${finM}m total`
    : load.status === 'delivered'
      ? 'Completed'
      : finH > 0 ? `${finH}h ${finM}m` : `${finM}m`;

  let activeLegTitle = activeLegRaw.isDeadhead
    ? `Leg 1 of ${numLegs}: 🚛 Deadhead Transit to ${toLabel} (Pickup 1)`
    : `Leg ${activeIndex + 1} of ${numLegs}: En route to ${toLabel} (${toTypeLabel})`;
  
  let nextStopDistanceText = activeLegRaw.isDeadhead
    ? `~${activeLegRemaining} mi to ${toLabel} (Pickup)`
    : `~${activeLegRemaining} mi remaining to ${toLabel}`;
  
  let corridorMilestone = getCorridorMilestone(activeLegRaw.fromLocation, activeLegRaw.toLocation, activeLegFraction);

  if (isLoadPending) {
    activeLegTitle = `Scheduled: Queued for departure from ${cleanLocationName(activeLegRaw.fromLocation)}`;
    nextStopDistanceText = `~${activeLegRaw.legDistance} mi to ${toLabel}`;
    corridorMilestone = `Trip Container Queued — Scheduled Corridor to ${toLabel}`;
  } else if (activeTargetStatus === 'loading' || load.status === 'loading') {
    activeLegTitle = `Leg ${activeIndex + 1} of ${numLegs}: Loading at ${cleanLocationName(activeLegRaw.fromLocation)}`;
    nextStopDistanceText = `Awaiting departure to ${toLabel}`;
  } else if (activeTargetStatus === 'unloading' || load.status === 'unloading') {
    activeLegTitle = `Leg ${activeIndex + 1} of ${numLegs}: Arrived at ${toLabel} (Unloading)`;
    nextStopDistanceText = `Arrived at destination • Unloading`;
  }

  // ── Leg List Formatter ────────────────────────────────────────────────
  let cumulativeDistFromActive = activeLegRemaining;

  const formattedLegs: LegProgressInfo['allLegs'] = legList.map(l => {
    let status: 'completed' | 'active' | 'upcoming' | 'pending' = 'upcoming';
    let cMiles = 0;
    let rMiles = l.legDistance;
    let frac = 0;
    let isQueued = false;
    let legEtaFormatted = '—';
    let legCountdownFormatted = '—';

    const tLoad = allLoads.find(al => al.id === l.loadId) || (l.loadId === load.id ? load : undefined);
    const tStatus = tLoad?.status;

    if (l.index < activeIndex) {
      status = 'completed';
      cMiles = l.legDistance;
      rMiles = 0;
      frac = 1.0;
      legEtaFormatted = 'Completed';
      legCountdownFormatted = '0m';
    } else if (l.index === activeIndex) {
      if (isLoadPending) {
        status = 'pending';
        isQueued = true;
        cMiles = 0;
        rMiles = l.legDistance;
        frac = 0;
        legEtaFormatted = 'Pending';
        legCountdownFormatted = `~${nextStopCountdownFormatted}`;
      } else if (load.status === 'delivered' && l.index === legList.length - 1) {
        status = 'completed';
        cMiles = l.legDistance;
        rMiles = 0;
        frac = 1.0;
        legEtaFormatted = 'Delivered';
        legCountdownFormatted = '0m';
      } else {
        status = 'active';
        frac = activeLegFraction;
        cMiles = activeLegCovered;
        rMiles = activeLegRemaining;
        legEtaFormatted = nextStopEtaFormatted;
        legCountdownFormatted = nextStopCountdownFormatted;
      }
    } else {
      // Upcoming / Queued legs
      if (tStatus === 'pending' || tStatus === 'client-request-approved') {
        status = 'pending';
        isQueued = true;
        legEtaFormatted = 'Queued';
        legCountdownFormatted = 'Pending';
      } else {
        status = 'upcoming';
        const legCumHours = cumulativeDistFromActive / effectiveSpeed;
        const legEtaTime = currentTimeMs + Math.round(legCumHours * 3600 * 1000);
        legEtaFormatted = new Date(legEtaTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const lH = Math.floor(legCumHours);
        const lM = Math.round((legCumHours - lH) * 60);
        legCountdownFormatted = lH > 0 ? `${lH}h ${lM}m` : `${lM}m`;
        cumulativeDistFromActive += l.legDistance;
      }
      cMiles = 0;
      rMiles = l.legDistance;
      frac = 0;
    }

    return {
      index: l.index,
      fromLocation: l.fromLocation,
      toLocation: l.toLocation,
      fromCoordinates: l.fromCoordinates,
      toCoordinates: l.toCoordinates,
      toType: l.toType,
      status,
      loadId: l.loadId,
      loadStatus: tStatus,
      isQueued,
      isDeadhead: l.isDeadhead,
      label: l.label,
      legDistance: l.legDistance,
      legCoveredMiles: cMiles,
      legRemainingMiles: rMiles,
      legFraction: frac,
      legEtaFormatted,
      legCountdownFormatted,
    };
  });

  return {
    legIndex: activeIndex,
    totalLegs: numLegs,
    fromLocation: activeLegRaw.fromLocation,
    toLocation: activeLegRaw.toLocation,
    fromCoordinates: activeLegRaw.fromCoordinates,
    toCoordinates: activeLegRaw.toCoordinates,
    toType: activeLegRaw.toType,
    isDeadhead: activeLegRaw.isDeadhead,
    nextStopName: toLabel,
    nextStopType: activeLegRaw.toType,
    nextStopEtaFormatted,
    nextStopCountdownFormatted,
    nextStopDurationFormatted: nextStopCountdownFormatted,
    nextStopEtaTimestamp,
    finalEtaFormatted,
    finalCountdownFormatted,
    finalEtaTimestamp,
    totalRemainingMiles,
    totalTripMiles,
    totalCoveredMiles,
    legDistance: activeLegRaw.legDistance,
    legCoveredMiles: activeLegCovered,
    legRemainingMiles: activeLegRemaining,
    legFraction: activeLegFraction,
    activeLegTitle,
    nextStopDistanceText,
    corridorMilestone,
    allLegs: formattedLegs,
  };
}

