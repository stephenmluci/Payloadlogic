'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  AlertTriangle,
  Truck,
  MapPin,
  Phone,
  Loader2,
  Lock,
  MessageSquare,
  Navigation2,
  X,
  Send,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { DriverPwaInstallBanner } from '@/components/common/DriverPwaInstallBanner';
import type { Load, DriverProfile } from '@/types';

const DRIVER_PHASE_OPTIONS: { value: Load['status']; label: string }[] = [
  { value: 'dispatched', label: 'Dispatched / En Route to Pickup' },
  { value: 'arrived-origin', label: 'Arrived at Pickup Facility' },
  { value: 'loading', label: 'Loading Freight' },
  { value: 'in-transit', label: 'Loaded — In Transit to Delivery' },
  { value: 'arrived-destination', label: 'Arrived at Delivery Facility' },
  { value: 'unloading', label: 'Unloading Freight' },
  { value: 'delivered', label: 'Delivered / Complete' },
];

export default function DriverPortalMagicLinkPage() {
  const params = useParams();
  const token = (params?.token as string) || '';

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [companyName, setCompanyName] = useState('PayloadLogic Fleet');
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [assignedTruck, setAssignedTruck] = useState<{ unitNumber?: string; name?: string } | null>(null);
  const [assignedTrailer, setAssignedTrailer] = useState<{ unitNumber?: string; name?: string } | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [activeTab, setActiveTab] = useState<'loads' | 'profile'>('loads');

  const [busyLoadId, setBusyLoadId] = useState<string | null>(null);
  const [noteByLoad, setNoteByLoad] = useState<Record<string, string>>({});
  const [declineModalLoad, setDeclineModalLoad] = useState<Load | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Editable personal contact fields on My Profile tab
  const [editPhone, setEditPhone] = useState('');
  const [editEmergencyName, setEditEmergencyName] = useState('');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const fetchPortalData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/driver-portal?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setErrorMsg(data.error || 'This Driver View link is invalid or expired.');
        return;
      }
      setCompanyName(data.companyName || 'PayloadLogic Fleet');
      setDriverProfile(data.driverProfile);
      setAssignedTruck(data.assignedTruck || null);
      setAssignedTrailer(data.assignedTrailer || null);
      setLoads(Array.isArray(data.loads) ? data.loads : []);

      setEditPhone(data.driverProfile?.phone || '');
      setEditEmergencyName(data.driverProfile?.emergencyContactName || '');
      setEditEmergencyPhone(data.driverProfile?.emergencyContactPhone || '');

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('payloadlogic_driver_portal_token', token);
          localStorage.setItem('payloadlogic_pwa_role', 'driver');
        } catch {
          // Non-fatal
        }
      }

      // Best-effort silent Firebase Auth sign-in for real-time session sync
      if (data.loginEmail && data.tempPassword && !auth.currentUser) {
        signInWithEmailAndPassword(auth, data.loginEmail, data.tempPassword).catch(() => {});
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load Driver View.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  const showToastBanner = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(''), 4000);
  };

  const handleUpdateLoad = async (loadId: string, updates: Record<string, any>, successMsg: string) => {
    try {
      setBusyLoadId(loadId);
      const res = await fetch('/api/driver-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_load',
          loadId,
          updates,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update load.');
      }
      await fetchPortalData();
      showToastBanner(successMsg);
    } catch (err: any) {
      showToastBanner(err?.message || 'Could not update load.');
    } finally {
      setBusyLoadId(null);
    }
  };

  const handleAcceptLoad = async (load: Load) => {
    if (!load.id) return;
    const nowIso = new Date().toISOString();
    const nextStatus = ['pending', 'pending_approval', 'approved', 'client-request-approved'].includes(
      load.status
    )
      ? 'dispatched'
      : load.status;
    await handleUpdateLoad(
      load.id,
      {
        driverAcceptedStatus: 'accepted',
        driverAcceptedAt: nowIso,
        status: nextStatus,
        driverNote: `Load accepted by ${driverProfile?.name || 'Driver'}`,
        driverNoteUpdatedAt: nowIso,
      },
      `Load #${load.loadNumber || load.id.substring(0, 8)} accepted!`
    );
  };

  const handleConfirmDecline = async () => {
    if (!declineModalLoad?.id) return;
    const nowIso = new Date().toISOString();
    const cleanReason = declineReason.trim();
    await handleUpdateLoad(
      declineModalLoad.id,
      {
        driverAcceptedStatus: 'declined',
        driverDeclinedAt: nowIso,
        driverDeclineReason: cleanReason || 'Declined by driver',
        assignedDriverId: '',
        assignedDriverName: '',
        driverId: '',
        driverName: '',
        status: 'pending',
        driverNote: `Load declined by ${driverProfile?.name || 'Driver'}${cleanReason ? `: ${cleanReason}` : ''}`,
        driverNoteUpdatedAt: nowIso,
      },
      `Load #${declineModalLoad.loadNumber || declineModalLoad.id.substring(0, 8)} declined.`
    );
    setDeclineModalLoad(null);
    setDeclineReason('');
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      const res = await fetch('/api/driver-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_profile',
          profileUpdates: {
            phone: editPhone.trim(),
            emergencyContactName: editEmergencyName.trim(),
            emergencyContactPhone: editEmergencyPhone.trim(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not update profile.');
      }
      await fetchPortalData();
      showToastBanner('Your driver profile contact details have been updated.');
    } catch (err: any) {
      showToastBanner(err?.message || 'Failed to save profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400 mb-3" />
        <p className="text-sm font-semibold text-slate-300">Loading Restricted Driver View...</p>
      </div>
    );
  }

  if (errorMsg || !driverProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <Card className="max-w-md w-full bg-slate-900 border-slate-800 text-slate-100 p-6 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
          <h1 className="text-lg font-bold text-white">Driver View Unavailable</h1>
          <p className="text-xs text-slate-400">{errorMsg || 'Invalid access link.'}</p>
          <a
            href="/login"
            className="inline-block rounded-lg bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5"
          >
            Go to Driver Sign In (/login)
          </a>
        </Card>
      </div>
    );
  }

  const activeLoads = loads.filter((l) => l.status !== 'delivered');
  const completedLoads = loads.filter((l) => l.status === 'delivered');

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      {/* Top Brand Header */}
      <div className="bg-[#0c141f] border-b border-white/10 text-white px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PayloadLogicLogo variant="compact" iconSize={26} />
            <span className="text-xs text-slate-400 hidden sm:inline">• {companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold px-2 py-0.5 flex items-center gap-1"
            >
              <Lock className="w-3 h-3" /> Restricted Driver View
            </Badge>
            <DriverPwaInstallBanner variant="header-button" />
            <button
              type="button"
              onClick={fetchPortalData}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Refresh Dispatches"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-3.5 pt-4 space-y-4">
        <DriverPwaInstallBanner variant="banner" />
        {statusMessage && (
          <div className="rounded-xl bg-emerald-900 text-emerald-100 border border-emerald-500/40 px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-md">
            <span>{statusMessage}</span>
            <button type="button" onClick={() => setStatusMessage('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Driver Header Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-800">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black tracking-tight text-white">{driverProfile.name}</h1>
                <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                  {driverProfile.cdlStatus || 'Non-CDL'}
                </Badge>
                {driverProfile.licenseIssuingState && (
                  <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px]">
                    {driverProfile.licenseIssuingState} License
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-300 flex-wrap">
                <span>{driverProfile.phone || driverProfile.email}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  {assignedTruck?.unitNumber ? `Truck #${assignedTruck.unitNumber}` : 'Truck Unassigned'} /{' '}
                  {assignedTrailer?.unitNumber ? `Trailer #${assignedTrailer.unitNumber}` : 'Trailer Unassigned'}
                </span>
              </div>
            </div>

            {/* Navigation Tabs: My Assigned Loads vs My Profile */}
            <div className="flex bg-slate-800 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('loads')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'loads'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                My Loads ({activeLoads.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                My Profile
              </button>
            </div>
          </div>
        </div>

        {/* TAB 1: ASSIGNED LOADS */}
        {activeTab === 'loads' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-slate-900">
                My Assigned Loads ({activeLoads.length})
              </h2>
              <span className="text-[11px] text-slate-500">Scoped strictly to {driverProfile.name}</span>
            </div>

            {activeLoads.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 bg-white rounded-2xl">
                <CardContent className="p-8 text-center text-slate-500">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">No Active Loads Assigned Right Now</p>
                  <p className="text-xs text-slate-500 mt-1">
                    When dispatch assigns a load to you, it will appear here so you can accept or decline it and update transit status.
                  </p>
                </CardContent>
              </Card>
            ) : (
              activeLoads.map((load) => {
                const isBusy = busyLoadId === load.id;
                const noteVal = noteByLoad[load.id!] || '';
                const needsAcceptance = load.driverAcceptedStatus !== 'accepted';

                return (
                  <Card key={load.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/60 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-blue-600 text-white text-[10px] font-bold uppercase">
                            Load #{load.loadNumber || load.id?.substring(0, 8)}
                          </Badge>
                          <Badge variant="outline" className="text-xs font-bold capitalize bg-white">
                            {load.status}
                          </Badge>
                          {load.driverAcceptedStatus === 'accepted' && (
                            <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                              ✓ Accepted
                            </Badge>
                          )}
                        </div>
                        {load.distance ? (
                          <span className="text-xs font-bold text-slate-600">{load.distance} mi</span>
                        ) : null}
                      </div>

                      {/* Accept / Decline Banner */}
                      {needsAcceptance && (
                        <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-amber-950 uppercase">
                              New Load Assignment — Accept or Decline
                            </span>
                            <Badge className="bg-amber-200 text-amber-950 text-[10px] font-bold">
                              Action Needed
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleAcceptLoad(load)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Accept Load
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              onClick={() => {
                                setDeclineModalLoad(load);
                                setDeclineReason('');
                              }}
                              className="border-red-200 bg-white hover:bg-red-50 text-red-700 font-bold text-xs h-9"
                            >
                              <X className="w-3.5 h-3.5 mr-1" /> Decline Load
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Origin & Destination */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-blue-500" /> Pickup Origin
                          </span>
                          <p className="font-bold text-slate-900 mt-0.5">
                            {load.origin?.city}, {load.origin?.state} {load.origin?.zip}
                          </p>
                          {load.origin?.street && (
                            <p className="text-[11px] text-slate-500">{load.origin.street}</p>
                          )}
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-500" /> Delivery Destination
                          </span>
                          <p className="font-bold text-slate-900 mt-0.5">
                            {load.destination?.city}, {load.destination?.state} {load.destination?.zip}
                          </p>
                          {load.destination?.street && (
                            <p className="text-[11px] text-slate-500">{load.destination.street}</p>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 text-xs">
                      {/* Update Load Phase / Status */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">
                          Update Load Status / Phase
                        </Label>
                        <div className="flex items-center gap-2">
                          <select
                            value={load.status}
                            disabled={isBusy}
                            onChange={(e) => {
                              const nextPhase = e.target.value as Load['status'];
                              const nowIso = new Date().toISOString();
                              handleUpdateLoad(
                                load.id!,
                                {
                                  status: nextPhase,
                                  ...(nextPhase === 'arrived-origin' || nextPhase === 'arrived-destination'
                                    ? { arrivedAt: nowIso }
                                    : {}),
                                  ...(nextPhase === 'delivered' ? { deliveredAt: nowIso } : {}),
                                },
                                `Load status updated to ${nextPhase}.`
                              );
                            }}
                            className="flex-1 h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900"
                          >
                            {DRIVER_PHASE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Driver Notes */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-500" /> Driver Note to Dispatch
                        </Label>
                        {load.driverNote && (
                          <p className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700">
                            <strong>Latest Note:</strong> {load.driverNote}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add a status note, gate code, or detention update..."
                            value={noteVal}
                            onChange={(e) =>
                              setNoteByLoad((prev) => ({ ...prev, [load.id!]: e.target.value }))
                            }
                            className="h-9 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={isBusy || !noteVal.trim()}
                            onClick={() => {
                              const nowIso = new Date().toISOString();
                              handleUpdateLoad(
                                load.id!,
                                {
                                  driverNote: noteVal.trim(),
                                  driverNoteUpdatedAt: nowIso,
                                },
                                'Driver note sent to dispatch.'
                              );
                              setNoteByLoad((prev) => ({ ...prev, [load.id!]: '' }));
                            }}
                            className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0"
                          >
                            <Send className="w-3.5 h-3.5 mr-1" /> Send
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {completedLoads.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                  Completed Deliveries ({completedLoads.length})
                </h3>
                {completedLoads.map((cLoad) => (
                  <div
                    key={cLoad.id}
                    className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">
                        Load #{cLoad.loadNumber || cLoad.id?.substring(0, 8)}
                      </span>
                      <span className="text-slate-500 ml-2">
                        {cLoad.origin?.city} → {cLoad.destination?.city}
                      </span>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Delivered</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY DRIVER PROFILE */}
        {activeTab === 'profile' && (
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> My Driver Profile
                  </h2>
                  <p className="text-xs text-slate-500">
                    Your personal compliance record with {companyName}.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                  Licensing &amp; Qualifications
                </p>
                <div className="flex justify-between">
                  <span className="text-slate-500">Classification:</span>
                  <span className="font-bold text-slate-900">{driverProfile.cdlStatus || 'Non-CDL'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">License Number:</span>
                  <span className="font-semibold text-slate-800">
                    {driverProfile.cdlNumber || driverProfile.idNumber || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">License Issuing State:</span>
                  <span className="font-semibold text-slate-800">
                    {driverProfile.licenseIssuingState || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">License Expiration:</span>
                  <span className="font-semibold text-slate-800">
                    {driverProfile.cdlExpirationDate || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Medical Card Expiration:</span>
                  <span className="font-semibold text-slate-800">
                    {driverProfile.medicalCardExpirationDate || '—'}
                  </span>
                </div>
                {((driverProfile.endorsements && driverProfile.endorsements.length > 0) ||
                  driverProfile.additionalEndorsements) && (
                  <div className="pt-1.5 border-t border-slate-200 space-y-1">
                    <span className="text-slate-500 block">Endorsements:</span>
                    <div className="flex flex-wrap gap-1">
                      {(driverProfile.endorsements || []).map((end) => (
                        <Badge
                          key={end}
                          variant="secondary"
                          className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300"
                        >
                          {end}
                        </Badge>
                      ))}
                      {driverProfile.additionalEndorsements && (
                        <Badge variant="secondary" className="text-[10px]">
                          {driverProfile.additionalEndorsements}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Contact & Emergency Info */}
              <form onSubmit={handleSaveMyProfile} className="space-y-3 pt-2 border-t border-slate-100">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                  Update My Contact &amp; Emergency Info
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">My Mobile Phone</Label>
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact Name</Label>
                    <Input
                      value={editEmergencyName}
                      onChange={(e) => setEditEmergencyName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact Phone</Label>
                    <Input
                      value={editEmergencyPhone}
                      onChange={(e) => setEditEmergencyPhone(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingProfile}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                >
                  {isSavingProfile ? 'Saving...' : 'Save Contact Updates'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Decline Modal */}
      <Dialog
        open={Boolean(declineModalLoad)}
        onOpenChange={(open) => {
          if (!open) {
            setDeclineModalLoad(null);
            setDeclineReason('');
          }
        }}
      >
        <DialogContent className="max-w-md bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-red-700">
              Decline Load #{declineModalLoad?.loadNumber || declineModalLoad?.id?.substring(0, 8)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs">
            <Label className="text-xs font-bold text-slate-700">Reason for Declining (Optional)</Label>
            <Textarea
              rows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g., Out of HOS hours, equipment maintenance..."
              className="text-xs"
            />
          </div>
          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeclineModalLoad(null);
                setDeclineReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmDecline}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
            >
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
