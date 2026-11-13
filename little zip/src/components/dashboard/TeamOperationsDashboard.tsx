'use client';

import React, { useMemo } from 'react';
import { calculateTripMetrics } from '@/lib/logisticsEngine';
import type { Truck, Trailer } from '@/lib/logisticsEngine';
import type { SandboxTrip, SandboxDriver } from '@/components/workspace/TMSWorkspace';

// ==========================================
// 1. COMPONENT PROPS INTERFACE
// ==========================================
export interface TeamOperationsDashboardProps {
  trips: SandboxTrip[];
  drivers: SandboxDriver[];
  trucks: Truck[];
  trailers: Trailer[];
  averageMonthlyMiles: number;
}

// ==========================================
// 2. PRODUCTION COMMAND BOARD DASHBOARD
// ==========================================
export const TeamOperationsDashboard: React.FC<TeamOperationsDashboardProps> = ({
  trips,
  drivers,
  trucks,
  trailers,
  averageMonthlyMiles,
}) => {

  // ── Real-time fleet metric pipeline ────────────────────────────────────────
  const operationalData = useMemo(() => {
    let totalActiveRevenue     = 0;
    let totalProjectedNetProfit = 0;
    let totalActiveMiles       = 0;

    const enrichedTrips = trips.map(trip => {
      const currentTruck   = trucks.find(t  => t.id  === trip.truckId);
      const currentTrailer = trailers.find(tl => tl.id === trip.trailerId);
      const currentDriver  = drivers.find(d  => d.id  === trip.driverId);

      // Full-conformant fallbacks — every required Truck/Trailer field is present
      const truckContext: Truck = currentTruck ?? {
        id: '', description: 'Unassigned',
        gvwr: 0, maxTongueWeightCapacity: 0,
        opCostPerMile: 0, insuranceMo: 0,
        monthlyPayment: 0, maintFundMo: 0,
      };
      const trailerContext: Trailer = currentTrailer ?? {
        id: '', description: 'Unassigned',
        gvwr: 0, emptyWeight: 0,
        monthlyPayment: 0, maintFundMo: 0, insuranceMo: 0,
        deckLength: 0, deckWidth: 0,
      };

      // Use TripInputs object — pickupDate/deliveryDate drive operationalDays
      const metrics = calculateTripMetrics({
        truck:   truckContext,
        trailer: trailerContext,
        cargo:   trip.cargoItems,   // SandboxCargoItem satisfies CargoItem (structural)
        loadedMiles:   trip.loadedMiles,
        deadheadMiles: trip.deadheadMiles,
        pickupDate:    trip.pickupDate,
        deliveryDate:  trip.deliveryDate,
        projectedFuel: trip.projectedFuel,
        projectedDef:  trip.projectedDef,
        averageMonthlyMiles,
        businessNetProfitTargetPerDay: 300, // standard daily business profit target
        driverPayrollTargetPerDay:     250, // standard driver pay benchmark
        userEnteredRatePerMile:        trip.ratePerMile,
      });

      const tripTotalMiles = trip.loadedMiles + trip.deadheadMiles;
      totalActiveRevenue      += tripTotalMiles * trip.ratePerMile;
      totalProjectedNetProfit += metrics.estimatedNetProfit;
      totalActiveMiles        += tripTotalMiles;

      const licenseConflict =
        metrics.isCdlRequired && currentDriver?.licensingStatus === 'Non-CDL';

      return {
        ...trip,
        truck:   currentTruck,
        trailer: currentTrailer,
        driver:  currentDriver,
        metrics,
        licenseConflict,
      };
    });

    return {
      enrichedTrips,
      summary: {
        totalActiveRevenue,
        totalProjectedNetProfit,
        totalActiveMiles,
        driversCount:      drivers.length,
        availableDrivers:  drivers.filter(d => d.status === 'Available').length,
        activeTripsCount:  trips.length,
      },
    };
  }, [trips, drivers, trucks, trailers, averageMonthlyMiles]);

  // ── Style helpers ──────────────────────────────────────────────────────────
  const metricCard: React.CSSProperties = {
    backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
    borderRadius: '8px', padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  };
  const metricLabel: React.CSSProperties = {
    fontSize: '11px', color: '#64748b', fontWeight: 'bold',
    display: 'block', marginBottom: '4px', letterSpacing: '0.5px',
  };

  return (
    <div style={{
      padding: '24px', backgroundColor: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif', minHeight: '100vh',
    }}>

      {/* ── SECTION 1: Master KPI Row ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }} className="grid grid-cols-2 lg:grid-cols-4">
        <div style={metricCard}>
          <span style={metricLabel}>ACTIVE TRIP CONTAINERS</span>
          <strong style={{ fontSize: '24px', color: '#0f172a' }}>
            {operationalData.summary.activeTripsCount} Running
          </strong>
        </div>
        <div style={metricCard}>
          <span style={metricLabel}>UNIFIED ROSTER OUTLOOK</span>
          <strong style={{ fontSize: '24px', color: '#0284c7' }}>
            {operationalData.summary.availableDrivers} / {operationalData.summary.driversCount} Drivers Free
          </strong>
        </div>
        <div style={metricCard}>
          <span style={metricLabel}>TOTAL ACCUMULATED GROSS REV</span>
          <strong style={{ fontSize: '24px', color: '#0f172a' }}>
            ${operationalData.summary.totalActiveRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
        </div>
        <div style={metricCard}>
          <span style={metricLabel}>PROJECTED FLEET TAKE-HOME NET</span>
          <strong style={{ fontSize: '24px', color: '#16a34a' }}>
            ${operationalData.summary.totalProjectedNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
        </div>
      </div>

      {/* ── SECTION 2: Three-column Command Workspace ─────────────────────── */}
      <div style={{ display: 'grid', gap: '24px' }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

        {/* COLUMN A: Trip Dispatch Board */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '16px', fontWeight: 'bold' }}>Active Manifest Runs</h3>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
              Tracking: {operationalData.summary.totalActiveMiles.toLocaleString()} Running Miles
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {operationalData.enrichedTrips.length === 0 ? (
              <div style={{
                padding: '24px', backgroundColor: '#ffffff', borderRadius: '8px',
                border: '1px solid #cbd5e1', textAlign: 'center',
                color: '#64748b', fontSize: '13px',
              }}>
                No active loads are currently dispatched across the terminal lines.
              </div>
            ) : (
              operationalData.enrichedTrips.map(trip => (
                <div key={trip.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
                  borderRadius: '8px', padding: '16px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}>

                  {/* Manifest ID line */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px',
                  }}>
                    <div>
                      <strong style={{ color: '#2563eb', fontSize: '14px' }}>{(trip as {manifestNumber?: string}).manifestNumber}</strong>
                      <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>
                        Carrier File: {trip.id}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '13px', fontWeight: 'bold',
                      color: trip.metrics.estimatedNetProfit < 0 ? '#dc2626' : '#16a34a',
                    }}>
                      Net: ${trip.metrics.estimatedNetProfit.toFixed(2)}
                    </span>
                  </div>

                  {/* Resource assignment block */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px', fontSize: '12px', color: '#334155',
                    marginBottom: '12px', backgroundColor: '#f8fafc',
                    padding: '8px', borderRadius: '4px',
                  }}>
                    <div>👤 <strong>Driver:</strong> {trip.driver?.name ?? 'Unassigned'}</div>
                    <div>🚛 <strong>Truck:</strong> {trip.truck?.description ?? 'Unassigned'}</div>
                    <div>📋 <strong>Trailer:</strong> {trip.trailer?.description ?? 'Unassigned'}</div>
                  </div>

                  {/* Payload specs bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569' }}>
                    <div>
                      Deck Payload Weight:{' '}
                      <strong style={{ color: trip.metrics.weightOverload ? '#ef4444' : '#0f172a' }}>
                        {trip.metrics.totalCargoWeight.toLocaleString()} / {trip.metrics.maxPayloadCapacity.toLocaleString()} lbs
                      </strong>
                    </div>
                    <div>
                      Deck Space:{' '}
                      <strong>
                        {trip.metrics.totalLinearFeetConsumed.toFixed(1)} ft / {trip.trailer?.deckLength ?? 0} ft used
                      </strong>
                    </div>
                  </div>

                  {/* Guardrail banners */}
                  {trip.licenseConflict && (
                    <div style={{ marginTop: '10px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      🛑 COMPLIANCE BREACH: Assignment requires Class A CDL, but driver is Non-CDL.
                    </div>
                  )}
                  {trip.metrics.weightOverload && (
                    <div style={{ marginTop: '6px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      ⚠️ OVERWEIGHT: Cargo exceeds trailer payload capacity.
                    </div>
                  )}
                  {trip.metrics.profitWarning && (
                    <div style={{ marginTop: '6px', backgroundColor: '#fefce8', border: '1px solid #fef08a', color: '#854d0e', padding: '8px', borderRadius: '4px', fontSize: '11px' }}>
                      💡 {trip.metrics.profitWarning}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN B: Driver Roster */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', color: '#1e293b', fontSize: '16px', fontWeight: 'bold' }}>Driver Status Roster</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {drivers.map(driver => {
              const activeTrip = operationalData.enrichedTrips.find(t => t.driverId === driver.id);
              return (
                <div key={driver.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: '8px', padding: '12px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ color: '#0f172a', fontSize: '13px', display: 'block' }}>{driver.name}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{driver.phone}</span>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
                      backgroundColor: driver.licensingStatus === 'Class A CDL' ? '#e0f2fe' : '#f1f5f9',
                      color: driver.licensingStatus === 'Class A CDL' ? '#0369a1' : '#475569',
                    }}>
                      {driver.licensingStatus}
                    </span>
                  </div>

                  <div style={{
                    marginTop: '10px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', fontSize: '11px',
                    borderTop: '1px dashed #e2e8f0', paddingTop: '8px',
                  }}>
                    <div>
                      Status:{' '}
                      <strong style={{
                        color: driver.status === 'Available' ? '#16a34a' :
                               driver.status === 'On Trip'   ? '#b45309' : '#64748b',
                      }}>
                        {driver.status}
                      </strong>
                    </div>
                    {activeTrip && (
                      <span style={{ color: '#2563eb', fontWeight: 'bold' }}>
                        {(activeTrip as {manifestNumber?: string}).manifestNumber}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN C: Fleet Asset Allocation */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', color: '#1e293b', fontSize: '16px', fontWeight: 'bold' }}>Asset Fleet Status</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Trucks */}
            <div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                FLEET DUALLY / TRUCK UNITS
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {trucks.map(truck => {
                  const isAssigned = operationalData.enrichedTrips.some(t => t.truckId === truck.id);
                  return (
                    <div key={truck.id} style={{
                      backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
                      borderRadius: '6px', padding: '10px', fontSize: '12px',
                    }}>
                      <strong style={{ color: '#0f172a', display: 'block' }}>{truck.description}</strong>
                      <div style={{ color: '#64748b', marginTop: '2px' }}>
                        Sticker GVWR: {truck.gvwr.toLocaleString()} lbs
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', fontWeight: 'bold' }}>
                        <span style={{ color: '#2563eb' }}>${truck.opCostPerMile.toFixed(2)}/mi</span>
                        <span style={{ color: isAssigned ? '#b45309' : '#16a34a' }}>
                          {isAssigned ? 'DISPATCHED' : 'READY'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trailers */}
            <div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                FLEET TRAILER UNITS
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {trailers.map(trailer => {
                  const isAssigned = operationalData.enrichedTrips.some(t => t.trailerId === trailer.id);
                  const calculatedOpCost =
                    (Number(trailer.monthlyPayment) + Number(trailer.maintFundMo)) /
                    (averageMonthlyMiles || 5_000);
                  return (
                    <div key={trailer.id} style={{
                      backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
                      borderRadius: '6px', padding: '10px', fontSize: '12px',
                    }}>
                      <strong style={{ color: '#0f172a', display: 'block' }}>{trailer.description}</strong>
                      <div style={{ color: '#64748b', marginTop: '2px' }}>
                        Max Payload: {(trailer.gvwr - trailer.emptyWeight).toLocaleString()} lbs
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', fontWeight: 'bold' }}>
                        <span style={{ color: '#16a34a' }}>${calculatedOpCost.toFixed(2)}/mi</span>
                        <span style={{ color: isAssigned ? '#b45309' : '#16a34a' }}>
                          {isAssigned ? 'DISPATCHED' : 'READY'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
