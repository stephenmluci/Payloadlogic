'use client';

import React, { useState, useMemo } from 'react';
import { calculateTripMetrics } from '@/lib/logisticsEngine';
import type { Truck as BaseTruck, Trailer as BaseTrailer } from '@/lib/logisticsEngine';
import { sanitizePhoneDigits, handlePhonePaste } from '@/lib/utils';

// ── Sandbox types re-defined locally (InteractiveSandbox removed in production refactor) ──
export interface SandboxDriver {
  id: string;
  name: string;
  licensingStatus: string;
  status: 'Available' | 'On Trip' | 'Off Duty';
  phone: string;
}

export interface SandboxCargoItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface SandboxTrip {
  id: string;
  driverId: string;
  truckId: string;
  trailerId: string;
  originCity: string;
  destinationCity: string;
  loadedMiles: number;
  deadheadMiles: number;
  ratePerMile: number;
  projectedFuel: number;
  projectedDef: number;
  pickupDate: string;
  deliveryDate: string;
  cargoItems: SandboxCargoItem[];
  status?: string;
}

// Local aliases matching the names used in this file's existing code
type Driver = SandboxDriver;
type TMSCargoItem = SandboxCargoItem;

// ==========================================
// 1. TMS-EXTENDED DATA STRUCTURES
// ==========================================

/**
 * TMSTruck / TMSTrailer extend the canonical engine types with `unitNumber`
 * (a fleet-management label) without breaking the engine's type contract.
 * Both still satisfy Truck / Trailer structurally.
 */
export interface TMSTruck extends BaseTruck {
  unitNumber: string;
}

export interface TMSTrailer extends BaseTrailer {
  unitNumber: string;
}

/** Client directory entry — unique to the TMS workspace. */
export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
}

/**
 * DispatchLoad — richer than SandboxTrip; adds client binding,
 * origin/destination display fields, and manifest metadata.
 * cargoItems uses TMSCargoItem (id + description + height + CargoItem fields)
 * so items pass type-safely into calculateTripMetrics.
 */
export interface DispatchLoad {
  id: string;
  manifestNumber: string;
  clientId: string;
  driverId: string;
  truckId: string;
  trailerId: string;
  originCity: string;
  destinationCity: string;
  loadedMiles: number;
  deadheadMiles: number;
  ratePerMile: number;
  projectedFuel: number;
  projectedDef: number;
  pickupDate: string;
  deliveryDate: string;
  cargoItems: TMSCargoItem[];
}

// ==========================================
// 2. SEED DATA
// ==========================================
const INITIAL_CLIENTS: Client[] = [
  { id: 'cl-1', companyName: 'West Virginia Steel Corp', contactName: 'Stephen M.', phone: '304-555-0144' },
  { id: 'cl-2', companyName: 'Lumberport Supply Hub',    contactName: 'Lee Smith',   phone: '843-622-6960' },
];

const INITIAL_DRIVERS: Driver[] = [
  { id: 'drv-1', name: 'Robert Lee Smith', licensingStatus: 'Non-CDL',    status: 'Available', phone: '843-622-6960' },
  { id: 'drv-2', name: 'John Doe',         licensingStatus: 'Class A CDL', status: 'On Trip',   phone: '304-555-0199' },
];

/**
 * maxTongueWeightCapacity is required by the canonical Truck interface.
 */
const INITIAL_TRUCKS: TMSTruck[] = [
  {
    id: 'trk-1', unitNumber: '001', description: '2024 Ford F350 Dually',
    gvwr: 14000, maxTongueWeightCapacity: 3500,
    opCostPerMile: 0.85, insuranceMo: 1500, monthlyPayment: 1800, maintFundMo: 350,
  },
  {
    id: 'trk-2', unitNumber: '002', description: 'RAM 3500 HD Frame',
    gvwr: 30000, maxTongueWeightCapacity: 3500,
    opCostPerMile: 0.90, insuranceMo: 1500, monthlyPayment: 1800, maintFundMo: 350,
  },
];

