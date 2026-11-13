
import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Map, Gauge, Fuel, Trash2, CheckCircle, Clock, XCircle, MapPin } from 'lucide-react';
import { calculateTripMetrics } from '@/lib/logisticsEngine';
import { vehicleToEngineTrailer, loadToCargoItem } from '@/lib/logisticsAdapters';
import { generateGoogleMapsUrl } from '@/lib/routeUtils';

import type { Trip } from '@/types';

export function TripManagement() {
  const { trips, addTrip, updateTrip, handleDeleteTrip, loads, settings, updateLoad, vehicles } = useApp();
  const { toast } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [newTrip, setNewTrip] = useState<Omit<Trip, 'id'>>({
    name: '',
    loadIds: [],
    startOdometer: 0,
    status: 'planned'
  });

  const handleCreateTrip = async () => {
    if (!newTrip.name) return;
    await addTrip(newTrip);
    setNewTrip({ name: '', loadIds: [], startOdometer: 0, status: 'planned' });
    setIsAdding(false);
  };

  const handleUpdateOdometer = (tripId: string, type: 'start' | 'end', value: string) => {
    const num = Number(value);
    if (type === 'start') updateTrip(tripId, { startOdometer: num });
    else updateTrip(tripId, { endOdometer: num });
  };

  const handleStatusChange = (tripId: string, status: Trip['status']) => {
    updateTrip(tripId, { status });
  };

  const handleLinkLoad = (loadId: string, tripId: string, maxWeight: number, usedWeight: number) => {
    const loadToAdd = loads.find(l => l.id === loadId);
    if (loadToAdd) {
      const newWeight = (loadToAdd.cargoWeightNum || 0) * (loadToAdd.cargoQuantity || 1);
      if (maxWeight > 0 && (usedWeight + newWeight) > maxWeight) {
        const excess = (usedWeight + newWeight) - maxWeight;
        toast({
          variant: "destructive",
          title: "Capacity Error",
          description: `Error: Load exceeds available capacity by ${excess.toLocaleString()} lbs.`
        });
        return;
      }
    }
    updateLoad(loadId, { tripId });
  };

  const renderedTrips = useMemo(() => {
    return trips.map(trip => {
      const tripLoads = loads.filter(l => l.tripId === trip.id && l.status !== 'delivered');
      
      const effectiveTrailerId = trip.assignedTrailerId || tripLoads[0]?.assignedTrailerId;
      const effectiveTrailer = effectiveTrailerId ? vehicles.find(v => v.id === effectiveTrailerId) : undefined;
      
      // ── Engine-driven deck capacity — feeds weight & length utilization bars ────────
      const engineTrailer = effectiveTrailer
        ? vehicleToEngineTrailer(effectiveTrailer)
        : { id: '', description: '', gvwr: 0, emptyWeight: 0, monthlyPayment: 0, maintFundMo: 0, insuranceMo: 0, deckLength: 40, deckWidth: 8.5 };

      const engineCargo = tripLoads.map(l => loadToCargoItem(l));

      // Raw weight sum (includes stacked / nested loads that engine doesn't layout)
      const usedWeight = tripLoads.reduce((s, l) => s + (l.cargoWeightNum || 0) * (l.cargoQuantity || 1), 0);

      // Engine gives us the precise linear-feet footprint
      const tripEngineResult = engineCargo.length > 0
        ? calculateTripMetrics({
            truck:   { id: '', description: '', gvwr: 0, opCostPerMile: 0, insuranceMo: 0, maxTongueWeightCapacity: 3_500, monthlyPayment: 0, maintFundMo: 0 },
            trailer: engineTrailer,
            cargo:   engineCargo,
            loadedMiles: 0, deadheadMiles: 0,
            pickupDate:   new Date().toISOString(),
            deliveryDate: new Date().toISOString(),
            projectedFuel: 0, projectedDef: 0,
            averageMonthlyMiles: 5_000,
            businessNetProfitTargetPerDay: 300,
            driverPayrollTargetPerDay:     250,
          })
        : null;

      const usedLength  = tripEngineResult?.totalLinearFeetConsumed ?? 0;

      // True Max Cargo Weight: payloadCapacity takes priority, else trailer GVWR − emptyWeight
      const maxWeight = effectiveTrailer?.payloadCapacity
        || Math.max(0, (effectiveTrailer?.gvwr || 0) - (effectiveTrailer?.emptyWeight || 0));

      const maxLength = effectiveTrailer?.trailerLength || 0;

      const weightPercentage = maxWeight > 0 ? Math.min(100, (usedWeight / maxWeight) * 100) : 0;
      const lengthPercentage = maxLength > 0 ? Math.min(100, (usedLength / maxLength) * 100) : 0;
          
          return (
            <Card key={trip.id} className="overflow-hidden">
              <div className="bg-slate-50 px-6 py-3 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {trip.tripNumber && (
                    <span className="text-xs font-bold text-slate-500 bg-slate-200 rounded px-2 py-0.5 tracking-wider">
                      {trip.tripNumber}
                    </span>
                  )}
                  <span className="font-bold text-slate-700">{trip.name}</span>
                  <Badge variant={trip.status === 'completed' ? 'outline' : trip.status === 'active' ? 'default' : 'secondary'} className={trip.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : ''}>
                    {trip.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {tripLoads.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Rule: Never read stale precalculated data. Query freshest active loads directly from loads state on the fly.
                        const freshLoads = loads.filter(
                          l => l.tripId === trip.id && l.status !== 'delivered' && (l.status as string) !== 'completed'
                        );
                        const loadsToMap = freshLoads.length > 0 ? freshLoads : tripLoads;
                        const mapUrl = generateGoogleMapsUrl(loadsToMap);
                        if (mapUrl && mapUrl !== 'https://www.google.com/maps') {
                          window.open(mapUrl, '_blank');
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      title="View Consolidated Route on Map"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      View Route
                    </Button>
                  )}
                  {trip.status === 'planned' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(trip.id, 'active')}>Start Trip</Button>
                  )}
                  {trip.status === 'active' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(trip.id, 'completed')}>Complete Trip</Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteTrip(trip.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wider">
                        <Gauge className="h-4 w-4" /> Odometer Readings
                      </div>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Start Odometer</Label>
                          <Input 
                            type="number" 
                            value={trip.startOdometer} 
                            onChange={(e) => handleUpdateOdometer(trip.id, 'start', e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">End Odometer</Label>
                          <Input 
                            type="number" 
                            placeholder="Wait until finished" 
                            value={trip.endOdometer || ''} 
                            onChange={(e) => handleUpdateOdometer(trip.id, 'end', e.target.value)}
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Trip Financial Summary */}
                    {tripLoads.length > 0 && (
                      <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                        <div className="text-xs font-bold text-blue-800 uppercase tracking-wider">Trip Financials</div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Gross Revenue</span>
                            <span className="font-bold text-slate-700">${tripLoads.reduce((sum, l) => sum + l.totalAgreedRate, 0).toLocaleString()}</span>
                          </div>
                          
                          {trip.endOdometer && trip.endOdometer > trip.startOdometer && (
                            <>
                              <div className="flex justify-between text-xs border-t border-blue-100 pt-2">
                                <span className="text-slate-500">Fuel Optimization</span>
                                <span className="font-bold text-emerald-600">
                                  +${(() => {
                                    const billedFuel = tripLoads.reduce((sum, l) => {
                                      const miles = (l.distance || 0) + (l.deadheadMiles || 0);
                                      return sum + (miles / settings.truckMpg) * settings.defaultFuelCostPerGallon;
                                    }, 0);
                                    const actualDist = trip.endOdometer! - trip.startOdometer;
                                    const actualFuel = (actualDist / settings.truckMpg) * settings.defaultFuelCostPerGallon;
                                    return (billedFuel - actualFuel).toFixed(2);
                                  })()}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs font-bold text-blue-900 border-t border-blue-200 pt-2">
                                <span>Trip Net Profit</span>
                                <span>
                                  ${(() => {
                                    const gross = tripLoads.reduce((sum, l) => sum + l.totalAgreedRate, 0);
                                    const actualDist = trip.endOdometer! - trip.startOdometer;
                                    const actualFuel = (actualDist / settings.truckMpg) * settings.defaultFuelCostPerGallon;
                                    const payroll = tripLoads.reduce((sum, l) => sum + (l.expenses?.payroll || 0), 0);
                                    const maxDuration = Math.max(...tripLoads.map(l => l.tripDuration || 1));
                                    const recurring = settings.recurringExpenses.reduce((sum, exp) => sum + (exp.amount / 30) * maxDuration, 0);
                                    return (gross - actualFuel - payroll - recurring).toLocaleString(undefined, { minimumFractionDigits: 2 });
                                  })()}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Trip Capacity Visualization */}
                    {effectiveTrailer && maxWeight > 0 && (
                      <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 space-y-4">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Remaining Capacity</div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-600">Weight</span>
                            <span className={`font-bold ${weightPercentage > 90 ? 'text-red-600' : 'text-slate-700'}`}>
                              {usedWeight.toLocaleString()} / {maxWeight.toLocaleString()} lbs
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Remaining Payload:</span>
                            <span className="font-semibold text-slate-700">{Math.max(0, maxWeight - usedWeight).toLocaleString()} lbs</span>
                          </div>
                          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${weightPercentage > 90 ? 'bg-red-500' : weightPercentage > 75 ? 'bg-orange-400' : 'bg-blue-500'}`} 
                              style={{ width: `${weightPercentage}%` }} 
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-600">Deck Space</span>
                            <span className={`font-bold ${lengthPercentage > 90 ? 'text-red-600' : 'text-slate-700'}`}>
                              {usedLength.toFixed(1)} / {maxLength} ft
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Remaining Deck Space:</span>
                            <span className="font-semibold text-slate-700">{Math.max(0, maxLength - usedLength).toFixed(1)} ft</span>
                          </div>
                          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${lengthPercentage > 90 ? 'bg-red-500' : lengthPercentage > 75 ? 'bg-orange-400' : 'bg-green-500'}`} 
                              style={{ width: `${lengthPercentage}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>


                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wider">
                      <Fuel className="h-4 w-4" /> Associated Loads ({tripLoads.length})
                    </div>
                    {tripLoads.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tripLoads.map(load => (
                          <div key={load.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border text-xs group">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-700">#{load.loadNumber || (load.id || '').substring(0, 7)}</span>
                              <span className="text-[10px] text-slate-500 uppercase font-medium">{load.distance} mi</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] h-5">{load.status}</Badge>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => load.id && updateLoad(load.id, { tripId: undefined })}
                              >
                                <XCircle className="h-3 w-3 text-slate-400" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No loads linked to this trip.</p>
                    )}

                    {/* Link Existing Load Selection */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <Label className="text-[10px] uppercase font-bold text-slate-400 mb-2 block">Link Existing Load</Label>
                      <Select onValueChange={(loadId) => handleLinkLoad(loadId, trip.id, maxWeight, usedWeight)}>
                        <SelectTrigger className="h-9 bg-slate-50/50 border-slate-200">
                          <SelectValue placeholder="Select load to add..." />
                        </SelectTrigger>
                        <SelectContent>
                          {loads.filter(l => !l.tripId).length > 0 ? (
                            loads.filter(l => !l.tripId).map(load => (
                              <SelectItem key={load.id || ''} value={load.id || ''}>
                                #{load.loadNumber || (load.id || '').substring(0, 7)} - {load.origin.city} to {load.destination.city}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>No unassigned loads available</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    
                    {trip.status === 'completed' && trip.endOdometer && (
                      <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-700 font-bold">
                          <CheckCircle className="h-5 w-5" />
                          <span>Trip Complete</span>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-emerald-600">Actual Distance</div>
                          <div className="font-bold text-emerald-800">{trip.endOdometer - trip.startOdometer} miles</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        });
  }, [trips, loads, vehicles, settings, handleDeleteTrip, handleStatusChange, handleLinkLoad, handleUpdateOdometer, updateLoad]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Map className="h-5 w-5 text-blue-600" />
            Trip Containers
          </h2>
          <p className="text-sm text-muted-foreground">Group loads into trips to track overlapping fuel profits.</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <PlusCircle className="h-4 w-4 mr-2" /> New Trip
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-blue-100 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-lg">Create New Trip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trip Name</Label>
                <Input 
                  placeholder="e.g., Midwest Loop - May" 
                  value={newTrip.name}
                  onChange={(e) => setNewTrip(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Starting Odometer</Label>
                <Input 
                  type="number" 
                  placeholder="e.g., 150200" 
                  value={newTrip.startOdometer || ''}
                  onChange={(e) => setNewTrip(prev => ({ ...prev, startOdometer: Number(e.target.value) }))}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button onClick={handleCreateTrip}>Create Trip</Button>
          </CardFooter>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {trips.length === 0 && !isAdding && (
          <div className="text-center py-12 px-4 bg-white border border-dashed border-slate-200 rounded-2xl shadow-xs">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Map className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-slate-800 text-base">No multi-stop trips created yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Group multiple partial loads into a single trip to calculate deadhead savings, deck space, and fuel optimization.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-lg"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
              Create First Trip
            </Button>
          </div>
        )}
        
        {renderedTrips}
      </div>
    </div>
  );
}
