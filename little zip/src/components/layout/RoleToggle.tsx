'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { DriverDashboard } from '@/components/dashboard/DriverDashboard';
import { Eye, EyeOff, Truck } from 'lucide-react';

export function RoleToggle() {
  const { user, previewRole, setPreviewRole } = useApp();

  if (!user || !['admin', 'owner', 'company_admin'].includes(user.role ?? '')) return null;

  const isPreviewing = previewRole === 'driver';
  const togglePreview = () => setPreviewRole(isPreviewing ? null : 'driver');

  return (
    <>
      <button
        onClick={togglePreview}
        className={`flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
          isPreviewing
            ? 'bg-blue-100 text-blue-700 border-blue-200'
            : 'bg-white/80 text-slate-600 border-slate-200 hover:bg-slate-50'
        }`}
        title={isPreviewing ? 'Exit Driver View Preview' : 'Preview Driver View'}
      >
        {isPreviewing ? (
          <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Exit Preview</>
        ) : (
          <><Truck className="w-3.5 h-3.5 mr-1.5" /> Driver View</>
        )}
      </button>

      {isPreviewing && (
        <div className="fixed inset-0 z-[100] bg-gray-50 overflow-y-auto">
          {/* Preview banner */}
          <div className="sticky top-0 z-[110] bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="w-4 h-4" />
              Admin Preview — Driver View
            </div>
            <button
              onClick={togglePreview}
              className="flex items-center gap-1.5 text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5" /> Exit Preview
            </button>
          </div>
          <DriverDashboard />
        </div>
      )}
    </>
  );
}