const INITIAL_TRAILERS: TMSTrailer[] = [
  { id: 'trl-1', unitNumber: 'T1', description: 'GN-40 Gooseneck',  gvwr: 20000, emptyWeight: 9000, monthlyPayment: 800, maintFundMo: 150, insuranceMo: 0, deckLength: 40, deckWidth: 8.5 },
  { id: 'trl-2', unitNumber: 'T2', description: 'Light Flatbed 30', gvwr: 10000, emptyWeight: 4500, monthlyPayment: 500, maintFundMo: 100, insuranceMo: 0, deckLength: 30, deckWidth: 8.5 },
];

/**
 * height (in) is required by the engine's CargoItem.
 * 48 in = 4 ft is a typical structural freight profile.
 */
const INITIAL_LOADS: DispatchLoad[] = [
  {
    id: 'load-101',
    manifestNumber: 'MANIFEST-2026-001',
    clientId: 'cl-1',
    driverId: 'drv-1', truckId: 'trk-1', trailerId: 'trl-1',
    originCity: 'KERSHAW, SC', destinationCity: 'MORGANTOWN, WV',
    loadedMiles: 450, deadheadMiles: 12, ratePerMile: 2.25,
    projectedFuel: 180, projectedDef: 10,
    pickupDate: '2026-06-23', deliveryDate: '2026-06-24',
    cargoItems: [
      { id: 'cg-1', description: 'Structural Beams', quantity: 4, length: 4, width: 4, height: 48, weight: 800 },
    ],
  },
];

