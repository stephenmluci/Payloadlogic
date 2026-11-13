'use client';

import React from 'react';
import { ShieldX, AlertOctagon, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GcwrBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverName: string;
  gcwr: number;
}

export function GcwrBlockModal({ isOpen, onClose, driverName, gcwr }: GcwrBlockModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="gcwr-block-title"
      aria-describedby="gcwr-block-description"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal panel */}
      <div className="relative w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
        {/* Red top stripe */}
        <div className="h-2 w-full rounded-t-2xl bg-gradient-to-r from-red-600 via-red-500 to-red-700" />

        <div className="bg-white rounded-b-2xl shadow-2xl border border-red-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-red-50 to-red-100/60 px-6 pt-6 pb-4 border-b border-red-200">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 h-14 w-14 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-200">
                <ShieldX className="h-8 w-8 text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-red-500 mb-0.5">
                  Federal Regulation Violation
                </p>
                <h2
                  id="gcwr-block-title"
                  className="text-xl font-black text-red-800 leading-tight"
                >
                  REGULATORY COMPLIANCE BLOCK
                </h2>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* GCWR callout */}
            <div className="flex items-center justify-between rounded-xl border-2 border-red-300 bg-red-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <AlertOctagon className="h-6 w-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                    Structural GCWR
                  </p>
                  <p className="text-2xl font-black text-red-700 leading-none">
                    {gcwr.toLocaleString()} lbs
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  CDL Threshold
                </p>
                <p className="text-lg font-black text-slate-500 line-through decoration-red-400">
                  26,000 lbs
                </p>
              </div>
            </div>

            {/* Explanation */}
            <div id="gcwr-block-description" className="text-sm leading-relaxed text-slate-700 space-y-2">
              <p>
                This truck and trailer combination has a structural Gross Combined Weight Rating of{' '}
                <strong className="text-red-700">{gcwr.toLocaleString()} lbs</strong>, which legally
                requires a{' '}
                <strong>Class A Commercial Driver's License</strong> under 49 CFR § 383.91 and
                FMCSA federal guidelines.
              </p>
              <p>
                Driver{' '}
                <strong className="text-slate-900">{driverName}</strong> is registered as{' '}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold text-xs">
                  Non-CDL
                </span>
                . This assignment has been{' '}
                <strong className="text-red-700">rejected</strong> and will not be saved.
              </p>
              <p className="text-xs text-slate-500 italic">
                To resolve: upgrade the driver's licensing status to Class A CDL, or select a
                lighter truck or trailer combination with a GCWR at or below 26,000 lbs.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <Button
              id="gcwr-block-dismiss"
              onClick={onClose}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 text-base rounded-xl shadow-lg shadow-red-200 transition-all duration-150 active:scale-[0.98]"
            >
              <XCircle className="h-5 w-5 mr-2" />
              Understood — Correct the Assignment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
