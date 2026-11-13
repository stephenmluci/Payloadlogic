'use client';

import React, { useMemo } from 'react';
import type { Coordinates } from '@/lib/routeUtils';
import {
  Compass,
  Truck,
  Building2,
  Flag,
  Navigation,
  CheckCircle2,
  Gauge,
  Clock,
  MapPin,
  Route,
} from 'lucide-react';
import { LocationDisclaimerNotice } from '@/components/common/LocationDisclaimerNotice';

interface LiveTransitMapRendererProps {
  originLocation: string;
  destLocation: string;
  originCoords: Coordinates;
  destCoords: Coordinates;
  currentCoords: Coordinates;
  progressFraction: number;
  milestone?: string;
  isDeadhead?: boolean;
  totalMiles?: number;
  coveredMiles?: number;
  remainingMiles?: number;
  etaFormatted?: string;
  countdownFormatted?: string;
}

/**
 * Lightweight, zero-external-API progress visualizer and CSS/SVG track line.
 * Calculates relative position and coordinates strictly using local math without external tile requests.
 */
export function LiveTransitMapRenderer({
  originLocation,
  destLocation,
  originCoords,
  destCoords,
  currentCoords,
  progressFraction,
  milestone,
  isDeadhead,
  totalMiles,
  coveredMiles,
  remainingMiles,
  etaFormatted,
  countdownFormatted,
}: LiveTransitMapRendererProps) {
  // Normalize progress percentage strictly via local math (0% - 100%)
  const pinPercentage = useMemo(() => {
    if (typeof totalMiles === 'number' && totalMiles > 0 && typeof coveredMiles === 'number') {
      return Math.min(100, Math.max(0, (coveredMiles / totalMiles) * 100));
    }
    const frac = isNaN(progressFraction) ? 0 : progressFraction;
    return Math.min(100, Math.max(0, frac * 100));
  }, [totalMiles, coveredMiles, progressFraction]);

  // Derived mileage breakdown
  const distTotal = totalMiles ?? 480;
  const distCovered = coveredMiles ?? Math.round(distTotal * (pinPercentage / 100));
  const distRemaining = remainingMiles ?? Math.max(0, distTotal - distCovered);

  // Clean location labels
  const cleanCity = (loc: string) => {
    if (!loc) return 'Location';
    const parts = loc.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1].split(' ')[0]}`;
    }
    return parts[0];
  };

  const origName = cleanCity(originLocation);
  const destName = cleanCity(destLocation);

  return (
    <div
      style={{
        backgroundColor: '#090d16',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        color: '#f8fafc',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Header: Route Corridor & Local Math Telemetry */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Route size={16} className="text-sky-400" />
          </div>
          <div>
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Route Corridor (Local Schematic Tracking)
            </span>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
              {origName} <span style={{ color: '#38bdf8' }}>➔</span> {destName}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#38bdf8',
              backgroundColor: '#1e293b',
              padding: '3px 10px',
              borderRadius: '5px',
              border: '1px solid #334155',
            }}
          >
            {Math.round(pinPercentage)}% Completed
          </span>
        </div>
      </div>

      {/* Location Disclaimer Notice */}
      <LocationDisclaimerNotice variant="overlay" className="py-1 px-2.5 text-[10px] sm:text-[11px] w-fit" />

      {/* ── HIGHWAY SCHEMATIC TRACK LINE ───────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '45px 24px 35px 24px',
          marginTop: '10px',
          marginBottom: '5px',
          overflow: 'visible',
        }}
      >
        {/* Origin Endpoint Tag (0%) */}
        <div
          style={{
            position: 'absolute',
            left: '20px',
            top: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#a7f3d0',
          }}
        >
          <Building2 size={13} className="text-emerald-400" />
          <strong style={{ color: '#34d399' }}>{origName}</strong>
          <span style={{ fontSize: '10px', color: '#6ee7b7' }}>({originCoords.lat.toFixed(2)}, {originCoords.lng.toFixed(2)})</span>
        </div>

        {/* Destination Endpoint Tag (100%) */}
        <div
          style={{
            position: 'absolute',
            right: '20px',
            top: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#fed7aa',
            textAlign: 'right',
          }}
        >
          <span style={{ fontSize: '10px', color: '#fdba74' }}>({destCoords.lat.toFixed(2)}, {destCoords.lng.toFixed(2)})</span>
          <strong style={{ color: '#fb923c' }}>{destName}</strong>
          <Flag size={13} className="text-amber-400" />
        </div>

        {/* Asphalt Highway Surface */}
        <div
          style={{
            position: 'relative',
            height: '24px',
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            border: '2px solid #334155',
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* Dashed Center Road Divider Line */}
          <div
            style={{
              position: 'absolute',
              left: '6px',
              right: '6px',
              height: '2px',
              backgroundImage: 'linear-gradient(to right, #475569 50%, transparent 50%)',
              backgroundSize: '16px 2px',
              backgroundRepeat: 'repeat-x',
              opacity: 0.7,
              zIndex: 1,
            }}
          />

          {/* Active Completed Route Segment Glow */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${pinPercentage}%`,
              background: 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
              borderRadius: '10px',
              boxShadow: '0 0 14px rgba(56, 189, 248, 0.65)',
              transition: 'width 0.4s ease',
              zIndex: 2,
            }}
          />

          {/* Milestone Checkpoint Ticks along the Highway (25%, 50%, 75%) */}
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: '-4px',
                bottom: '-4px',
                width: '2px',
                backgroundColor: pinPercentage >= pct ? '#e2e8f0' : '#475569',
                zIndex: 3,
                boxShadow: pinPercentage >= pct ? '0 0 6px #ffffff' : 'none',
              }}
            />
          ))}

          {/* ── DYNAMIC LIVE DRIVER PIN MARKER ─────────────────────────────── */}
          {/* Binds strictly to the calculated pin percentage based on local math */}
          <div
            style={{
              position: 'absolute',
              top: '-18px',
              left: `${pinPercentage}%`,
              transform: 'translateX(-50%)',
              zIndex: 10,
              transition: 'left 0.4s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {/* Pulsing Beacon Ring */}
            <div
              style={{
                position: 'relative',
                width: '42px',
                height: '42px',
                backgroundColor: '#0f172a',
                border: '2.5px solid #38bdf8',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(56, 189, 248, 0.9), 0 4px 10px rgba(0,0,0,0.6)',
                cursor: 'pointer',
              }}
              title={`Driver position: ${currentCoords.lat.toFixed(5)}, ${currentCoords.lng.toFixed(5)} (${Math.round(pinPercentage)}% along active leg)`}
            >
              <Truck size={20} className="text-sky-400" />
            </div>

            {/* Downward indicator triangle */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '6px solid #38bdf8',
                marginTop: '-1px',
              }}
            />
          </div>
        </div>

        {/* Mile Marker Labels under the track */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '12px',
            fontSize: '10px',
            color: '#64748b',
          }}
        >
          <span>0 mi (Start)</span>
          <span>~{Math.round(distTotal * 0.25)} mi (25%)</span>
          <span>~{Math.round(distTotal * 0.50)} mi (Midway)</span>
          <span>~{Math.round(distTotal * 0.75)} mi (75%)</span>
          <span>{distTotal} mi (End)</span>
        </div>
      </div>

      {/* Real-time Highway Milestone Banner */}
      <div
        style={{
          backgroundColor: '#111827',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Compass size={18} className="text-sky-400 shrink-0" />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Current Highway Corridor &amp; Regional Milestone
          </span>
          <div style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: 500, marginTop: '2px' }}>
            {milestone || `${origName} outbound transport corridor toward ${destName}`}
          </div>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>INTERPOLATED POSITION</span>
          <code style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600, fontFamily: 'Consolas, monospace' }}>
            {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}
          </code>
        </div>
      </div>

      {/* Mathematical Breakdown Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '12px',
        }}
      >
        <div>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
            <Gauge size={12} className="text-sky-400" /> Leg Distance Covered
          </span>
          <strong style={{ fontSize: '14px', color: '#38bdf8', display: 'block', marginTop: '2px' }}>
            ~{distCovered} mi
          </strong>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
            of {distTotal} total leg miles
          </span>
        </div>

        <div>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
            🏁 Distance Remaining
          </span>
          <strong style={{ fontSize: '14px', color: '#fbbf24', display: 'block', marginTop: '2px' }}>
            ~{distRemaining} mi
          </strong>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
            to {destName}
          </span>
        </div>

        {etaFormatted && (
          <div>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
              <Clock size={12} className="text-emerald-400" /> Estimated Waypoint ETA
            </span>
            <strong style={{ fontSize: '14px', color: '#4ade80', display: 'block', marginTop: '2px' }}>
              {etaFormatted}
            </strong>
            {countdownFormatted && (
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                in ~{countdownFormatted}
              </span>
            )}
          </div>
        )}

        <div>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
            <MapPin size={12} className="text-indigo-400" /> Math Calculation Base
          </span>
          <strong style={{ fontSize: '14px', color: '#e2e8f0', display: 'block', marginTop: '2px' }}>
            Linear Path Interp
          </strong>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
            Distance ratio &times; vector path
          </span>
        </div>
      </div>
    </div>
  );
}

// Named alias for convenience
export { LiveTransitMapRenderer as LiveTransitProgressVisualizer };