// ==========================================
// 3. FULLY INTERACTIVE TMS WORKSPACE
// ==========================================
export function FullyInteractiveTMSWorkspace({
  initialView = 'loads',
}: {
  initialView?: 'loads' | 'drivers' | 'fleet' | 'clients';
}) {
  const [currentView, setCurrentView] = useState<'loads' | 'drivers' | 'fleet' | 'clients'>(initialView);
  const [globalMonthlyMiles, setGlobalMonthlyMiles] = useState<number>(10_000);

  const [clients,  setClients]  = useState<Client[]>(INITIAL_CLIENTS);
  const [drivers,  setDrivers]  = useState<Driver[]>(INITIAL_DRIVERS);
  const [trucks,   setTrucks]   = useState<TMSTruck[]>(INITIAL_TRUCKS);
  const [trailers, setTrailers] = useState<TMSTrailer[]>(INITIAL_TRAILERS);
  const [loads,    setLoads]    = useState<DispatchLoad[]>(INITIAL_LOADS);

  // ── State mutation handlers ────────────────────────────────────────────────
  const updateLoad = <K extends keyof DispatchLoad>(id: string, field: K, value: DispatchLoad[K]) =>
    setLoads(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

  const updateLoadCargo = (
    loadId: string, cargoId: string,
    field: keyof TMSCargoItem, value: number | string,
  ) => setLoads(prev => prev.map(l => {
    if (l.id !== loadId) return l;
    return { ...l, cargoItems: l.cargoItems.map(c => c.id === cargoId ? { ...c, [field]: value } : c) };
  }));

  const updateDriver  = (id: string, field: keyof Driver,    value: string)         => setDrivers(prev  => prev.map(d  => d.id  === id ? { ...d,  [field]: value } : d));
  const updateTruck   = (id: string, field: keyof TMSTruck,  value: number | string) => setTrucks(prev   => prev.map(t  => t.id  === id ? { ...t,  [field]: value } : t));
  const updateTrailer = (id: string, field: keyof TMSTrailer,value: number | string) => setTrailers(prev => prev.map(tl => tl.id === id ? { ...tl, [field]: value } : tl));
  const updateClient  = (id: string, field: keyof Client,    value: string)          => setClients(prev  => prev.map(c  => c.id  === id ? { ...c,  [field]: value } : c));

  // ── Live computation pipeline ──────────────────────────────────────────────
  const activeLoadViews = useMemo(() => {
    return loads.map(load => {
      const selectedTruck   = trucks.find(t  => t.id  === load.truckId)   ?? trucks[0];
      const selectedTrailer = trailers.find(tl => tl.id === load.trailerId) ?? trailers[0];
      const selectedDriver  = drivers.find(d  => d.id  === load.driverId)  ?? drivers[0];
      const selectedClient  = clients.find(c  => c.id  === load.clientId)  ?? clients[0];

      // TMSTruck / TMSTrailer satisfy the engine's Truck / Trailer (structural subtyping)
      const metrics = calculateTripMetrics({
        truck:   selectedTruck,
        trailer: selectedTrailer,
        cargo:   load.cargoItems,         // TMSCargoItem structurally satisfies CargoItem
        loadedMiles:   load.loadedMiles,
        deadheadMiles: load.deadheadMiles,
        pickupDate:    load.pickupDate,
        deliveryDate:  load.deliveryDate,
        projectedFuel: load.projectedFuel,
        projectedDef:  load.projectedDef,
        averageMonthlyMiles: globalMonthlyMiles,
        businessNetProfitTargetPerDay: 300,
        driverPayrollTargetPerDay:     250,
        userEnteredRatePerMile:        load.ratePerMile,
      });

      const cdlLicensingBreach = metrics.isCdlRequired && selectedDriver.licensingStatus === 'Non-CDL';

      return {
        ...load,
        truck: selectedTruck, trailer: selectedTrailer,
        driver: selectedDriver, client: selectedClient,
        metrics, cdlLicensingBreach,
      };
    });
  }, [loads, trucks, trailers, drivers, clients, globalMonthlyMiles]);

  // ── Style helpers ──────────────────────────────────────────────────────────
  const navBtn = (view: typeof currentView): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    fontSize: '12px', fontWeight: 'bold',
    backgroundColor: currentView === view ? '#0284c7' : '#334155',
    color: '#ffffff',
    transition: 'background-color 0.15s',
  });
  const inputSm: React.CSSProperties = {
    width: '100%', padding: '6px', borderRadius: '4px',
    border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '2px',
  };

  return (
    <div style={{
      maxWidth: '1150px', margin: '20px auto', fontFamily: 'Segoe UI, sans-serif',
      backgroundColor: '#f1f5f9', minHeight: '90vh', borderRadius: '12px',
      overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#0f172a', padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '2px solid #0284c7', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <h1 style={{ color: '#38bdf8', margin: 0, fontSize: '20px', fontWeight: 600 }}>
            Command Board Terminal
          </h1>
          <p style={{ color: '#94a3b8', margin: '2px 0 0 0', fontSize: '12px' }}>
            Fully editable operational layout. Changes recalculate financial compliance pipelines live.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ marginRight: '12px', textAlign: 'right' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 'bold' }}>
              FLEET MILE DENOMINATOR
            </span>
            <input
              type="number"
              value={globalMonthlyMiles}
              onChange={(e) => setGlobalMonthlyMiles(Number(e.target.value) || 5_000)}
              style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#1e293b', color: '#ffffff', fontSize: '12px', fontWeight: 'bold' }}
            />
          </div>
          <button onClick={() => setCurrentView('loads')}   style={navBtn('loads')}>📋 Load Board ({loads.length})</button>
          <button onClick={() => setCurrentView('drivers')} style={navBtn('drivers')}>👥 Drivers ({drivers.length})</button>
          <button onClick={() => setCurrentView('fleet')}   style={navBtn('fleet')}>🚛 Fleet Assets</button>
          <button onClick={() => setCurrentView('clients')} style={navBtn('clients')}>🏢 Clients ({clients.length})</button>
        </div>
      </div>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px' }}>

        {/* ── VIEW A: Load Board ────────────────────────────────────────────── */}
        {currentView === 'loads' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Operational Dispatch Container Board</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {activeLoadViews.map(load => (
                <div key={load.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: '8px', padding: '20px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                }}>

                  {/* Row 1: Assignment selectors */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                    gap: '12px', marginBottom: '16px',
                    borderBottom: '1px solid #f1f5f9', paddingBottom: '12px',
                  }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0284c7', display: 'block', marginBottom: '2px' }}>
                        CLIENT MANIFEST SOURCE
                      </span>
                      <select
                        value={load.clientId}
                        onChange={(e) => updateLoad(load.id, 'clientId', e.target.value)}
                        style={{ ...inputSm, fontWeight: 'bold', fontSize: '13px' }}
                      >
                        {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={label}>ASSIGNED OPERATOR</label>
                      <select value={load.driverId} onChange={(e) => updateLoad(load.id, 'driverId', e.target.value)} style={inputSm}>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.licensingStatus})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={label}>POWER UNIT ASSET</label>
                      <select value={load.truckId} onChange={(e) => updateLoad(load.id, 'truckId', e.target.value)} style={inputSm}>
                        {trucks.map(t => <option key={t.id} value={t.id}>Unit {t.unitNumber} — {t.description}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={label}>TRAILING DECK ASSET</label>
                      <select value={load.trailerId} onChange={(e) => updateLoad(load.id, 'trailerId', e.target.value)} style={inputSm}>
                        {trailers.map(tl => <option key={tl.id} value={tl.id}>Unit {tl.unitNumber} ({tl.deckLength} ft)</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Route + financial inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    {(
                      [
                        { lbl: 'LOADED MILES',    field: 'loadedMiles',   step: 1    },
                        { lbl: 'DEADHEAD MILES',  field: 'deadheadMiles', step: 1    },
                        { lbl: 'RATE / MILE ($)', field: 'ratePerMile',   step: 0.05 },
                        { lbl: 'RUNNING FUEL ($)', field: 'projectedFuel', step: 1   },
                        { lbl: 'RUNNING DEF ($)',  field: 'projectedDef',  step: 1   },
                      ] as { lbl: string; field: keyof DispatchLoad; step: number }[]
                    ).map(({ lbl, field, step }) => (
                      <div key={field}>
                        <label style={label}>{lbl}</label>
                        <input
                          type="number"
                          step={step}
                          value={load[field] as number}
                          onChange={(e) => updateLoad(load.id, field, Number(e.target.value) || 0)}
                          style={{
                            ...inputSm,
                            ...(field === 'ratePerMile' ? { fontWeight: 'bold', color: '#2563eb' } : {}),
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Row 3: Cargo manifest editor */}
                  <div style={{
                    backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px',
                    marginBottom: '16px', border: '1px solid #e2e8f0',
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '8px' }}>
                      FREIGHT ITEM PROFILE INLINE ATTRIBUTES
                    </span>
                    {load.cargoItems.map(cargo => (
                      <div key={cargo.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px', alignItems: 'end' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{cargo.description}</span>
                        {(
                          [
                            { lbl: 'QTY',              field: 'quantity' },
                            { lbl: 'LENGTH (FT)',       field: 'length'   },
                            { lbl: 'UNIT WEIGHT (LBS)', field: 'weight'   },
                          ] as { lbl: string; field: keyof TMSCargoItem }[]
                        ).map(({ lbl, field }) => (
                          <div key={field}>
                            <label style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>{lbl}</label>
                            <input
                              type="number"
                              value={cargo[field] as number}
                              onChange={(e) => updateLoadCargo(load.id, cargo.id, field, Number(e.target.value) || 0)}
                              style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Row 4: Live output readouts */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '16px', backgroundColor: '#0f172a', color: '#ffffff',
                    padding: '16px', borderRadius: '6px', fontSize: '13px',
                  }}>
                    <div>
                      <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                        SPACE & HARDWARE UTILIZATION
                      </span>
                      <div>
                        Cargo Weight:{' '}
                        <strong style={{ color: load.metrics.weightOverload ? '#f87171' : '#34d399' }}>
                          {load.metrics.totalCargoWeight.toLocaleString()} / {load.metrics.maxPayloadCapacity.toLocaleString()} lbs
                        </strong>
                      </div>
                      <div>
                        Deck Space:{' '}
                        <strong>{load.metrics.totalLinearFeetConsumed.toFixed(1)} ft / {load.trailer.deckLength} ft</strong>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                        REGULATORY STANDARDS OUTCOME
                      </span>
                      <div>
                        Paper GCWR:{' '}
                        <strong style={{ color: load.metrics.isCdlRequired ? '#fb923c' : '#34d399' }}>
                          {load.metrics.paperGcwr.toLocaleString()} lbs
                        </strong>
                      </div>
                      <div>
                        Class A CDL:{' '}
                        <strong>{load.metrics.isCdlRequired ? 'REQUIRED' : 'NOT REQUIRED'}</strong>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                        REALIZED FREIGHT LEDGER
                      </span>
                      <div>
                        Op Cost: <span>${load.metrics.totalOpCostPerMile.toFixed(2)}/mi</span>
                      </div>
                      <div>
                        Projected Profit:{' '}
                        <strong style={{ color: load.metrics.estimatedNetProfit < 0 ? '#f87171' : '#34d399', fontSize: '15px' }}>
                          ${load.metrics.estimatedNetProfit.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Alert banners */}
                  {load.cdlLicensingBreach && (
                    <div style={{ marginTop: '12px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                      🛑 COMPLIANCE BREACH: Paper weight profile demands Class A CDL, but {load.driver.name} is Non-CDL.
                    </div>
                  )}
                  {load.metrics.weightOverload && (
                    <div style={{ marginTop: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', padding: '10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                      ⚠️ ASSET RESTRICTION ALERT: Stacked cargo weight exceeds trailer frame structural limits.
                    </div>
                  )}

                  {load.metrics.profitWarning && (
                    <div style={{ marginTop: '8px', backgroundColor: '#fefce8', border: '1px solid #fef08a', color: '#854d0e', padding: '10px', borderRadius: '6px', fontSize: '12px' }}>
                      💡 {load.metrics.profitWarning}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VIEW B: Driver Roster ─────────────────────────────────────────── */}
        {currentView === 'drivers' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Active Operator Roster</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {drivers.map(driver => (
                <div key={driver.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: '8px', padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}>
                  <input
                    type="text"
                    value={driver.name}
                    onChange={(e) => updateDriver(driver.id, 'name', e.target.value)}
                    style={{ fontWeight: 'bold', fontSize: '15px', border: 'none', borderBottom: '1px solid transparent', width: '100%', marginBottom: '10px', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                    onFocus={(e) => (e.target.style.borderBottom = '1px solid #2563eb')}
                    onBlur={(e)  => (e.target.style.borderBottom = '1px solid transparent')}
                  />
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#64748b', marginBottom: '2px' }}>
                      REGULATORY COMPLIANCE STATUS
                    </label>
                    <select
                      value={driver.licensingStatus}
                      onChange={(e) => updateDriver(driver.id, 'licensingStatus', e.target.value)}
                      style={inputSm}
                    >
                      <option value="Non-CDL">Non-CDL Fleet Constraint</option>
                      <option value="Class A CDL">Class A CDL Authorized</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: '#64748b', marginBottom: '2px' }}>
                      DISPATCH SCHEDULE AVAILABILITY
                    </label>
                    <select
                      value={driver.status}
                      onChange={(e) => updateDriver(driver.id, 'status', e.target.value)}
                      style={inputSm}
                    >
                      <option value="Available">Available for Run</option>
                      <option value="On Trip">En Route / On Active Manifest</option>
                      <option value="Downtime">Downtime / Off Duty</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VIEW C: Fleet Assets ──────────────────────────────────────────── */}
        {currentView === 'fleet' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

            {/* Trucks */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', color: '#334155' }}>Power Unit Parameters (Trucks)</h4>
              {trucks.map(t => (
                <div key={t.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: '8px', padding: '16px', marginBottom: '16px',
                }}>
                  <input
                    type="text"
                    value={t.description}
                    onChange={(e) => updateTruck(t.id, 'description', e.target.value)}
                    style={{ fontWeight: 'bold', border: 'none', width: '100%', marginBottom: '10px', fontSize: '14px', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>STICKER GVWR (LBS)</label>
                      <input type="number" value={t.gvwr}
                        onChange={(e) => updateTruck(t.id, 'gvwr', Number(e.target.value) || 0)}
                        style={inputSm}
                      />
                    </div>

                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>VARIABLE RUNNING COST ($/MI)</label>
                    <input type="number" step="0.05" value={t.opCostPerMile}
                      onChange={(e) => updateTruck(t.id, 'opCostPerMile', Number(e.target.value) || 0)}
                      style={inputSm}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Trailers */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', color: '#334155' }}>Trailing Unit Parameters (Trailers)</h4>
              {trailers.map(tl => {
                const calculatedTrailerOpCost =
                  (Number(tl.monthlyPayment) + Number(tl.maintFundMo)) /
                  (globalMonthlyMiles || 5_000);
                return (
                  <div key={tl.id} style={{
                    backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
                    borderRadius: '8px', padding: '16px', marginBottom: '16px',
                  }}>
                    <strong style={{ display: 'block', marginBottom: '10px', color: '#0f172a', fontSize: '14px' }}>
                      {tl.description} (Unit {tl.unitNumber})
                    </strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>STICKER GVWR</label>
                        <input type="number" value={tl.gvwr}
                          onChange={(e) => updateTrailer(tl.id, 'gvwr', Number(e.target.value) || 0)}
                          style={inputSm}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>EMPTY TARE WEIGHT</label>
                        <input type="number" value={tl.emptyWeight}
                          onChange={(e) => updateTrailer(tl.id, 'emptyWeight', Number(e.target.value) || 0)}
                          style={inputSm}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>MONTHLY LEASE ($)</label>
                        <input type="number" value={tl.monthlyPayment}
                          onChange={(e) => updateTrailer(tl.id, 'monthlyPayment', Number(e.target.value) || 0)}
                          style={inputSm}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#475569', display: 'block', fontWeight: 'bold' }}>
                          AUTO MILE VALUE
                        </span>
                        <div style={{
                          padding: '6px', borderRadius: '4px', backgroundColor: '#f1f5f9',
                          border: '1px solid #cbd5e1', fontSize: '12px',
                          fontWeight: 'bold', textAlign: 'center', color: '#0f172a',
                        }}>
                          ${calculatedTrailerOpCost.toFixed(2)} / mi
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── VIEW D: Client Directory ──────────────────────────────────────── */}
        {currentView === 'clients' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Interactive Cargo Customer Index</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {clients.map(client => (
                <div key={client.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: '8px', padding: '16px',
                }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8', display: 'block' }}>
                      LOGISTICS ENTERPRISE NAME
                    </label>
                    <input
                      type="text"
                      value={client.companyName}
                      onChange={(e) => updateClient(client.id, 'companyName', e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1', marginTop: '2px', fontWeight: 'bold', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>ACCOUNT MANAGER</label>
                      <input
                        type="text"
                        value={client.contactName}
                        onChange={(e) => updateClient(client.id, 'contactName', e.target.value)}
                        style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>COMMUNICATION TELEPHONE</label>
                      <input
                        type="tel"
                        value={client.phone}
                        onChange={(e) => updateClient(client.id, 'phone', sanitizePhoneDigits(e.target.value))}
                        onPaste={(e) => handlePhonePaste(e, (sanitized) => updateClient(client.id, 'phone', sanitized))}
                        maxLength={10}
                        placeholder="e.g., 5551234567"
                        style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
