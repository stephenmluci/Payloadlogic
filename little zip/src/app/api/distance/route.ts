import { NextResponse } from 'next/server';
import { estimateMileage } from '@/lib/routeUtils';

function parseCityAndState(addr: string): { city: string; state: string } {
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[parts.length - 2];
    const stateZip = parts[parts.length - 1];
    const state = stateZip.split(' ')[0].trim();
    return { city, state };
  }
  return { city: addr, state: '' };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get('origin')?.trim();
  const destination = searchParams.get('destination')?.trim();
  
  if (!origin || !destination) {
    return NextResponse.json({ error: 'Origin and destination are required' }, { status: 400 });
  }

  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();

  // 1. If API key exists, try Google Maps Directions API
  if (apiKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&units=imperial&key=${apiKey}`
      );
      const data = await res.json();

      if (data.status === 'OK' && data.routes?.length > 0) {
        const route = data.routes[0];
        let totalDistanceMeters = 0;
        if (route.legs && route.legs.length > 0) {
          for (const leg of route.legs) {
            totalDistanceMeters += leg.distance?.value || 0;
          }
          const distanceMiles = Math.round(totalDistanceMeters * 0.000621371);
          const leg0 = route.legs[0];
          const originCoords = leg0?.start_location ? { lat: leg0.start_location.lat, lng: leg0.start_location.lng } : undefined;
          const destinationCoords = leg0?.end_location ? { lat: leg0.end_location.lat, lng: leg0.end_location.lng } : undefined;
          return NextResponse.json({ 
            distanceMiles, 
            distanceInMeters: totalDistanceMeters, 
            originCoords,
            destinationCoords,
            source: 'google' 
          });
        }
      } else if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
        console.warn(`Google Maps returned ${data.status} for ${origin} -> ${destination}, falling back to OSRM`);
      } else {
        console.warn(`Google Maps API error status: ${data.status} - ${data.error_message || ''}, falling back to OSRM`);
      }
    } catch (googleError: any) {
      console.warn('Google Maps API fetch failed, falling back to OSRM:', googleError?.message);
    }
  }

  // 2. Fallback to OSRM / Haversine road estimation
  try {
    const o = parseCityAndState(origin);
    const d = parseCityAndState(destination);

    if (o.city && d.city) {
      const result = await estimateMileage(o.city, o.state, d.city, d.state);
      if (result.distanceMiles > 0) {
        const distanceMiles = Math.round(result.distanceMiles);
        const distanceInMeters = Math.round(distanceMiles * 1609.34);
        return NextResponse.json({
          distanceMiles,
          distanceInMeters,
          durationMinutes: result.durationMinutes,
          source: result.source,
        });
      }
    }
  } catch (fallbackError: any) {
    console.error('Fallback estimation error:', fallbackError);
  }

  return NextResponse.json({
    error: 'Could not calculate driving distance for the specified addresses.',
    distanceMiles: 0,
    distanceInMeters: 0,
  }, { status: 200 });
}