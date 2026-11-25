"use client";

import React from 'react';
import type { Load, Trip, Vehicle, DriverProfile } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronRight,
  Route,
  Truck as TruckIcon,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Navigation2,
  Layers,
  MapPin,
} from 'lucide-react';
import { getDispatcherStatusLabel } from './LoadCard';
import {
  buildChronologicalTripStops,
  computeDeckPositions,
  formatDeckPositionBadge,
  getCombinedTripGoogleMapsUrl,
  getTripStopProgressState,
  sequenceLoadsFirstOffToLastOff,
} from '@/lib/routeUtils';
import { getDriverProfileId } from '@/lib/driverAssignment';

type TripGroupCardProps = {
  trip: Trip;
  /** Active (not delivered) loads that belong to this trip / vehicle */
  stops: Load[];
  isExplicitTrip?: boolean;
  vehicles: Vehicle[];
  driverProfiles: DriverProfile[];
  onUpdateLoad?: (loadId: string, updates: Partial<Load>) => void | Promise<void>;
  /** Renders the full load card for a stop — keeps all existing load actions available */
  renderLoadCard: (load: Load) => React.ReactNode;
  defaultExpanded?: boolean;
};

const cityState = (a?: { city?: string; state?: string }) =>
  [a?.city, a?.state].filter(Boolean).join(', ') || '—';

/**
 * Visually distinct container for a multi-stop trip in the Dispatcher Active Loads list.
 * Groups loads assigned to the same vehicle/driver or explicit Trip container,
 * displays Deck Order (First Off -> Last Off) with explicit reorder controls,
 * shows the combined sequenced route across all pickups & deliveries, and keeps
 * full individual LoadCards accessible when expanded.
 */
