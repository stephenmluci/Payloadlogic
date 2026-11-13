let googleMapsScriptPromise: Promise<void> | null = null;
let isClientDirectionsDisabled = false;

// Helper to ensure Google Maps script is injected into the DOM using environment variable
export function loadGoogleMapsScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  // ONLY load Google Maps JavaScript API if an explicit Google Maps API Key is provided.
  // Using Firebase Auth/Web API key triggers DIRECTIONS_ROUTE: REQUEST_DENIED in client browsers.
  const apiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
  if (!apiKey) {
    return Promise.resolve();
  }

  googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      if ((window as any).google?.maps) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(e));
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,routes`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      console.warn('Failed to load Google Maps JavaScript API script:', err);
      resolve(); // Do not crash, allow fallbacks
    };
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

export type RoadDistanceWithCoordsResult = {
  miles: number;
  originCoords?: { lat: number; lng: number };
  destinationCoords?: { lat: number; lng: number };
};

/**
 * Calculates road driving distance and exact origin/destination coordinates using Google Maps DirectionsService / Routes API
 * If client-side service is unavailable, falls back to server route /api/distance, then OSRM/Haversine routing.
 */
export async function calculateRoadDistanceWithCoords(origin: string, destination: string): Promise<RoadDistanceWithCoordsResult> {
  if (!origin || !destination) throw new Error('Origin and destination are required');

  // 1. Try server route /api/distance first (Fast, robust, handles Google Maps API Key on backend if configured, otherwise OSRM & Haversine without client errors)
  try {
    const res = await fetch(`/api/distance?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.distanceMiles === 'number' && data.distanceMiles > 0) {
        return {
          miles: Math.round(data.distanceMiles),
          originCoords: data.originCoords,
          destinationCoords: data.destinationCoords,
        };
      }
      if (data.error && !data.error.includes('Google Maps API key is not configured')) {
        console.warn('Server distance calculation warning:', data.error);
      }
    }
  } catch (serverErr) {
    console.warn('Server route /api/distance call failed, attempting fallback:', serverErr);
  }

  // 2. Try Client-Side Google Maps DirectionsService if explicit API key is configured and client calls are enabled
  const hasClientKey = Boolean((process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim());
  if (hasClientKey && !isClientDirectionsDisabled) {
    try {
      await loadGoogleMapsScript();
      if (typeof window !== 'undefined' && (window as any).google?.maps?.DirectionsService) {
        const directionsService = new (window as any).google.maps.DirectionsService();

        const result = await new Promise<any>((resolve, reject) => {
          directionsService.route(
            {
              origin: origin,
              destination: destination,
              travelMode: (window as any).google.maps.TravelMode.DRIVING,
              unitSystem: (window as any).google.maps.UnitSystem.IMPERIAL,
            },
            (res: any, status: any) => {
              if (status === 'OK' || status === (window as any).google.maps.DirectionsStatus?.OK) {
                resolve(res);
              } else {
                if (status === 'REQUEST_DENIED') {
                  isClientDirectionsDisabled = true;
                }
                reject(new Error(status));
              }
            }
          );
        });

        const route = result.routes?.[0];
        if (route && route.legs && route.legs.length > 0) {
          let totalDistanceMeters = 0;
          for (const leg of route.legs) {
            totalDistanceMeters += leg.distance?.value || 0;
          }

          const miles = Math.round(totalDistanceMeters * 0.000621371);
          const leg0 = route.legs[0];
          const lastLeg = route.legs[route.legs.length - 1];
          const originCoords = leg0?.start_location ? {
            lat: parseFloat(leg0.start_location.lat().toFixed(5)),
            lng: parseFloat(leg0.start_location.lng().toFixed(5)),
          } : undefined;
          const destinationCoords = lastLeg?.end_location ? {
            lat: parseFloat(lastLeg.end_location.lat().toFixed(5)),
            lng: parseFloat(lastLeg.end_location.lng().toFixed(5)),
          } : undefined;

          return { miles, originCoords, destinationCoords };
        }
      }
    } catch (clientErr: any) {
      const statusMsg = clientErr?.message || String(clientErr);
      if (statusMsg.includes('REQUEST_DENIED')) {
        isClientDirectionsDisabled = true;
      }
      if (statusMsg.includes('ZERO_RESULTS') || statusMsg.includes('NOT_FOUND')) {
        throw new Error(`No road route found between "${origin}" and "${destination}" (ZERO_RESULTS).`);
      }
    }
  }

  // 3. Fallback to OSRM / Haversine road estimation locally
  try {
    const parseCityState = (addrStr: string) => {
      const parts = addrStr.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        const city = parts[parts.length - 2];
        const stateZip = parts[parts.length - 1];
        const state = stateZip.split(' ')[0];
        return { city, state };
      }
      return { city: addrStr, state: '' };
    };

    const orig = parseCityState(origin);
    const dest = parseCityState(destination);
    if (orig.city && dest.city) {
      const { estimateMileage } = await import('@/lib/routeUtils');
      const est = await estimateMileage(orig.city, orig.state, dest.city, dest.state);
      if (est.distanceMiles > 0) {
        return { miles: Math.round(est.distanceMiles) };
      }
    }
  } catch (fallbackErr) {
    console.warn('OSRM estimation fallback failed:', fallbackErr);
  }

  throw new Error('Could not calculate driving distance');
}

/**
 * Calculates road driving distance between two addresses using Google Maps Modern DirectionsService / Routes API
 * If client-side service is unavailable, falls back to server route /api/distance, then OSRM/Haversine routing.
 */
export async function calculateRoadDistance(origin: string, destination: string): Promise<number> {
  const result = await calculateRoadDistanceWithCoords(origin, destination);
  return result.miles;
}
