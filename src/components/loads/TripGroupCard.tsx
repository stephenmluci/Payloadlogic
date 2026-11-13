"use client";

import React from 'react';
import type { Load, Trip, Vehicle, DriverProfile } from '@/types';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Route, Truck as TruckIcon, ArrowRight } from 'lucide-react';
import { getDispatcherStatusLabel } from './LoadCard';

type TripGroupCardProps = {
  trip: Trip;
  /** Active (not delivered) loads that belong to this trip */
  stops: Load[];
  vehicles: Vehicle[];
  driverProfiles: DriverProfile[];
  /** Renders the full load card for a stop — keeps all existing load actions available */
  renderLoadCard: (load: Load) => React.ReactNode;
  defaultExpanded?: boolean;
};

const cityState = (a?: { city?: string; state?: string }) =>
  [a?.city, a?.state].filter(Boolean).join(', ') || '—';

/**
 * Visually distinct container for a multi-stop trip in the Active Loads list.
 * Collapsed: compact stop list with status badges. Expanded: full load cards.
 */
export function TripGroupCard({
  trip, stops, vehicles, driverProfiles, renderLoadCard, defaultExpanded = false,
}: TripGroupCardProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  const ordered = React.useMemo(
    () => [...stops].sort((a, b) =>
      new Date(a.pickupDateTime || 0).getTime() - new Date(b.pickupDateTime || 0).getTime()),
    [stops]
  );

  const truck = vehicles.find(v => v.id === trip.assignedTruckId);
  const trailer = vehicles.find(v => v.id === (trip.assignedTrailerId || ordered[0]?.assignedTrailerId));
  const driver = driverProfiles.find(d => d.uid === trip.assignedDriverId);

  // How many stops are in each status, for the header summary
  const statusCounts = ordered.reduce<Record<string, { count: number; label: string; color: string }>>((acc, l) => {
    const s = getDispatcherStatusLabel(l.status as string, l);
    acc[s.label] = acc[s.label] ? { ...acc[s.label], count: acc[s.label].count + 1 } : { count: 1, label: s.label, color: s.color };
    return acc;
  }, {});

  const equipment = [
    truck ? `#${truck.unitNumber} ${truck.name}` : null,
    trailer ? `#${trailer.unitNumber} ${trailer.name}` : null,
  ].filter(Boolean).join(' + ');

  return (
    <div className="overflow-hidden rounded-xl border border-purple-200 border-l-4 border-l-purple-600 bg-purple-50/30 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-purple-50"
      >
        <span className="mt-1 text-purple-700">
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-purple-700 font-bold text-white hover:bg-purple-700">
              <Route className="mr-1 h-3.5 w-3.5" />
              Multi-Stop Trip ({ordered.length} {ordered.length === 1 ? 'load' : 'loads'})
            </Badge>
            {trip.tripNumber && <span className="text-xs font-semibold text-slate-500">{trip.tripNumber}</span>}
          </div>
          <p className="mt-1 truncate text-sm font-bold text-slate-900">{trip.name}</p>
          <p className="flex items-center gap-1 text-xs text-slate-600">
            <TruckIcon className="h-3 w-3" />
            {equipment || 'No equipment assigned'}{driver ? ` · ${driver.name}` : ''}
          </p>
        </div>
        <div className="flex max-w-[45%] flex-wrap justify-end gap-1.5">
          {Object.values(statusCounts).map(s => (
            <Badge key={s.label} variant="outline" className={`${s.color} border-none font-semibold shadow-xs`}>
              {s.count > 1 ? `${s.count} × ` : ''}{s.label}
            </Badge>
          ))}
        </div>
      </button>

      {!expanded && (
        <ol className="divide-y divide-purple-100 border-t border-purple-100 bg-white">
          {ordered.map((l, i) => {
            const s = getDispatcherStatusLabel(l.status as string, l);
            return (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{i + 1}</span>
                <span className="w-28 shrink-0 truncate font-semibold text-slate-800">{l.loadNumber || l.id?.slice(0, 8)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-slate-600">
                  {cityState(l.origin)} <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" /> {cityState(l.destination)}
                </span>
                <Badge variant="outline" className={`${s.color} shrink-0 border-none font-semibold shadow-xs`}>{s.label}</Badge>
              </li>
            );
          })}
        </ol>
      )}

      {expanded && (
        <div className="grid grid-cols-1 gap-4 border-t border-purple-100 bg-white p-4 md:grid-cols-2">
          {ordered.map((l, i) => (
            <div key={l.id} className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-widest text-purple-700">Stop {i + 1} of {ordered.length}</p>
              {renderLoadCard(l)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