export function TripGroupCard({
  trip,
  stops,
  isExplicitTrip = true,
  vehicles,
  driverProfiles,
  onUpdateLoad,
  renderLoadCard,
  defaultExpanded = false,
}: TripGroupCardProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [isReordering, setIsReordering] = React.useState(false);

  // Order loads by Deck Unload Order: Deck #1 • First Off -> ... -> Deck #N • Last Off
  const ordered = React.useMemo(
    () => sequenceLoadsFirstOffToLastOff(stops),
    [stops]
  );

  const deckPositions = React.useMemo(
    () => computeDeckPositions(ordered),
    [ordered]
  );
  const getDeck = (loadId?: string) => deckPositions.find(d => d.loadId === loadId);

  // Full sequenced pickup + delivery stop itinerary
  const tripItineraryStops = React.useMemo(
    () => buildChronologicalTripStops(ordered),
    [ordered]
  );

  const combinedMapsUrl = React.useMemo(
    () => getCombinedTripGoogleMapsUrl(ordered, null, false),
    [ordered]
  );

  const truckId = trip.assignedTruckId || ordered.find(l => l.assignedTruckId)?.assignedTruckId;
  const trailerId = trip.assignedTrailerId || ordered.find(l => l.assignedTrailerId)?.assignedTrailerId;
  const driverId = trip.assignedDriverId || ordered.find(l => l.assignedDriverId)?.assignedDriverId;

  const truck = vehicles.find(v => v.id === truckId);
  const trailer = vehicles.find(v => v.id === trailerId);
  const driver =
    driverProfiles.find(d => getDriverProfileId(d) === driverId || d.uid === driverId) ||
    (truckId ? driverProfiles.find(d => d.assignedTruckId === truckId) : undefined);

  const statusCounts = ordered.reduce<Record<string, { count: number; label: string; color: string }>>((acc, l) => {
    const s = getDispatcherStatusLabel(l.status as string, l);
    acc[s.label] = acc[s.label]
      ? { ...acc[s.label], count: acc[s.label].count + 1 }
      : { count: 1, label: s.label, color: s.color };
    return acc;
  }, {});

  const equipment = [
    truck ? `#${truck.unitNumber} ${truck.name}` : null,
    trailer ? `#${trailer.unitNumber} ${trailer.name}` : null,
  ].filter(Boolean).join(' + ');

  const totalWeight = ordered.reduce((sum, l) => sum + ((l.cargoWeightNum || 0) * (l.cargoQuantity || 1)), 0);
  const totalDeckFt = ordered.reduce((sum, l) => sum + ((l.cargoLength || 0) * (l.cargoQuantity || 1)), 0);
  const totalRevenue = ordered.reduce((sum, l) => sum + (Number(l.totalAgreedRate) || 0), 0);

  const handleMoveDeckPosition = async (index: number, direction: -1 | 1) => {
    if (!onUpdateLoad || isReordering) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= ordered.length) return;

    const nextOrder = [...ordered];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIdx, 0, moved);

    setIsReordering(true);
    try {
      await Promise.all(
        nextOrder.map((loadItem, idx) =>
          loadItem.id ? Promise.resolve(onUpdateLoad(loadItem.id, { deckOrder: idx + 1 })) : Promise.resolve()
        )
      );
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-purple-200 border-l-4 border-l-purple-600 bg-purple-50/30 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-purple-50/60">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer"
        >
          <span className="mt-1 text-purple-700">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-purple-700 font-bold text-white hover:bg-purple-700">
                <Route className="mr-1 h-3.5 w-3.5" />
                Multi-Stop Vehicle Trip ({ordered.length} {ordered.length === 1 ? 'load' : 'loads'} • {tripItineraryStops.length} stops)
              </Badge>
              {trip.tripNumber ? (
                <span className="text-xs font-mono font-bold text-purple-900">{trip.tripNumber}</span>
              ) : !isExplicitTrip ? (
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px] font-bold">
                  <Layers className="mr-1 h-3 w-3" />
                  Auto-Linked Same Vehicle
                </Badge>
              ) : null}
              {totalWeight > 0 && (
                <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 text-[10px] font-semibold">
                  {totalWeight.toLocaleString()} lbs
                </Badge>
              )}
              {totalDeckFt > 0 && (
                <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 text-[10px] font-semibold">
                  {totalDeckFt} ft deck
                </Badge>
              )}
              {totalRevenue > 0 && (
                <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-800 text-[10px] font-bold">
                  ${totalRevenue.toLocaleString()} gross
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate text-sm font-bold text-slate-900">{trip.name}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 mt-0.5">
              <TruckIcon className="h-3.5 w-3.5 text-purple-700" />
              <span>{equipment || 'No equipment assigned'}</span>
              {driver ? <span className="font-semibold text-blue-700">· Driver: {driver.name}</span> : null}
            </p>
          </div>
        </button>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {tripItineraryStops.length > 0 && (
            <a
              href={combinedMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors"
              title="Open combined multi-stop route in Google Maps"
            >
              <Navigation2 className="h-3.5 w-3.5" />
              <span>Combined Trip Route</span>
            </a>
          )}
          <div className="flex flex-wrap justify-end gap-1.5">
            {Object.values(statusCounts).map(s => (
              <Badge key={s.label} variant="outline" className={`${s.color} border-none font-semibold shadow-xs`}>
                {s.count > 1 ? `${s.count} × ` : ''}{s.label}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Sequenced Pickup & Delivery Stop Strip (Always Visible) */}
      {tripItineraryStops.length > 0 && (
        <div className="border-t border-purple-100 bg-slate-900 px-4 py-2.5 text-white">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-extrabold uppercase tracking-wider text-purple-300 mr-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-purple-400" />
              Stop Sequence:
            </span>
            {tripItineraryStops.map((stop, idx) => {
              const matchedLoad = ordered.find(l => l.id === stop.loadId);
              const { completed, active } = getTripStopProgressState(stop, matchedLoad);
              const locShort = [stop.rawAddress?.city, stop.rawAddress?.state].filter(Boolean).join(', ') || stop.location;
              return (
                <React.Fragment key={stop.id || `${stop.loadId}-${idx}`}>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${
                      completed
                        ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                        : active
                        ? 'bg-indigo-500/35 text-white border border-indigo-400'
                        : 'bg-slate-800 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <span className="font-black text-[10px] text-purple-300">{idx + 1}.</span>
                    <span className="text-[9px] uppercase font-extrabold opacity-85">
                      {stop.type === 'pickup' ? 'PU' : 'DEL'}
                    </span>
                    <span>{locShort}</span>
                    {stop.type === 'dropoff' && ordered.length > 1 && stop.isTopLoad && (
                      <span className="text-[9px] text-emerald-300 font-bold">(1st Off)</span>
                    )}
                    {stop.type === 'dropoff' && ordered.length > 1 && stop.isBottomLoad && (
                      <span className="text-[9px] text-amber-300 font-bold">(Last Off)</span>
                    )}
                  </span>
                  {idx < tripItineraryStops.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Collapsed Load List with Deck Order Badges & Reorder Controls */}
      {!expanded && (
        <ol className="divide-y divide-purple-100 border-t border-purple-100 bg-white">
          {ordered.map((l, i) => {
            const s = getDispatcherStatusLabel(l.status as string, l);
            const deck = getDeck(l.id);
            const deckBadge = formatDeckPositionBadge(deck, ordered.length);
            return (
              <li
                key={l.id}
                id={l.id ? `load-card-${l.id}` : undefined}
                className="scroll-mt-20 flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">
                  {i + 1}
                </span>

                {ordered.length > 1 && deckBadge && (
                  <Badge
                    className={`text-[10px] font-bold shrink-0 ${
                      deck?.isTopLoad
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-100'
                        : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {deckBadge}
                  </Badge>
                )}

                <span className="w-28 shrink-0 truncate font-semibold text-slate-800">
                  #{l.loadNumber || l.id?.slice(0, 8)}
                </span>

                <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-slate-600">
                  {cityState(l.origin)} <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" /> {cityState(l.destination)}
                  {l.distance ? <span className="text-xs text-slate-400 ml-1">({l.distance} mi)</span> : null}
                </span>

                {ordered.length > 1 && onUpdateLoad && (
                  <div className="flex items-center gap-1 shrink-0" title="Adjust deck unload order (First Off vs Last Off)">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={i === 0 || isReordering}
                      onClick={() => handleMoveDeckPosition(i, -1)}
                      className="h-6 w-6 border-slate-200"
                      title="Move earlier in delivery order (toward First Off)"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={i === ordered.length - 1 || isReordering}
                      onClick={() => handleMoveDeckPosition(i, 1)}
                      className="h-6 w-6 border-slate-200"
                      title="Move later in delivery order (toward Last Off)"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <Badge variant="outline" className={`${s.color} shrink-0 border-none font-semibold shadow-xs`}>
                  {s.label}
                </Badge>
              </li>
            );
          })}
        </ol>
      )}

      {/* Expanded Individual LoadCards */}
      {expanded && (
        <div className="grid grid-cols-1 gap-4 border-t border-purple-100 bg-white p-4 md:grid-cols-2">
          {ordered.map((l, i) => {
            const deck = getDeck(l.id);
            const deckBadge = formatDeckPositionBadge(deck, ordered.length);
            return (
              <div key={l.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-purple-700">
                      Trip Load {i + 1} of {ordered.length}
                    </p>
                    {ordered.length > 1 && deckBadge && (
                      <Badge
                        className={`text-[10px] font-bold ${
                          deck?.isTopLoad
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {deckBadge}
                      </Badge>
                    )}
                  </div>

                  {ordered.length > 1 && onUpdateLoad && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={i === 0 || isReordering}
                        onClick={() => handleMoveDeckPosition(i, -1)}
                        className="h-6 px-2 text-[10px] font-bold"
                      >
                        <ArrowUp className="h-3 w-3 mr-0.5" /> Earlier Off
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={i === ordered.length - 1 || isReordering}
                        onClick={() => handleMoveDeckPosition(i, 1)}
                        className="h-6 px-2 text-[10px] font-bold"
                      >
                        <ArrowDown className="h-3 w-3 mr-0.5" /> Later Off
                      </Button>
                    </div>
                  )}
                </div>
                {renderLoadCard(l)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
