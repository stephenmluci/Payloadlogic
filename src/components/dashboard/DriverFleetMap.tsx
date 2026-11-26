'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { DriverProfile, Load, Vehicle } from '@/types';
import { type Coordinates, resolveLocationCoordinates } from '@/lib/routeUtils';
import { calculateHOSTripPlan, calculateHOSAwareProgress, type HOSTripBreak } from '@/lib/hosEngine';
import {
  Truck,
  Navigation,
  MapPin,
  Layers,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Coffee,
  Gauge,
  Route,
  Activity,
  Milestone,
  Sliders,
  ChevronRight,
  ShieldCheck,
  Building2,
  Flag,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocationDisclaimerNotice } from '@/components/common/LocationDisclaimerNotice';

export type DriverFleetStatus = 'In Transit' | 'Deadheading' | 'Unloading' | 'Available' | 'Late' | 'Off Duty' | 'Arrived';

export interface DriverFleetMapItem {
  driver: DriverProfile;
  truck?: Vehicle;
  activeLoad?: Load;
  status: DriverFleetStatus;
  statusLabel: string;
  coordinates: Coordinates;
  locationName: string;
  etaFormatted?: string;
  remainingMiles?: number;
  originCoords?: Coordinates | null;
  destCoords?: Coordinates | null;
  originName?: string;
  destName?: string;
  isDeadhead?: boolean;
  /** True when the driver is sharing live GPS and the last fix is recent (< 5 min). */
  isLiveGps?: boolean;
  /** ISO timestamp of the last live GPS fix, when available. */
  liveGpsUpdatedAt?: string;
}

/** A live fix older than this is treated as stale (driver offline / app backgrounded). */
export const LIVE_GPS_FRESH_MS = 5 * 60 * 1000;

export function isDriverLiveGps(driver?: DriverProfile | null, nowMs: number = Date.now()): boolean {
  if (!driver?.liveLocationSharing) return false;
  const ts = driver.telemetry?.updatedAt ? new Date(driver.telemetry.updatedAt).getTime() : 0;
  return ts > 0 && nowMs - ts < LIVE_GPS_FRESH_MS;
}

interface DriverFleetMapProps {
  drivers: DriverFleetMapItem[];
  selectedDriverId: string | null;
  onSelectDriver: (driverId: string) => void;
  className?: string;
}

/**
 * Calculates driver positioning strictly via the established mathematical formula:
 * (Elapsed Transit Time * Estimated Speed / Total Route Mileage = Current Progress Percentage)
 */
