import { NextResponse } from 'next/server';

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string;
  source: 'google' | 'nominatim' | 'census' | 'fallback';
}

function isValidUSCoord(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= 18 && lat <= 72 && lng >= -170 && lng <= -60;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawAddress = searchParams.get('address')?.trim();

  if (!rawAddress) {
    return NextResponse.json({ error: 'Address parameter is required' }, { status: 400 });
  }

  // Check if address is already a coordinate pair "lat, lng"
  const coordMatch = rawAddress.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[3]);
    if (isValidUSCoord(lat, lng)) {
      return NextResponse.json({ lat, lng, displayName: rawAddress, source: 'fallback' });
    }
  }

  const apiKey = (process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();

  // 1. Google Maps Geocoding API (High rooftop accuracy)
  if (apiKey) {
    try {
      const gRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawAddress)}&key=${apiKey}`
      );
      if (gRes.ok) {
        const gData = await gRes.json();
        if (gData.status === 'OK' && gData.results?.length > 0) {
          const loc = gData.results[0].geometry.location;
          const lat = parseFloat(loc.lat);
          const lng = parseFloat(loc.lng);
          if (isValidUSCoord(lat, lng)) {
            return NextResponse.json({
              lat,
              lng,
              displayName: gData.results[0].formatted_address,
              source: 'google',
            });
          }
        }
      }
    } catch (gErr: any) {
      console.warn('[Geocode API] Google Maps Geocoding error:', gErr?.message || gErr);
    }
  }

  // 2. OpenStreetMap Nominatim Geocoder (Full physical address query)
  try {
    const nRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(rawAddress)}&countrycodes=us&limit=1&format=json`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'PayloadLogic/1.0 (dispatch-routing-geocoder)',
        },
      }
    );
    if (nRes.ok) {
      const nData = await nRes.json();
      if (nData?.length > 0) {
        const lat = parseFloat(nData[0].lat);
        const lng = parseFloat(nData[0].lon);
        if (isValidUSCoord(lat, lng)) {
          return NextResponse.json({
            lat,
            lng,
            displayName: nData[0].display_name,
            source: 'nominatim',
          });
        }
      }
    }
  } catch (nErr: any) {
    console.warn('[Geocode API] Nominatim Geocoding error:', nErr?.message || nErr);
  }

  // 3. US Census Bureau Geocoder (Official US physical street address geocoder)
  try {
    const cRes = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(rawAddress)}&benchmark=Public_AR_Current&format=json`
    );
    if (cRes.ok) {
      const cData = await cRes.json();
      const match = cData?.result?.addressMatches?.[0];
      if (match?.coordinates) {
        const lat = parseFloat(match.coordinates.y);
        const lng = parseFloat(match.coordinates.x);
        if (isValidUSCoord(lat, lng)) {
          return NextResponse.json({
            lat,
            lng,
            displayName: match.matchedAddress,
            source: 'census',
          });
        }
      }
    }
  } catch (cErr: any) {
    console.warn('[Geocode API] US Census Geocoding error:', cErr?.message || cErr);
  }

  // 4. Secondary fallback: city, state if specific street address was not found
  const parts = rawAddress.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const cityStateQuery = parts.slice(-2).join(', ');
    if (cityStateQuery !== rawAddress) {
      try {
        const fallbackRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityStateQuery)}&countrycodes=us&limit=1&format=json`,
          {
            headers: {
              'Accept-Language': 'en',
              'User-Agent': 'PayloadLogic/1.0 (dispatch-routing-geocoder)',
            },
          }
        );
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          if (fbData?.length > 0) {
            const lat = parseFloat(fbData[0].lat);
            const lng = parseFloat(fbData[0].lon);
            if (isValidUSCoord(lat, lng)) {
              return NextResponse.json({
                lat,
                lng,
                displayName: fbData[0].display_name,
                source: 'nominatim',
              });
            }
          }
        }
      } catch {}
    }
  }

  return NextResponse.json({ error: 'Could not resolve physical coordinates for the provided address' }, { status: 404 });
}
