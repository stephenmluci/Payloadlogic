import React from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, Scale, AlertTriangle, HelpCircle } from 'lucide-react';
import type { ComplianceResult } from '@/lib/complianceEngine';

type ComplianceBadgesProps = {
  result: ComplianceResult;
  compact?: boolean;
};

export function ComplianceBadges({ result, compact = false }: ComplianceBadgesProps) {
  const {
    payloadStatus, cargoWeightLbs, trailerMaxPayload, payloadExcessLbs, hasPayloadData,
    cdlStatus, requiresClassACdl, driverCdlClass, paperGcwr
  } = result;

  // Don't show anything if no truck or trailer is selected
  if (paperGcwr === 0 && cargoWeightLbs === 0) return null;

  // --- DOT / CDL rendering ---
  let cdlBadge = null;
  if (cdlStatus === 'compliant') {
    cdlBadge = (
      <div className={`flex items-start gap-2 p-2 rounded-md bg-emerald-50 border border-emerald-200 ${compact ? 'items-center' : ''}`}>
        <ShieldCheck className={`text-emerald-600 shrink-0 ${compact ? 'h-4 w-4' : 'h-5 w-5 mt-0.5'}`} />
        <div>
          <p className={`font-bold text-emerald-800 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}>
            ✓ DOT / CDL COMPLIANT
          </p>
          {!compact && (
            <p className="text-[10px] text-emerald-700 mt-0.5">
              {requiresClassACdl ? 'Class A CDL Verified' : 'Non-CDL combination (≤ 26,000 lbs)'}
            </p>
          )}
        </div>
      </div>
    );
  } else if (cdlStatus === 'breach') {
    cdlBadge = (
      <div className={`flex items-start gap-2 p-2 rounded-md bg-red-50 border border-red-200 ${compact ? 'items-center' : ''}`}>
        <ShieldX className={`text-red-600 shrink-0 ${compact ? 'h-4 w-4' : 'h-5 w-5 mt-0.5'}`} />
        <div>
          <p className={`font-bold text-red-800 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}>
            🚫 CDL COMPLIANCE BREACH
          </p>
          {!compact && (
            <p className="text-[10px] text-red-700 mt-0.5">
              Class A CDL required — driver is {driverCdlClass}
            </p>
          )}
        </div>
      </div>
    );
  } else if (cdlStatus === 'unknown') {
    cdlBadge = (
      <div className={`flex items-start gap-2 p-2 rounded-md bg-slate-50 border border-slate-200 ${compact ? 'items-center' : ''}`}>
        <HelpCircle className={`text-slate-400 shrink-0 ${compact ? 'h-4 w-4' : 'h-5 w-5 mt-0.5'}`} />
        <div>
          <p className={`font-bold text-slate-600 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}>
            〰 CDL UNKNOWN
          </p>
          {!compact && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {paperGcwr > 0 ? (requiresClassACdl ? 'Requires Class A CDL - Assign a driver' : 'Compliant setup - Assign a driver') : 'Select equipment to check CDL requirements'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- Payload rendering (optional, usually if breach) ---
  let payloadBadge = null;
  if (payloadStatus === 'breach') {
    payloadBadge = (
      <div className={`flex items-start gap-2 p-2 rounded-md bg-red-50 border border-red-200 ${compact ? 'col-span-full items-center' : 'col-span-full'}`}>
        <Scale className={`text-red-600 shrink-0 ${compact ? 'h-4 w-4' : 'h-5 w-5 mt-0.5'}`} />
        <div>
          <p className={`font-bold text-red-800 uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`}>
            ⚠️ PAYLOAD BREACH
          </p>
          {!compact && (
            <p className="text-[10px] text-red-700 mt-0.5">
              Cargo weight ({cargoWeightLbs.toLocaleString()} lbs) exceeds trailer max payload ({trailerMaxPayload.toLocaleString()} lbs)
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      {cdlBadge}
      {payloadBadge}
    </div>
  );
}
