'use client';

import React, { useState, useMemo } from 'react';
import type { Load, DriverProfile } from '@/types';
import { type LegProgressInfo, calculateEstimatedDriverLocation, cleanSearchableAddress } from '@/lib/routeUtils';
import { LiveTransitMapRenderer } from './LiveTransitMapRenderer';
import { LocationDisclaimerNotice } from '@/components/common/LocationDisclaimerNotice';
import {
  X,
  MapPin,
  Navigation,
  ExternalLink,
  Copy,
  Check,
  Compass,
  Clock,
  Gauge,
  Layers,
  Truck,
  Building2,
  Flag,
  AlertTriangle,
} from 'lucide-react';

interface TransitMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  load: Load;
  legProgress: LegProgressInfo;
  driver?: DriverProfile | null;
}

export function TransitMapModal({
  isOpen,
  onClose,
  load,
  legProgress,
  driver,
}: TransitMapModalProps) {
  const [activeTab, setActiveTab] = useState<'google' | 'track' | 'schematic'>('google');
  const [copied, setCopied] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markersRef = React.useRef<any[]>([]);

  // Compute the estimated real-time coordinates along the active leg
  const estLocation = useMemo(() => {
    const origCoords = legProgress.fromCoordinates || (
      typeof load.origin?.lat === 'number' && typeof load.origin?.lng === 'number'
        ? { lat: load.origin.lat, lng: load.origin.lng }
        : typeof load.originLat === 'number' && typeof load.originLng === 'number'
          ? { lat: load.originLat, lng: load.originLng }
          : null
    );
    const destCoords = legProgress.toCoordinates || (
      typeof load.destination?.lat === 'number' && typeof load.destination?.lng === 'number'
        ? { lat: load.destination.lat, lng: load.destination.lng }
        : typeof load.destinationLat === 'number' && typeof load.destinationLng === 'number'
          ? { lat: load.destinationLat, lng: load.destinationLng }
          : null
    );

    return calculateEstimatedDriverLocation(
      legProgress.fromLocation,
      legProgress.toLocation,
      legProgress.legFraction,
      driver?.currentLat,
      driver?.currentLng,
      origCoords,
      destCoords
    );
  }, [legProgress, load, driver]);

  // Full trip sequence Google Maps URL: [Driver Last Known Location] -> [Active Load Origin] -> [Active Load Destination]
  const fullTripGoogleMapsUrl = useMemo(() => {
    if (legProgress.allLegs && legProgress.allLegs.length > 0) {
      const addresses: string[] = [];
      const firstFrom = cleanSearchableAddress(legProgress.allLegs[0].fromLocation);
      if (firstFrom) addresses.push(firstFrom);

      for (const leg of legProgress.allLegs) {
        const toClean = cleanSearchableAddress(leg.toLocation);
        if (toClean && (!addresses.length || addresses[addresses.length - 1].toLowerCase() !== toClean.toLowerCase())) {
          addresses.push(toClean);
        }
      }

      if (addresses.length > 1) {
        const encodedPath = addresses.map(a => encodeURIComponent(a)).join('/');
        return `https://www.google.com/maps/dir/${encodedPath}`;
      } else if (addresses.length === 1) {
        return `https://www.google.com/maps/dir/${encodeURIComponent(addresses[0])}`;
      }
    }
    return estLocation.googleMapsPinUrl;
  }, [legProgress.allLegs, estLocation.googleMapsPinUrl]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== 'google') return;

    let isCancelled = false;
    async function initModalMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;
      const apiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '').trim();

      // Catch Google Maps authentication or activation errors (e.g. ApiNotActivatedMapError)
      (window as any).gm_authFailure = () => {
        setMapError('Maps JavaScript API is not activated for this key in Google Cloud Console (ApiNotActivatedMapError). Please enable "Maps JavaScript API" in your Google Cloud Console.');
      };

      if (!((window as any).google?.maps)) {
        if (apiKey) {
          await new Promise<void>((resolve) => {
            const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
            if (existing) {
              existing.addEventListener('load', () => resolve());
              if ((window as any).google?.maps) resolve();
            } else {
              const script = document.createElement('script');
              script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,routes`;
              script.async = true;
              script.defer = true;
              script.onload = () => resolve();
              script.onerror = () => {
                setMapError('Failed to load Google Maps script. Check your API key and connection.');
                resolve();
              };
              document.head.appendChild(script);
            }
          });
        } else {
          setMapError('Google Maps API key not found. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file.');
        }
      }

      if (isCancelled || !mapContainerRef.current || !((window as any).google?.maps)) return;
      setMapError(null);

      const googleMaps = (window as any).google.maps;

      const darkStyles = [
        { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
        { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#090d16' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
        { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
        { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f8fafc' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#38bdf8' }] }
      ];

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new googleMaps.Map(mapContainerRef.current, {
          center: estLocation.coordinates,
          zoom: 7,
          styles: darkStyles,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
      }

      const map = mapInstanceRef.current;
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      const bounds = new googleMaps.LatLngBounds();

      // Origin Marker
      if (estLocation.originCoordinates) {
        const origMarker = new googleMaps.Marker({
          position: estLocation.originCoordinates,
          map,
          title: `Origin: ${legProgress.fromLocation}`,
          label: { text: 'A', color: '#ffffff', fontWeight: 'bold' },
        });
        bounds.extend(estLocation.originCoordinates);
        markersRef.current.push(origMarker);
      }

      // Destination Marker
      if (estLocation.destCoordinates) {
        const destMarker = new googleMaps.Marker({
          position: estLocation.destCoordinates,
          map,
          title: `Destination: ${legProgress.toLocation}`,
          label: { text: 'B', color: '#ffffff', fontWeight: 'bold' },
        });
        bounds.extend(estLocation.destCoordinates);
        markersRef.current.push(destMarker);
      }

      // Live Driver Position Marker
      const driverMarker = new googleMaps.Marker({
        position: estLocation.coordinates,
        map,
        title: `${driver?.name || 'Driver'} (~${legProgress.legCoveredMiles} mi covered)`,
        icon: {
          path: googleMaps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });
      bounds.extend(estLocation.coordinates);
      markersRef.current.push(driverMarker);

      // Route Polyline between origin, driver, and destination
      if (estLocation.originCoordinates && estLocation.destCoordinates) {
        const pathCoords = [
          estLocation.originCoordinates,
          estLocation.coordinates,
          estLocation.destCoordinates,
        ];
        const routeLine = new googleMaps.Polyline({
          path: pathCoords,
          geodesic: true,
          strokeColor: '#38bdf8',
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map,
        });
        markersRef.current.push(routeLine);
      }

      map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
    }

    initModalMap();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, activeTab, estLocation, legProgress, driver]);

  if (!isOpen) return null;

  const handleCopyCoordinates = () => {
    const coordStr = `${estLocation.coordinates.lat.toFixed(5)}, ${estLocation.coordinates.lng.toFixed(5)}`;
    navigator.clipboard.writeText(coordStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const loadNumber = load.loadNumber ?? `#${load.id?.substring(0, 7).toUpperCase()}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
          color: '#f8fafc',
          fontFamily: 'Segoe UI, system-ui, sans-serif',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#111827',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Navigation size={18} className="text-sky-400 animate-pulse" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {loadNumber}
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f1f5f9' }}>
                  Live Transit &amp; Route Progress Visualizer
                </h3>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                Driver: <strong style={{ color: '#e2e8f0' }}>{driver?.name ?? 'Assigned Driver'}</strong> &bull; {legProgress.activeLegTitle} &bull; <span style={{ color: '#38bdf8' }}>Google Maps Live Corridor</span>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s, color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1e293b';
              e.currentTarget.style.color = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body / Scrollable Content */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Location Disclaimer Notice */}
          <LocationDisclaimerNotice variant="banner" className="bg-amber-950/40 text-amber-200 border-amber-500/30" />

          {/* Real-time Estimated Coordinates & Quick Copy Bar */}
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#4ade80',
                  boxShadow: '0 0 10px #4ade80',
                }}
              />
              <div>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Calculated Position Coordinates ({estLocation.source === 'driver_gps' ? 'Reported Coordinates' : 'Leg Corridor Interpolation'})
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <code style={{ fontSize: '14px', fontWeight: 600, color: '#38bdf8', fontFamily: 'Consolas, monospace' }}>
                    {estLocation.coordinates.lat.toFixed(5)}, {estLocation.coordinates.lng.toFixed(5)}
                  </code>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    ({estLocation.formattedCoordinates})
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={handleCopyCoordinates}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: copied ? 'rgba(74, 222, 128, 0.15)' : '#0f172a',
                  color: copied ? '#4ade80' : '#cbd5e1',
                  border: `1px solid ${copied ? '#4ade80' : '#475569'}`,
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Copy lat, lng to clipboard"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Coordinates'}</span>
              </button>

              <a
                href={fullTripGoogleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`View full trip route: ${legProgress.allLegs?.[0]?.fromLocation || legProgress.fromLocation} → ${load.origin.city}, ${load.origin.state} → ${load.destination.city}, ${load.destination.state}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  textDecoration: 'none',
                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0369a1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#0284c7';
                }}
              >
                <ExternalLink size={13} />
                Open Route in Google Maps
              </a>
            </div>
          </div>

          {/* Map View & Schematic Switcher Tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#111827', padding: '3px', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <button
                onClick={() => setActiveTab('google')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: activeTab === 'google' ? 600 : 400,
                  backgroundColor: activeTab === 'google' ? '#0284c7' : 'transparent',
                  color: activeTab === 'google' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Navigation size={13} />
                Google Map
              </button>
              <button
                onClick={() => setActiveTab('track')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: activeTab === 'track' ? 600 : 400,
                  backgroundColor: activeTab === 'track' ? '#0284c7' : 'transparent',
                  color: activeTab === 'track' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Layers size={13} />
                Corridor Track
              </button>
              <button
                onClick={() => setActiveTab('schematic')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: activeTab === 'schematic' ? 600 : 400,
                  backgroundColor: activeTab === 'schematic' ? '#0284c7' : 'transparent',
                  color: activeTab === 'schematic' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Compass size={13} />
                All Route Waypoints ({legProgress.allLegs?.length ?? 1} Legs)
              </button>
            </div>

            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Leg Progress: <strong style={{ color: '#38bdf8' }}>{Math.round(legProgress.legFraction * 100)}%</strong> ({legProgress.legCoveredMiles} of {legProgress.legDistance} mi)
            </span>
          </div>

          {/* MAP / SCHEMATIC CONTAINER */}
          {activeTab === 'google' ? (
            <div style={{ position: 'relative', width: '100%', height: '360px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', backgroundColor: '#090d16' }}>
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
              <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10, backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid #334155', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', color: '#cbd5e1', backdropFilter: 'blur(4px)' }}>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>&bull; Google Maps Live Routing</span> &bull; {legProgress.fromLocation} ➔ {legProgress.toLocation}
              </div>
              {mapError && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', zIndex: 20 }}>
                  <AlertTriangle size={32} className="text-amber-400 mb-2" />
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Google Maps Configuration</h4>
                  <p style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '360px', marginBottom: '14px' }}>{mapError}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('track')}
                    style={{ padding: '6px 14px', backgroundColor: '#0284c7', color: '#ffffff', fontSize: '12px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                  >
                    View Corridor Track Instead
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'track' ? (
            <LiveTransitMapRenderer
              originLocation={legProgress.fromLocation}
              destLocation={legProgress.toLocation}
              originCoords={estLocation.originCoordinates}
              destCoords={estLocation.destCoordinates}
              currentCoords={estLocation.coordinates}
              progressFraction={legProgress.legFraction}
              milestone={legProgress.corridorMilestone}
              isDeadhead={legProgress.isDeadhead}
              totalMiles={legProgress.legDistance}
              coveredMiles={legProgress.legCoveredMiles}
              remainingMiles={legProgress.legRemainingMiles}
              etaFormatted={legProgress.nextStopEtaFormatted}
              countdownFormatted={legProgress.nextStopCountdownFormatted}
            />
          ) : (
            /* Sequenced Multi-Stop Route Waypoints Stepper */
            <div
              style={{
                backgroundColor: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px',
                minHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                  Trip Container Sequence &bull; {legProgress.totalLegs} Route Legs
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Total Trip Distance: <strong style={{ color: '#38bdf8' }}>{legProgress.totalTripMiles} mi</strong>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {legProgress.allLegs && legProgress.allLegs.length > 0 ? (
                  legProgress.allLegs.map((leg) => {
                    const isAct = leg.status === 'active';
                    const isDone = leg.status === 'completed';
                    const isPending = leg.status === 'pending';
                    return (
                      <div
                        key={leg.index}
                        style={{
                          backgroundColor: isAct ? 'rgba(14, 165, 233, 0.12)' : isPending ? 'rgba(245, 158, 11, 0.05)' : '#0f172a',
                          border: isAct ? '1px solid rgba(56, 189, 248, 0.5)' : isPending ? '1px dashed rgba(245, 158, 11, 0.3)' : '1px solid #1e293b',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: isAct ? '#0284c7' : isDone ? '#065f46' : '#1e293b',
                              color: isAct ? '#ffffff' : isDone ? '#34d399' : '#94a3b8',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            Leg {leg.index + 1}
                          </span>
                          <div>
                            <strong style={{ fontSize: '12px', color: isAct ? '#38bdf8' : isDone ? '#e2e8f0' : '#cbd5e1' }}>
                              {leg.fromLocation} ➔ {leg.toLocation}
                            </strong>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>
                              Stop Type: {leg.isDeadhead ? '🚚 Deadhead Transit to Pickup' : leg.toType === 'pickup' ? '📦 Pickup Terminal' : '🏁 Delivery Dropoff'}
                            </span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ fontSize: '12px', color: isAct ? '#38bdf8' : isDone ? '#4ade80' : '#f59e0b', display: 'block' }}>
                            {isDone ? 'Completed' : isAct ? `${Math.round(leg.legFraction * 100)}% (${leg.legRemainingMiles} mi left)` : `Queued (${leg.legDistance} mi)`}
                          </strong>
                          {!isDone && leg.legEtaFormatted && leg.legEtaFormatted !== '—' && (
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                              ETA {leg.legEtaFormatted} ({leg.legCountdownFormatted})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Single leg direct transit ({legProgress.legDistance} mi)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leg Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
              backgroundColor: '#111827',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                <Clock size={12} className="text-sky-400" /> Leg ETA
              </span>
              <strong style={{ fontSize: '15px', color: '#38bdf8', display: 'block', marginTop: '2px' }}>
                {legProgress.nextStopEtaFormatted}
              </strong>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                Arrival at {legProgress.nextStopName}
              </span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                ⏳ Time Remaining
              </span>
              <strong style={{ fontSize: '15px', color: '#fbbf24', display: 'block', marginTop: '2px' }}>
                {legProgress.nextStopCountdownFormatted}
              </strong>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                Drive time to stop
              </span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                <Gauge size={12} className="text-emerald-400" /> Distance Covered
              </span>
              <strong style={{ fontSize: '15px', color: '#4ade80', display: 'block', marginTop: '2px' }}>
                ~{legProgress.legCoveredMiles} / {legProgress.legDistance} mi
              </strong>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                ~{legProgress.legRemainingMiles} mi remaining
              </span>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                🏁 Final Trip ETA
              </span>
              <strong style={{ fontSize: '15px', color: '#e2e8f0', display: 'block', marginTop: '2px' }}>
                {legProgress.finalEtaFormatted}
              </strong>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                {legProgress.totalRemainingMiles} mi total journey
              </span>
            </div>
          </div>

        </div>

        {/* Modal Footer with Action Buttons */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#111827',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <a
              href={estLocation.googleMapsNavUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Navigate from driver's estimated position to ${legProgress.toLocation}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '6px',
                padding: '7px 12px',
                textDecoration: 'none',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.15)';
              }}
            >
              <Navigation size={13} />
              Navigate from Driver's Position
            </a>

            <a
              href={estLocation.googleMapsRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Full leg corridor: ${legProgress.fromLocation} → ${legProgress.toLocation} (via driver's current position)`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '7px 12px',
                textDecoration: 'none',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#334155';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1e293b';
              }}
            >
              <ExternalLink size={13} />
              Full Leg Corridor with Driver Waypoint
            </a>
          </div>

          <button
            onClick={onClose}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: '#334155',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 16px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#475569';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#334155';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
