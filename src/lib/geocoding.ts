import type { Address } from '@/types';

export interface LatLng {
  lat: number;
  lng: number;
}

const memoryGeocodeCache = new Map<string, LatLng>();

// Seed common dispatch hubs
memoryGeocodeCache.set('marengo, il', { lat: 42.24905, lng: -88.62152 });
memoryGeocodeCache.set('21804 w grant hwy, marengo, il 60152', { lat: 42.24905, lng: -88.62152 });
memoryGeocodeCache.set('grand island, ne', { lat: 40.9264, lng: -98.3420 });
memoryGeocodeCache.set('555 s stuhr rd, grand island, ne 68801', { lat: 40.9168, lng: -98.3412 });

/**
 * Formats an Address object into a single line physical address string.
 */
export function formatPhysicalAddress(addr?: Address | null): string {
  if (!addr) return '';
  return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ').trim();
}

/**
 * Fetches the exact physical latitude and longitude for a given street address or Address object.
 * Checks memory cache -> localStorage cache -> /api/geocode endpoint.
 */
export async function geocodePhysicalAddress(address: Address | string): Promise<LatLng | null> {
  if (!address) return null;

  // If Address object already has verified coordinates, use them directly
  if (typeof address === 'object') {
    if (typeof address.lat === 'number' && typeof address.lng === 'number' && !isNaN(address.lat) && !isNaN(address.lng)) {
      return { lat: address.lat, lng: address.lng };
    }
  }

  const addrStr = typeof address === 'string' ? address.trim() : formatPhysicalAddress(address);
  if (!addrStr) return null;

  // Check if string is already a coordinate pair "lat, lng"
  const coordMatch = addrStr.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[3]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= 18 && lat <= 72 && lng >= -170 && lng <= -60) {
      return { lat, lng };
    }
  }

  const cacheKey = addrStr.toLowerCase().replace(/[,#]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. In-memory cache
  if (memoryGeocodeCache.has(cacheKey)) {
    return memoryGeocodeCache.get(cacheKey)!;
  }

  // 2. Browser localStorage cache
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`geo_${cacheKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.lat && parsed.lng) {
          memoryGeocodeCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {}
  }

  // 3. Query /api/geocode
  try {
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(addrStr)}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.lat === 'number' && typeof data.lng === 'number') {
        const coords: LatLng = {
          lat: parseFloat(data.lat.toFixed(5)),
          lng: parseFloat(data.lng.toFixed(5)),
        };
        memoryGeocodeCache.set(cacheKey, coords);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`geo_${cacheKey}`, JSON.stringify(coords));
          } catch {}
        }
        return coords;
      }
    }
  } catch (err: any) {
    console.warn(`[geocodePhysicalAddress] Geocode fetch failed for "${addrStr}":`, err?.message || err);
  }

  return null;
}
