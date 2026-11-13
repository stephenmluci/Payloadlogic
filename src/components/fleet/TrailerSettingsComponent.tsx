'use client';

import React, { useState, useEffect } from 'react';
import type { Trailer } from '@/lib/logisticsEngine';

// ==========================================
// TRAILER ASSET FINANCIAL CONFIGURATION UI
// ==========================================
// Live-bound input view for trailer operating cost calculation.
// Recalculates trailerOpCostPerMile on every keystroke via useEffect.
// Mirrors the cost-per-mile formula used inside calculateTripMetrics().

export const TrailerSettingsComponent: React.FC = () => {
  const [monthlyMiles, setMonthlyMiles] = useState<number>(5000);

  const [trailer, setTrailer] = useState<Trailer>({
    id: 't1',
    description: '40ft Hotshot Gooseneck',
    gvwr: 20000,
    emptyWeight: 9000,
    monthlyPayment: 800,
    maintFundMo: 150,
    insuranceMo: 0,
    deckLength: 40,
    deckWidth: 8.5,
  });

  const [calculatedOpCost, setCalculatedOpCost] = useState<number>(0);

  // Dynamic calculation hook — mirrors logisticsEngine trailerOpCostPerMile logic
  useEffect(() => {
    const milesDenominator = monthlyMiles > 0 ? monthlyMiles : 5000;
    const totalFixedCosts =
      Number(trailer.monthlyPayment || 0) +
      Number(trailer.maintFundMo || 0) +
      Number(trailer.insuranceMo || 0);
    setCalculatedOpCost(totalFixedCosts / milesDenominator);
  }, [trailer, monthlyMiles]);

  const handleInputChange = (field: keyof Trailer, value: number) => {
    setTrailer(prev => ({ ...prev, [field]: value }));
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#64748b',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f9fbfd',
        borderRadius: '8px',
        maxWidth: '600px',
        fontFamily: 'sans-serif',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>
        Trailer Asset Financial Configuration
      </h3>

      {/* Fleet Utilization Denominator */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>
          Expected Monthly Running Miles (Fleet Utilization)
        </label>
        <input
          type="number"
          value={monthlyMiles}
          onChange={(e) => setMonthlyMiles(Number(e.target.value))}
          style={inputStyle}
        />
        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
          Used as the denominator to convert monthly fixed costs to a per-mile rate.
          Defaults to 5,000 mi/mo if left blank.
        </p>
      </div>

      {/* Monthly Payment + Maintenance Fund */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div>
          <label style={labelStyle}>Monthly Payment ($)</label>
          <input
            type="number"
            value={trailer.monthlyPayment}
            onChange={(e) => handleInputChange('monthlyPayment', Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Maintenance Fund ($/mo)</label>
          <input
            type="number"
            value={trailer.maintFundMo}
            onChange={(e) => handleInputChange('maintFundMo', Number(e.target.value))}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Insurance + Auto-Calculated Result */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <label style={labelStyle}>Insurance ($/mo) — Overlap Included</label>
          <input
            type="number"
            value={trailer.insuranceMo}
            onChange={(e) => handleInputChange('insuranceMo', Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ ...labelStyle, color: '#475569' }}>
            Auto-Calculated Trailer Op. Cost / Mile
          </label>
          <div
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '6px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              fontWeight: 'bold',
              color: '#0f172a',
              boxSizing: 'border-box',
            }}
          >
            ${calculatedOpCost.toFixed(4)} / mi
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
            = (Payment + Maint + Insurance) ÷ Monthly Miles
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrailerSettingsComponent;