function calculateMathematicalProgress(item: DriverFleetMapItem, avgSpeed = 55) {
  if (item.status === 'Off Duty') {
    return {
      progressPct: 0,
      elapsedHours: 0,
      estimatedSpeed: 0,
      totalMiles: 0,
      coveredMiles: 0,
      remainingMiles: 0,
      hosBreaks: [] as HOSTripBreak[],
      isResting: false,
      activeBreak: null as HOSTripBreak | null,
      breakRemainingHours: 0,
      requiresMandatoryBreak: false,
      formulaDisplay: 'Off Duty • Telemetry paused',
    };
  }

  const load = item.activeLoad;
  if (!load) {
    return {
      progressPct: 0,
      elapsedHours: 0,
      estimatedSpeed: avgSpeed,
      totalMiles: 0,
      coveredMiles: 0,
      remainingMiles: 0,
      hosBreaks: [] as HOSTripBreak[],
      isResting: false,
      activeBreak: null as HOSTripBreak | null,
      breakRemainingHours: 0,
      requiresMandatoryBreak: false,
      formulaDisplay: 'Standby • No active transit load assigned',
    };
  }

  const totalMiles = Math.max(1, load.distance || 0);
  const estimatedSpeed = avgSpeed > 0 ? avgSpeed : 55;

  let departureMs = 0;
  if (load.manualOverrideAt) {
    const overrideParsed = new Date(load.manualOverrideAt).getTime();
    if (!isNaN(overrideParsed)) departureMs = overrideParsed;
  }
  if (!departureMs) {
    const rawPickup = load.pickupDateTime || (load as any).departureDateTime || (load as any).pickupDate;
    if (rawPickup) {
      const parsed = new Date(rawPickup).getTime();
      if (!isNaN(parsed)) departureMs = parsed;
    }
  }

  const nowMs = Date.now();
  let elapsedHours = 0;
  if (departureMs > 0 && nowMs > departureMs) {
    elapsedHours = (nowMs - departureMs) / (1000 * 60 * 60);
  }

  const hosPlan = calculateHOSTripPlan(
    load.distance || 0,
    0,
    departureMs > 0 ? new Date(departureMs) : null,
    {
      averageSpeedMph: estimatedSpeed,
      availableHosHours: item.driver?.estimatedHosRemaining,
      recentOnDutyHours: (item.driver as any)?.recentOnDutyHours,
      originCoords: item.originCoords,
      destCoords: item.destCoords,
    },
  );
  const hosBreaks = hosPlan?.breaks ?? [];
  const requiresMandatoryBreak = Boolean(hosPlan?.requiresMandatoryBreak);

  let progressPct = 0;
  let coveredMiles = 0;
  let remainingMiles = totalMiles;
  let isResting = false;
  let activeBreak: HOSTripBreak | null = null;
  let breakRemainingHours = 0;

  if (item.status === 'Arrived' || load.status === 'arrived' || (load as any).status === 'Arrived' || load.driverPhase === 'Arrived') {
    const arrivalTime = load.arrivedAt
      ? new Date(load.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;
    return {
      progressPct: 95,
      elapsedHours: 0,
      estimatedSpeed: 0,
      totalMiles,
      coveredMiles: totalMiles,
      remainingMiles: 0,
      hosBreaks,
      isResting: false,
      activeBreak: null,
      breakRemainingHours: 0,
      requiresMandatoryBreak,
      formulaDisplay: arrivalTime
        ? `Arrived at Facility • Stationary / Detention Active (Arrived ${arrivalTime})`
        : 'Arrived at Facility • Stationary / Detention Clock Active',
    };
  } else if (load.status === 'delivered') {
    progressPct = 100;
    coveredMiles = totalMiles;
    remainingMiles = 0;
  } else if (load.status === 'unloading') {
    progressPct = 95;
    coveredMiles = Math.round(0.95 * totalMiles);
    remainingMiles = Math.max(0, totalMiles - coveredMiles);
  } else if (load.status === 'loading') {
    progressPct = 5;
    coveredMiles = Math.round(0.05 * totalMiles);
    remainingMiles = Math.max(0, totalMiles - coveredMiles);
  } else if (hosPlan && requiresMandatoryBreak) {
    const hosProgress = calculateHOSAwareProgress(hosPlan, elapsedHours);
    progressPct = hosProgress.progressPct;
    coveredMiles = hosProgress.coveredMiles;
    remainingMiles = hosProgress.remainingMiles;
    isResting = hosProgress.isResting;
    activeBreak = hosProgress.activeBreak;
    breakRemainingHours = hosProgress.breakRemainingHours;
  } else {
    // Strict mathematical interpolation:
    // (Elapsed Transit Time * Estimated Speed / Total Route Mileage = Current Progress Percentage)
    const rawProgress = (elapsedHours * estimatedSpeed) / totalMiles;
    progressPct = Math.min(98, Math.max(2, Math.round(rawProgress * 100)));
    coveredMiles = Math.round((progressPct / 100) * totalMiles);
    remainingMiles = Math.max(0, totalMiles - coveredMiles);
  }

  const formulaDisplay = isResting && activeBreak
    ? `HOS 10-hr Rest Break @ Mile ${activeBreak.atMiles} (${breakRemainingHours.toFixed(1)}h remaining) • Progress paused at ${progressPct}%`
    : requiresMandatoryBreak
      ? `(${elapsedHours.toFixed(1)}h elapsed incl. 10h HOS break × ${estimatedSpeed} mph) / ${totalMiles} mi = ${progressPct}% Progress`
      : `(${elapsedHours.toFixed(1)}h elapsed × ${estimatedSpeed} mph) / ${totalMiles} mi = ${progressPct}% Progress`;

  return {
    progressPct,
    elapsedHours,
    estimatedSpeed,
    totalMiles,
    coveredMiles,
    remainingMiles,
    hosBreaks,
    isResting,
    activeBreak,
    breakRemainingHours,
    requiresMandatoryBreak,
    formulaDisplay,
  };
}

/**
 * Resolves the real-time geographic coordinates for a fleet driver.
 * Prioritizes direct telemetry coordinates, falling back to math interpolation along the active transit route,
 * or driver staging coordinates.
 */
export function getDriverCoordinates(item: DriverFleetMapItem | null | undefined): { lat: number; lng: number } {
  if (!item) return { lat: 39.8283, lng: -98.5795 };

  // 1. Direct telemetry coordinates if valid and non-zero
  if (
    typeof item.coordinates?.lat === 'number' &&
    typeof item.coordinates?.lng === 'number' &&
    !isNaN(item.coordinates.lat) &&
    !isNaN(item.coordinates.lng) &&
    (item.coordinates.lat !== 0 || item.coordinates.lng !== 0)
  ) {
    const isGenericFallback =
      Math.abs(item.coordinates.lat - 39.8283) < 0.001 &&
      Math.abs(item.coordinates.lng - (-98.5795)) < 0.001;

    // If it is NOT the generic fallback, use direct telemetry
    if (!isGenericFallback) {
      return { lat: item.coordinates.lat, lng: item.coordinates.lng };
    }
  }

  // 2. Dynamic progress interpolation along active origin/destination route corridor
  // Only interpolate along a route if the driver actually has an active in-transit load
  if (item.originCoords && item.destCoords && item.activeLoad && item.status !== 'Available' && item.status !== 'Off Duty') {
    const math = calculateMathematicalProgress(item);
    const frac = Math.min(1, Math.max(0, (math.progressPct || 0) / 100));
    return {
      lat: item.originCoords.lat + (item.destCoords.lat - item.originCoords.lat) * frac,
      lng: item.originCoords.lng + (item.destCoords.lng - item.originCoords.lng) * frac,
    };
  }

  // 3. Staging location coordinates resolution from profile source of truth
  const stagingText = item.driver?.currentStaging || (item.driver?.lastLocationCity ? `${item.driver.lastLocationCity}, ${item.driver.lastLocationState || ''}`.trim() : '') || item.locationName;
  if (stagingText) {
    const stagingCoords = resolveLocationCoordinates(stagingText);
    if (stagingCoords && !(Math.abs(stagingCoords.lat - 39.8283) < 0.001 && Math.abs(stagingCoords.lng - (-98.5795)) < 0.001)) {
      return stagingCoords;
    }
  }

  // 4. Telemetry coordinates fallback even if generic
  if (
    typeof item.coordinates?.lat === 'number' &&
    typeof item.coordinates?.lng === 'number' &&
    !isNaN(item.coordinates.lat) &&
    !isNaN(item.coordinates.lng)
  ) {
    return { lat: item.coordinates.lat, lng: item.coordinates.lng };
  }

  return { lat: 39.8283, lng: -98.5795 };
}

export interface GoogleMapProps {
  center: { lat: number; lng: number };
  zoom: number;
  drivers: DriverFleetMapItem[];
  selectedItem: DriverFleetMapItem | null;
  onSelectDriver: (driverId: string) => void;
  mapType?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
  isVisible?: boolean;
  flyToTrigger?: number;
  onSwitchToCorridor?: () => void;
  className?: string;
}

/**
 * Recognizable Google Map component with dynamic telemetry binding,
 * persistent canvas lifecycle, and automatic flight to active driver coordinates.
 */
export function GoogleMap({
  center,
  zoom,
  drivers,
  selectedItem,
  onSelectDriver,
  mapType = 'roadmap',
  isVisible = true,
  flyToTrigger = 0,
  onSwitchToCorridor,
  className = '',
}: GoogleMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routePolylineRef = useRef<any>(null);
  const activeInfoWindowRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize Google Maps instance once and persist it on the DOM element
  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      const apiKey = (
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
        ''
      ).trim();

      (window as any).gm_authFailure = () => {
        setMapError(
          'Maps JavaScript API is not activated for this key in Google Cloud Console (ApiNotActivatedMapError). Please enable "Maps JavaScript API" in your Google Cloud Console.'
        );
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
                setMapError('Failed to load Google Maps script. Check your API key and network connection.');
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

      // Initialize map instance if not already created
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new googleMaps.Map(mapContainerRef.current, {
          center,
          zoom,
          mapTypeId: mapType === 'satellite' ? googleMaps.MapTypeId.SATELLITE : googleMaps.MapTypeId.ROADMAP,
          disableDefaultUI: false,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: googleMaps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: googleMaps.ControlPosition.TOP_RIGHT,
          },
          zoomControl: true,
          zoomControlOptions: {
            position: googleMaps.ControlPosition.RIGHT_CENTER,
          },
          streetViewControl: true,
          fullscreenControl: true,
          scaleControl: true,
        });
      }
    }

    initMap();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 1. Dynamic Driver Tracking: Immediately fly to the active driver's coordinates when selected
  useEffect(() => {
    if (!mapInstanceRef.current || !center) return;

    // Immediately fly/pan to the selected driver's location
    mapInstanceRef.current.panTo(center);

    if (typeof zoom === 'number') {
      const currentZoom = mapInstanceRef.current.getZoom();
      if (Math.abs(currentZoom - zoom) > 1) {
        mapInstanceRef.current.setZoom(zoom);
      }
    }
  }, [center.lat, center.lng, zoom]);

  // 2. Tab Switching / Unmounting Bug: Trigger resize and fly to location when visibility restored
  useEffect(() => {
    if (isVisible && mapInstanceRef.current && (window as any).google?.maps) {
      const timer = setTimeout(() => {
        if (!mapInstanceRef.current) return;
        (window as any).google.maps.event.trigger(mapInstanceRef.current, 'resize');
        if (center) {
          mapInstanceRef.current.panTo(center);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, center]);

  // 3. Explicit "Fly to Driver" button trigger from the bottom control bar
  useEffect(() => {
    if (flyToTrigger > 0 && mapInstanceRef.current && center) {
      mapInstanceRef.current.panTo(center);
      mapInstanceRef.current.setZoom(12);
    }
  }, [flyToTrigger, center]);

  // Sync Markers and Active Route Polyline whenever drivers or selectedItem changes
  useEffect(() => {
    if (!mapInstanceRef.current || !((window as any).google?.maps)) return;
    const googleMaps = (window as any).google.maps;
    const map = mapInstanceRef.current;

    // Clear previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Clear previous route polyline
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    // Render active driver route polyline if origin and destination coordinates are available
    if (selectedItem?.originCoords && selectedItem?.destCoords) {
      routePolylineRef.current = new googleMaps.Polyline({
        path: [
          { lat: selectedItem.originCoords.lat, lng: selectedItem.originCoords.lng },
          { lat: selectedItem.destCoords.lat, lng: selectedItem.destCoords.lng },
        ],
        geodesic: true,
        strokeColor: '#0284c7',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map,
      });
    }

    // Plot all drivers
    drivers.forEach((d) => {
      const pos = getDriverCoordinates(d);
      const isSelected = Boolean(
        selectedItem && (
          (d.driver.uid && d.driver.uid === selectedItem.driver.uid) ||
          (d.driver.id && d.driver.id === selectedItem.driver.id)
        )
      );
      const math = calculateMathematicalProgress(d);

      const color =
        d.status === 'In Transit'
          ? '#10b981'
          : d.status === 'Deadheading'
          ? '#6366f1'
          : d.status === 'Late'
          ? '#ef4444'
          : '#0ea5e9';

      const isAvailableOrOffDuty = d.status === 'Available' || d.status === 'Off Duty';
      const stagingText = d.driver.currentStaging || (d.driver.lastLocationCity ? `${d.driver.lastLocationCity}, ${d.driver.lastLocationState || ''}`.trim() : '') || d.locationName;

      const marker = new googleMaps.Marker({
        position: pos,
        map,
        title: `${d.driver.name} (${math.progressPct}%)`,
        zIndex: isSelected ? 999 : 10,
        icon: {
          path: googleMaps.SymbolPath.CIRCLE,
          scale: isSelected ? 12 : 8,
          fillColor: d.isLiveGps ? '#22c55e' : color,
          fillOpacity: 1,
          strokeColor: isSelected ? '#ffffff' : d.isLiveGps ? '#15803d' : '#0f172a',
          strokeWeight: isSelected ? 3 : 2,
        },
      });

      const infoWindow = new googleMaps.InfoWindow({
        content: `
          <div style="color: #0f172a; font-family: sans-serif; padding: 6px 8px; min-width: 170px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${d.driver.name}${d.isLiveGps ? ' <span style="color:#059669;font-size:10px;font-weight:700;">● LIVE GPS</span>' : ''}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 4px;">Status: <b>${d.status}</b> ${!isAvailableOrOffDuty ? `(${math.progressPct}%)` : ''}</div>
            ${!isAvailableOrOffDuty ? `<div style="font-size: 10px; color: #64748b;">${d.originName || 'Origin'} &rarr; ${d.destName || 'Destination'}</div>` : ''}
            <div style="font-size: 11px; color: #0284c7; margin-top: 3px;">📍 ${isAvailableOrOffDuty ? `Current Staging: <b>${stagingText}</b>` : d.locationName}</div>
            ${!isAvailableOrOffDuty && stagingText && stagingText !== d.locationName ? `<div style="font-size: 10px; color: #64748b; margin-top: 1px;">Base Staging: ${stagingText}</div>` : ''}
          </div>
        `,
      });

      marker.addListener('click', () => {
        onSelectDriver(d.driver.id || d.driver.uid);
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }
        infoWindow.open(map, marker);
        activeInfoWindowRef.current = infoWindow;
      });

      if (isSelected && isVisible) {
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }
        infoWindow.open(map, marker);
        activeInfoWindowRef.current = infoWindow;
      }

      markersRef.current.push(marker);

      if (isSelected && math.hosBreaks.length > 0) {
        math.hosBreaks.forEach((brk) => {
          if (!brk.coordinates) return;
          const restMarker = new googleMaps.Marker({
            position: brk.coordinates,
            map,
            title: brk.label,
            zIndex: 998,
            icon: {
              path: googleMaps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#f59e0b',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          });
          const restInfo = new googleMaps.InfoWindow({
            content: `
              <div style="color: #0f172a; font-family: sans-serif; padding: 6px 8px; min-width: 180px;">
                <div style="font-weight: 700; font-size: 12px; color: #b45309;">☕ Mandatory 10-hr HOS Rest Stop</div>
                <div style="font-size: 11px; color: #334155; margin-top: 2px;">Stop at <b>Mile ${brk.atMiles.toLocaleString()}</b> (${brk.atDriveHours}h driven)</div>
                ${brk.startTime && brk.endTime ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">Est. Window: ${brk.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${brk.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>` : ''}
              </div>
            `,
          });
          restMarker.addListener('click', () => {
            if (activeInfoWindowRef.current) activeInfoWindowRef.current.close();
            restInfo.open(map, restMarker);
            activeInfoWindowRef.current = restInfo;
          });
          markersRef.current.push(restMarker);
        });
      }
    });
  }, [drivers, selectedItem, onSelectDriver, isVisible]);

  return (
    <div className={`h-full w-full relative ${className}`}>
      {/* Map Canvas - Persistent DOM Node (unobstructed) */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* API Configuration Alert Overlay */}
      {mapError && (
        <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center z-20">
          <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
          <h4 className="text-sm font-semibold text-white mb-1">Google Maps API Configuration</h4>
          <p className="text-xs text-slate-400 max-w-sm mb-3">{mapError}</p>
          {onSwitchToCorridor && (
            <button
              type="button"
              onClick={onSwitchToCorridor}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              View Corridor Track Instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DriverFleetMap({
  drivers,
  selectedDriverId,
  onSelectDriver,
  className = '',
}: DriverFleetMapProps) {
  const [viewMode, setViewMode] = useState<'map' | 'corridor' | 'timelines'>('map');
  const [statusFilter, setStatusFilter] = useState<'All' | DriverFleetStatus>('All');
  const [flyToTrigger, setFlyToTrigger] = useState(0);

  // Filtered drivers based on selected filter pill
  const filteredDrivers = useMemo(() => {
    if (statusFilter === 'All') return drivers;
    return drivers.filter(d => d.status === statusFilter);
  }, [drivers, statusFilter]);

  // Active selected driver item
  const selectedItem = useMemo(() => {
    return drivers.find(d => 
      (selectedDriverId && (d.driver.uid === selectedDriverId || d.driver.id === selectedDriverId))
    ) || filteredDrivers[0] || drivers[0] || null;
  }, [drivers, selectedDriverId, filteredDrivers]);

  // Dynamically bound center coordinates for the selected driver
  const dynamicMapCenter = useMemo(() => {
    return getDriverCoordinates(selectedItem);
  }, [selectedItem]);

  // Dynamically bound zoom: close-up for individual driver tracking, country overview if none
  const dynamicMapZoom = useMemo(() => {
    return selectedItem ? 12 : 4;
  }, [selectedItem]);

  // Status color mapper
  const getStatusBadge = (status: DriverFleetStatus) => {
    switch (status) {
      case 'Arrived':     return { bg: 'bg-teal-500/20 text-teal-300 border-teal-500/40', dot: '#14b8a6' };
      case 'In Transit':  return { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dot: '#10b981' };
      case 'Deadheading': return { bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', dot: '#6366f1' };
      case 'Unloading':   return { bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40', dot: '#f59e0b' };
      case 'Late':        return { bg: 'bg-rose-500/20 text-rose-400 border-rose-500/40', dot: '#ef4444' };
      case 'Off Duty':    return { bg: 'bg-slate-700/40 text-slate-400 border-slate-600/50', dot: '#94a3b8' };
      case 'Available':   default: return { bg: 'bg-sky-500/20 text-sky-400 border-sky-500/40', dot: '#38bdf8' };
    }
  };

  const selectedMath = selectedItem ? calculateMathematicalProgress(selectedItem) : null;

  return (
    <div className={`relative flex flex-col h-full w-full bg-[#090d16] text-slate-100 overflow-hidden rounded-xl border border-slate-800 ${className}`}>
      {/* ── Top Header Control Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Route className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Estimated Fleet Position
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold uppercase">
                Calculated Progression
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Approximate location based on speed and mileage &bull; Not live GPS
            </p>
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'map' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
            title="Google Maps Satellite & Street Navigation"
          >
            Google Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode('corridor')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'corridor' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Corridor Track
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timelines')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewMode === 'timelines' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Fleet Timelines
          </button>
        </div>
      </div>

      {/* ── Mathematical Telemetry HUD Banner (desktop/tablet) ── */}
      <div className="hidden sm:flex px-4 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex-wrap items-center justify-between gap-2 text-[11px] z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span className="text-slate-400 font-mono text-[10px] sm:text-[11px]">
            Formula: <span className="text-sky-300 font-semibold">{selectedMath?.formulaDisplay || 'Calculating telemetry…'}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span>Speed: <strong className="text-white">{selectedMath?.estimatedSpeed || 55} mph</strong></span>
          <span>&bull;</span>
          <span>Method: <strong className="text-sky-400">Calculated Progression</strong></span>
        </div>
      </div>

      {/* ── Main Display Body ── */}
      <div className={`relative flex-1 min-h-0 ${viewMode === 'map' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* VIEW 1: Localized SVG Route Corridor */}
        <div className={`h-full flex-col justify-between p-4 sm:p-6 space-y-4 ${viewMode === 'corridor' ? 'flex' : 'hidden'}`}>
            {selectedItem ? (
              <>
                {/* Active Corridor Card */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                  {/* Driver Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                        {selectedItem.driver.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{selectedItem.driver.name}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getStatusBadge(selectedItem.status).bg}`}>
                            {selectedItem.status}
                          </span>
                          {selectedItem.isLiveGps && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Live GPS
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {selectedItem.truck ? `Unit #${selectedItem.truck.unitNumber || selectedItem.truck.name}` : 'Truck Assigned'}
                          {selectedItem.activeLoad ? ` &bull; Load #${selectedItem.activeLoad.loadNumber || selectedItem.activeLoad.id?.substring(0, 6)}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-2xl font-black text-sky-400 font-mono">
                        {selectedMath?.progressPct}%
                      </span>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Transit Progress</p>
                    </div>
                  </div>

                  {/* Highway Track Visualizer (Localized SVG & CSS Canvas) */}
                  <div className="relative py-6 px-2 sm:px-6">
                    {/* SVG Route Line */}
                    <div className="relative h-10 flex items-center">
                      {/* Background track line */}
                      <div className="absolute inset-x-0 h-2 bg-slate-800 rounded-full" />
                      
                      {/* Active progress fill */}
                      <div
                        className="absolute left-0 h-2 bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm shadow-sky-500/50"
                        style={{ width: `${selectedMath?.progressPct || 0}%` }}
                      />

                      {/* Milestone Checkpoint Dots */}
                      {[0, 25, 50, 75, 100].map(pct => (
                        <div
                          key={pct}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                          style={{ left: `${pct}%` }}
                        >
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            (selectedMath?.progressPct || 0) >= pct
                              ? 'bg-sky-400 border-white shadow-xs shadow-sky-400'
                              : 'bg-slate-800 border-slate-600'
                          }`} />
                          <span className="text-[9px] text-slate-400 font-mono mt-3">
                            {pct}%
                          </span>
                        </div>
                      ))}

                      {/* Mandatory HOS Rest Break Markers */}
                      {selectedMath?.hosBreaks.map(brk => (
                        <div
                          key={`hos-brk-${brk.breakIndex}`}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex flex-col items-center"
                          style={{ left: `${Math.round(brk.routeFraction * 100)}%` }}
                          title={brk.label}
                        >
                          <div className="p-1.5 rounded-full bg-amber-500 border-2 border-white shadow-md text-slate-950">
                            <Coffee className="h-3 w-3" />
                          </div>
                          <span className="text-[9px] font-bold text-amber-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-amber-500/40 whitespace-nowrap mt-1">
                            10h HOS Break (Mi {brk.atMiles})
                          </span>
                        </div>
                      ))}

                        {/* Calculated Driver Marker Pin */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 transition-all duration-700 flex flex-col items-center"
                          style={{ left: `${selectedMath?.progressPct || 0}%` }}
                        >
                          {/* Driver Pin Bubble */}
                          <div className="relative p-2 rounded-xl bg-slate-900 border-2 border-emerald-400 shadow-xl shadow-emerald-500/20 text-emerald-400 flex items-center gap-1.5 cursor-pointer">
                            <Truck className="h-4 w-4" />
                            <span className="text-[10px] font-bold text-white whitespace-nowrap">
                              {selectedMath?.estimatedSpeed} MPH (Est.)
                            </span>
                          </div>
                        </div>
                    </div>

                    {/* Terminal Labels Below Track */}
                    <div className="flex justify-between items-start mt-8 pt-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-300 font-semibold">
                          <Building2 className="h-3.5 w-3.5 text-blue-400" />
                          <span>Origin (0%)</span>
                        </div>
                        <p className="text-[11px] text-slate-400 max-w-[160px] truncate">
                          {selectedItem.originName || selectedItem.activeLoad?.origin?.city || 'Terminal Origin'}
                        </p>
                        <p className="text-[10px] text-slate-500">Departure Verified</p>
                      </div>

                      <div className="text-center space-y-0.5">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                          Covered vs Remaining
                        </span>
                        <p className="text-xs font-mono font-bold text-sky-300">
                          {selectedMath?.coveredMiles} mi / {selectedMath?.totalMiles} mi
                        </p>
                        <p className="text-[10px] text-emerald-400">
                          {selectedMath?.remainingMiles} mi to go
                        </p>
                      </div>

                      <div className="text-right space-y-0.5">
                        <div className="flex items-center justify-end gap-1 text-slate-300 font-semibold">
                          <span>Destination (100%)</span>
                          <Flag className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                        <p className="text-[11px] text-slate-400 max-w-[160px] truncate">
                          {selectedItem.destName || selectedItem.activeLoad?.destination?.city || 'Delivery Terminal'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          ETA: {selectedItem.etaFormatted || 'On Schedule'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Trip Timeline (with Mandatory HOS Rest Stops) */}
                  {selectedMath && selectedMath.hosBreaks.length > 0 && (
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                          <Coffee className="h-3.5 w-3.5 text-amber-400" />
                          Mandatory HOS Rest Stops ({selectedMath.hosBreaks.length} &times; 10h)
                        </span>
                        <span className="text-slate-400">Multi-shift trip (exceeds 11h HOS)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedMath.hosBreaks.map(brk => (
                          <div
                            key={`timeline-brk-${brk.breakIndex}`}
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              selectedMath.activeBreak?.breakIndex === brk.breakIndex
                                ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                                : 'border-slate-800 bg-slate-950/60 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span>Stop #{brk.breakIndex}: Mile {brk.atMiles.toLocaleString()} ({Math.round(brk.routeFraction * 100)}%)</span>
                              <span className="text-amber-300">{brk.durationHours}h Rest</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              After {brk.atDriveHours}h driven
                              {brk.startTime && brk.endTime
                                ? ` • ${brk.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} → ${brk.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                                : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mathematical Telemetry Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 text-[10px] uppercase block">Elapsed Drive Time</span>
                    <span className="text-sm font-bold text-white font-mono">{selectedMath?.elapsedHours.toFixed(1)} hrs</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 text-[10px] uppercase block">Estimated Speed</span>
                    <span className="text-sm font-bold text-sky-400 font-mono">{selectedMath?.estimatedSpeed} mph</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 text-[10px] uppercase block">Distance Covered</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">{selectedMath?.coveredMiles} miles</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <span className="text-slate-400 text-[10px] uppercase block">Remaining Miles</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">{selectedMath?.remainingMiles} miles</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-center p-8">
                <div>
                  <Compass className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No active driver selected</p>
                  <p className="text-xs text-slate-500 mt-1">Select a driver from the switcher below to view corridor telemetry.</p>
                </div>
              </div>
            )}
        </div>

        {/* VIEW 2: Fleet Comparative Multi-Timelines */}
        <div className={`p-4 sm:p-6 space-y-3 ${viewMode === 'timelines' ? 'block' : 'hidden'}`}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Comparative Fleet Progress Timelines ({filteredDrivers.length} Drivers)
            </span>
            <span className="text-[10px] text-slate-500">Calculated Progression</span>
          </div>

          <div className="space-y-3">
            {filteredDrivers.map(item => {
              const math = calculateMathematicalProgress(item);
              const isSelected = item.driver.uid === selectedItem?.driver.uid;

              return (
                <div
                  key={item.driver.uid}
                  onClick={() => onSelectDriver(item.driver.uid)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-slate-900 border-sky-500 shadow-md shadow-sky-500/10' 
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-white truncate">{item.driver.name}</span>
                      <span className={`text-[10px] px-2 py-0.2 rounded font-bold border ${getStatusBadge(item.status).bg}`}>
                        {item.status}
                      </span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline truncate">
                        {item.originName || 'Origin'} &rarr; {item.destName || 'Destination'}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-sky-400 text-sm shrink-0">
                      {math.progressPct}%
                    </span>
                  </div>

                  {/* Progress Track */}
                  <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full"
                      style={{ width: `${math.progressPct}%` }}
                    />
                    {math.hosBreaks.map(brk => (
                      <div
                        key={`tl-brk-${brk.breakIndex}`}
                        className="absolute top-0 bottom-0 w-1.5 bg-amber-400"
                        style={{ left: `${Math.round(brk.routeFraction * 100)}%` }}
                        title={brk.label}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-2 mt-2 text-[10px] text-slate-400 font-mono">
                    <span>Covered: {math.coveredMiles} mi</span>
                    {math.hosBreaks.length > 0 && (
                      <span className="text-amber-300 font-sans font-semibold">
                        ☕ {math.hosBreaks.length}&times;10h HOS Break @ Mi {math.hosBreaks[0].atMiles}
                      </span>
                    )}
                    <span>Speed: {math.estimatedSpeed} mph</span>
                    <span>Remaining: {math.remainingMiles} mi</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* VIEW 3: Google Maps High-Definition Container */}
        <div className={`h-full w-full relative ${viewMode === 'map' ? 'block' : 'hidden'}`}>
          <GoogleMap
            center={dynamicMapCenter}
            zoom={dynamicMapZoom}
            drivers={drivers}
            selectedItem={selectedItem}
            onSelectDriver={onSelectDriver}
            mapType="roadmap"
            isVisible={viewMode === 'map'}
            flyToTrigger={flyToTrigger}
            onSwitchToCorridor={() => setViewMode('corridor')}
          />
        </div>
      </div>

      {/* ── Bottom Fleet Driver Switcher Bar ── */}
      <div className="p-2.5 bg-slate-950 border-t border-slate-800/90 z-20 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="text-[10px] uppercase font-bold text-slate-500 px-1.5 shrink-0">
            Fleet:
          </span>
          {viewMode === 'map' && selectedItem && (
            <button
              type="button"
              onClick={() => setFlyToTrigger((n) => n + 1)}
              className="shrink-0 px-2.5 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="Center map on active driver location"
            >
              <Navigation className="h-3.5 w-3.5" />
              Fly to {selectedItem.driver.name.split(' ')[0]}
            </button>
          )}
          {drivers.map(d => {
            const isSelected = d.driver.uid === selectedItem?.driver.uid;
            const math = calculateMathematicalProgress(d);

            return (
              <button
                key={d.driver.uid}
                type="button"
                onClick={() => onSelectDriver(d.driver.uid)}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition-all text-xs flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 border-blue-400 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getStatusBadge(d.status).dot }}
                />
                <span className="font-semibold">{d.driver.name}</span>
                <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-100 font-bold' : 'text-slate-400'}`}>
                  {math.progressPct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
