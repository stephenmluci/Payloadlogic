'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import {
  computeDeckPositions,
  getNextStopForLoad,
  getNextStopGoogleMapsUrl,
  getNextStopAppleMapsUrl,
  getFullRemainingRouteGoogleMapsUrl,
  isIosDevice,
  buildDriverProgressLegs,
  cleanSearchableAddress,
  type NextStopDestination,
} from '@/lib/routeUtils';
import type { Load, Address } from '@/types';
import {
  ACTIVE_DRIVER_STATUSES,
  isLoadAssignedToDriver,
  isLoadHistoricalOrDelivered,
  getDriverProfileId,
  resolveDriverProfileForView,
} from '@/lib/driverAssignment';
import EpodModal from '@/components/loads/EpodModal';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import { sanitizePhoneDigits, handlePhonePaste } from '@/lib/utils';
import {
  Truck, MapPin, Package, Navigation2, CheckCircle2,
  ChevronRight, Phone, Loader2, LogOut,
  AlertTriangle, MessageSquare, X, ChevronDown, ChevronUp, Send,
  Settings, Lock, FileCheck, PenLine, FileText, ExternalLink, Camera, Receipt, FileSearch, Upload,
  Eye, EyeOff, Clock, Sparkles, Compass
} from 'lucide-react';
import { compileInternalOutboundBolPdf } from '@/lib/loadPacket';
import { SignedBolUpload } from '@/components/loads/SignedBolUpload';
import { LogExpenseModal } from './LogExpenseModal';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { TripManifestCard } from './TripManifestCard';
import { DriverPwaInstallBanner } from '@/components/common/DriverPwaInstallBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEffect } from 'react';

const PHASES = [
  { value: 'pending', label: 'Pending (Waiting for broker/client)', isException: false },
  { value: 'client-request-approved', label: 'Request Approved (Load locked in)', isException: false },
  { value: 'dispatched', label: 'Dispatched / En Route (Heading to pickup)', isException: false },
  { value: 'arrived-origin', label: 'Arrived at Origin (At pickup facility)', isException: false },
  { value: 'loading', label: 'Loading (Freight being loaded)', isException: false },
  { value: 'in-transit', label: 'In Transit (Loaded) (En route to destination)', isException: false },
  { value: 'arrived-destination', label: 'Arrived at Destination (At drop-off facility)', isException: false },
  { value: 'unloading', label: 'Unloading (Freight being unloaded)', isException: false },
  { value: 'delivered', label: 'Delivered / Completed (Empty and finished)', isException: false },
  { value: 'waiting', label: 'Waiting / Detention', isException: true },
  { value: 'on-break', label: 'On Break', isException: true },
  { value: 'idle', label: 'Idle / Staging', isException: true },
] as const;
type DriverPhase = typeof PHASES[number]['value'] | 'arrived';

export interface NextActionRecommendation {
  nextPhase?: DriverPhase;
  actionType: 'phase' | 'epod' | 'complete';
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  buttonClass: string;
  badgeClass: string;
}

export function getNextRecommendedAction(
  load: Load,
  isAwaitingPaperwork: boolean,
  isPaperworkClosedOut: boolean
): NextActionRecommendation {
  const status = (load.status || '').toLowerCase();

  if (status === 'delivered' || isAwaitingPaperwork) {
    if (!isPaperworkClosedOut) {
      return {
        actionType: 'epod',
        label: 'Complete BOL (Sign on Glass)',
        sublabel: 'Obtain receiver signature for driver settlement',
        icon: <PenLine className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      };
    }
    return {
      actionType: 'complete',
      label: 'Delivered • Paperwork Complete',
      sublabel: 'Drop-off finished and signed BOL archived',
      icon: <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />,
      buttonClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }

  switch (status) {
    case 'pending':
    case 'client-request-approved':
    case 'approved':
      return {
        nextPhase: 'dispatched',
        actionType: 'phase',
        label: 'Start En Route to Pickup',
        sublabel: 'Depart for origin & notify shipper',
        icon: <Truck className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-950/20',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      };
    case 'dispatched':
      return {
        nextPhase: 'arrived-origin',
        actionType: 'phase',
        label: 'Mark Arrived at Shipper',
        sublabel: 'At pickup facility — ready to stage & load',
        icon: <MapPin className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-950/20',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
      };
    case 'arrived-origin':
      return {
        nextPhase: 'loading',
        actionType: 'phase',
        label: 'Confirm Loading Started',
        sublabel: 'Freight is being secured onto trailer deck',
        icon: <Package className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950/20',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    case 'loading':
      return {
        nextPhase: 'in-transit',
        actionType: 'phase',
        label: 'Loaded — Depart for Delivery',
        sublabel: 'Freight strapped & secured — en route to destination',
        icon: <Truck className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-950/20',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      };
    case 'in-transit':
      return {
        nextPhase: 'arrived',
        actionType: 'phase',
        label: 'Mark Arrived at Facility',
        sublabel: 'At receiver location — starts detention clock',
        icon: <MapPin className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-950/20',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
      };
    case 'arrived':
    case 'arrived-destination':
      return {
        nextPhase: 'unloading',
        actionType: 'phase',
        label: 'Confirm Unloading Started',
        sublabel: 'Receiver is unloading freight from trailer',
        icon: <Package className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950/20',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    case 'unloading':
      return {
        nextPhase: 'delivered',
        actionType: 'phase',
        label: 'Complete Delivery (Timestamp Drop-Off)',
        sublabel: 'Unload complete — record drop-off timestamp',
        icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'waiting':
      return {
        nextPhase: 'unloading',
        actionType: 'phase',
        label: 'Resume Unload / Finish Delivery',
        sublabel: 'Detention ended — continue with consignee',
        icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
      };
    case 'on-break':
    case 'idle':
      return {
        nextPhase: 'in-transit',
        actionType: 'phase',
        label: 'Resume In Transit',
        sublabel: 'Break finished — back on highway',
        icon: <Truck className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-950/20',
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
      };
    default:
      return {
        nextPhase: 'in-transit',
        actionType: 'phase',
        label: 'Advance Transit Status',
        sublabel: 'Move load to next dispatch phase',
        icon: <ChevronRight className="w-5 h-5 shrink-0" />,
        buttonClass: 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-950/20',
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
      };
  }
}

export function getStatusDisplayName(status: string | undefined): string {
  const s = (status || '').toLowerCase();
  const match = PHASES.find(p => p.value === s);
  if (match) return match.label.split('(')[0].trim();
  if (s === 'arrived') return 'Arrived at Facility';
  return status || 'Active';
}

const EXCEPTION_FLAGS = [
  { key: 'Mechanical Issue',  emoji: '🔧', color: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' },
  { key: 'Health / Medical',  emoji: '🏥', color: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200' },
  { key: 'DOT Break / Rest',  emoji: '💤', color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
  { key: 'Weather / Traffic', emoji: '🌧️', color: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' },
] as const;
type ExceptionKey = typeof EXCEPTION_FLAGS[number]['key'];

export function DriverDashboard() {
  const {
    user, loads, driverProfiles, vehicles, trips, settings,
    updateLoad, handleSignOut, reportDriverException,
    updateDriverNote, driverOwnerId, updateDriverProfile,
    previewRole, setPreviewRole,
  } = useApp();
  const { toast } = useToast();
  const [selectedLoadForEpod, setSelectedLoadForEpod]       = useState<Load | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen]         = useState(false);
  const [expenseModalLoad, setExpenseModalLoad]             = useState<Load | null>(null);
  const [isUpdatingPhase, setIsUpdatingPhase]               = useState<string | null>(null);
  const [isSubmittingNote, setIsSubmittingNote]             = useState<string | null>(null);
  const [noteByLoad, setNoteByLoad]                         = useState<Record<string, string>>({});
  const [showNoteByLoad, setShowNoteByLoad]                 = useState<Record<string, boolean>>({});
  const [showExceptionByLoad, setShowExceptionByLoad]       = useState<Record<string, boolean>>({});
  const [showManualStatusByLoad, setShowManualStatusByLoad] = useState<Record<string, boolean>>({});
  const [showMoreDetailsByLoad, setShowMoreDetailsByLoad]   = useState<Record<string, boolean>>({});
  const [isCompletedOpen, setIsCompletedOpen]               = useState(false);
  const [expandedCompletedId, setExpandedCompletedId]       = useState<string | null>(null);
  const [driverEldAckChecked, setDriverEldAckChecked]       = useState(false);
  const [isDriverEldModalOpen, setIsDriverEldModalOpen]     = useState(false);

  const isAdminOrDispatcher = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'company_admin';

  useEffect(() => {
    if (!isAdminOrDispatcher && user?.role === 'driver') {
      const ackKey = `eld_ack_${user.uid}`;
      const acked = typeof window !== 'undefined' ? localStorage.getItem(ackKey) : 'true';
      if (!acked) {
        setIsDriverEldModalOpen(true);
      }
    }
  }, [isAdminOrDispatcher, user?.role, user?.uid]);

  const handleConfirmDriverEld = () => {
    if (!driverEldAckChecked) return;
    if (user?.uid && typeof window !== 'undefined') {
      localStorage.setItem(`eld_ack_${user.uid}`, 'true');
    }
    setIsDriverEldModalOpen(false);
    toast({
      title: 'HOS & ELD Notice Acknowledged',
      description: 'Your regulatory acknowledgment has been recorded.',
    });
  };
  const [adminSelectedDriverId, setAdminSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdminOrDispatcher && !adminSelectedDriverId && driverProfiles.length > 0) {
      const activeOrFirst = driverProfiles.find((p) => p.status === 'active') ?? driverProfiles[0];
      if (activeOrFirst) setAdminSelectedDriverId(getDriverProfileId(activeOrFirst));
    }
  }, [isAdminOrDispatcher, adminSelectedDriverId, driverProfiles]);

  const targetDriverId = isAdminOrDispatcher ? adminSelectedDriverId : (user?.driverProfileId || user?.uid);

  const driverProfile = React.useMemo(() => {
    return resolveDriverProfileForView(
      targetDriverId || null,
      driverProfiles,
      user,
      isAdminOrDispatcher
    );
  }, [targetDriverId, driverProfiles, user, isAdminOrDispatcher]);

  // FCM Token Registration for Drivers
  useEffect(() => {
    let isSubscribed = true;

    async function registerFCM() {
      // Only register for actual driver users or when targetDriverId is present and supported
      if (!driverProfile?.uid || typeof window === 'undefined') return;
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register service worker if needed
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;

        const { getFirebaseMessaging } = await import('@/lib/firebase');
        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        const { getToken } = await import('firebase/messaging');
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        const currentToken = await getToken(messaging, {
          serviceWorkerRegistration: registration,
          ...(vapidKey ? { vapidKey } : {})
        });

        if (currentToken && isSubscribed) {
          if (driverProfile.fcmToken !== currentToken) {
            await updateDriverProfile(driverProfile.uid, { fcmToken: currentToken });
          }
        }
      } catch (err) {
        console.warn('FCM registration encountered an error:', err);
      }
    }

    registerFCM();

    return () => {
      isSubscribed = false;
    };
  }, [driverProfile?.uid, driverProfile?.fcmToken, updateDriverProfile]);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', assignedTruckId: 'none', assignedTrailerId: 'none' });
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);
  const [declineModalLoad, setDeclineModalLoad] = useState<Load | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isProcessingAcceptDecline, setIsProcessingAcceptDecline] = useState<string | null>(null);

  const handleAcceptLoad = async (load: Load) => {
    if (!load.id) return;
    const nowIso = new Date().toISOString();
    try {
      setIsProcessingAcceptDecline(load.id);
      const nextStatus = ['pending', 'pending_approval', 'approved', 'client-request-approved'].includes(load.status)
        ? 'dispatched'
        : load.status;
      await updateLoad(load.id, {
        driverAcceptedStatus: 'accepted',
        driverAcceptedAt: nowIso,
        status: nextStatus as Load['status'],
        driverNote: `Load accepted by ${driverProfile?.name || 'Driver'}`,
        driverNoteUpdatedAt: nowIso,
      });
      toast({
        title: 'Load Accepted',
        description: `Load #${load.loadNumber || load.id.substring(0, 8)} is locked in and active.`,
      });
    } catch (err: any) {
      toast({
        title: 'Could Not Accept Load',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setIsProcessingAcceptDecline(null);
    }
  };

  const handleConfirmDeclineLoad = async () => {
    if (!declineModalLoad?.id) return;
    const load = declineModalLoad;
    const nowIso = new Date().toISOString();
    const cleanReason = declineReason.trim();
    try {
      setIsProcessingAcceptDecline(load.id!);
      await updateLoad(load.id!, {
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
      });
      toast({
        title: 'Load Declined',
        description: `Load #${load.loadNumber || load.id!.substring(0, 8)} has been returned to dispatch.`,
      });
      setDeclineModalLoad(null);
      setDeclineReason('');
    } catch (err: any) {
      toast({
        title: 'Could Not Decline Load',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setIsProcessingAcceptDecline(null);
    }
  };

  const openEditModal = () => {
    if (!driverProfile) return;
    setEditForm({
      name: driverProfile.name || '',
      phone: driverProfile.phone || '',
      assignedTruckId: driverProfile.assignedTruckId || 'none',
      assignedTrailerId: driverProfile.assignedTrailerId || 'none',
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!driverProfile) return;
    try {
      await updateDriverProfile(driverProfile.uid, {
        name: editForm.name,
        phone: editForm.phone,
        assignedTruckId: editForm.assignedTruckId === 'none' ? undefined : editForm.assignedTruckId,
        assignedTrailerId: editForm.assignedTrailerId === 'none' ? undefined : editForm.assignedTrailerId,
      });
      toast({ title: 'Driver Updated' });
      setEditModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const assignedTruck   = vehicles.find((v) => v.id === driverProfile?.assignedTruckId);
  const assignedTrailer = vehicles.find((v) => v.id === driverProfile?.assignedTrailerId);

  // A load is closed out when a valid signed BOL is present and paperwork is recorded for billing
  const isPaperworkClosedOut = (l: Load) =>
    Boolean(l.signedBolUrl) && (l.paperworkStatus === 'pod_uploaded' || l.paperworkStatus === 'invoiced' || l.paperworkStatus === 'closed');

  // A load is awaiting paperwork if drop-off is recorded/delivered but paperwork is not closed out
  const isAwaitingPaperwork = (l: Load) =>
    isLoadHistoricalOrDelivered(l) && !isPaperworkClosedOut(l);

  // 'Active Dispatches' renders loads assigned to the selected/logged-in driver with an active status
  const activeLoads = loads.filter((l) => {
    const isAssigned = isLoadAssignedToDriver(l, driverProfile, trips, vehicles);
    if (!isAssigned) return false;
    if (isLoadHistoricalOrDelivered(l)) return false;
    return ACTIVE_DRIVER_STATUSES.has((l.status || '').toLowerCase().trim());
  });

  // Completed or delivered loads for the driver history section
  const completedToday = loads.filter((l) => {
    const isAssigned = isLoadAssignedToDriver(l, driverProfile, trips, vehicles);
    if (!isAssigned) return false;
    return isLoadHistoricalOrDelivered(l);
  });
  const deckPositions  = activeLoads.length > 0 ? computeDeckPositions(activeLoads) : [];
  const getDeckPos     = (loadId: string) => deckPositions.find((d) => d.loadId === loadId);

  // ── Group Active Dispatches into Combined Trip Manifests vs Standalone Loads ──
  type DispatchGroupItem = 
    | { type: 'trip'; trip: import('@/types').Trip; loads: Load[] }
    | { type: 'load'; load: Load };

  const dispatchGroupItems: DispatchGroupItem[] = React.useMemo(() => {
    // If there are multiple activeLoads assigned to this driver, group by tripId
    // If none match specific tripId but the driver has multiple active dispatches, or loads share tripId:
    const tripMap: Record<string, Load[]> = {};
    const standalone: Load[] = [];

    // Also look at all loads associated with the driver's active trips if tripId is set
    for (const load of activeLoads) {
      const tripId = load.tripId && load.tripId !== 'none' ? load.tripId.trim() : null;
      if (tripId) {
        if (!tripMap[tripId]) {
          tripMap[tripId] = [];
        }
        tripMap[tripId].push(load);
      } else {
        standalone.push(load);
      }
    }

    const items: DispatchGroupItem[] = [];

    // For any trip containing multiple active loads (or an explicit trip container), group into TripManifestCard
    for (const [tripId, tripLoads] of Object.entries(tripMap)) {
      const matchedTrip = trips?.find(t => t.id === tripId) || {
        id: tripId,
        name: `Combined Trip #${tripId.substring(0, 8)}`,
        loadIds: tripLoads.map(l => l.id!),
        startOdometer: 0,
        status: 'active' as const,
      };

      if (tripLoads.length > 1) {
        items.push({ type: 'trip', trip: matchedTrip, loads: tripLoads });
      } else {
        // Check if other loads in the system belong to this tripId
        const siblingLoadsInTrip = loads.filter(l => l.tripId === tripId && !isLoadHistoricalOrDelivered(l));
        if (siblingLoadsInTrip.length > 1) {
          items.push({ type: 'trip', trip: matchedTrip, loads: siblingLoadsInTrip });
        } else {
          // Single load with tripId rendered as standalone
          items.push({ type: 'load', load: tripLoads[0] });
        }
      }
    }

    // Add standalone loads
    for (const load of standalone) {
      items.push({ type: 'load', load });
    }

    return items;
  }, [activeLoads, trips]);


  // ── Phase change ─────────────────────────────────────────────────────────
  const handleSetPhase = async (load: Load, phase: DriverPhase) => {
    if (!load.id) return;
    
    // Accurately timestamp drop-off when marking Delivered without blocking on file upload
    const isDelivering = phase === 'delivered';
    const nowIso = new Date().toISOString();
    const hasBol = Boolean(load.signedBolUrl);

    const note = noteByLoad[load.id]?.trim() || undefined;
    try {
      setIsUpdatingPhase(load.id);
      
      const noteFields = note 
        ? { driverNote: note, driverNoteUpdatedAt: nowIso } 
        : {};
      
      await updateLoad(load.id, { 
        status: phase as Load['status'],
        ...(isDelivering ? {
          driverPhase: 'Complete',
          deliveredAt: load.deliveredAt || nowIso,
          paperworkStatus: hasBol ? 'pod_uploaded' : 'pending_pod',
        } : {}),
        ...noteFields 
      });
      
      setNoteByLoad(prev => ({ ...prev, [load.id!]: '' }));
      setShowNoteByLoad(prev => ({ ...prev, [load.id!]: false }));
      
      if (isDelivering) {
        toast({
          title: 'Delivery Timestamped',
          description: hasBol
            ? 'Drop-off verified and signed paperwork recorded.'
            : 'Drop-off timestamped! Next step: Upload signed paper BOL for accounting & billing.',
        });
      } else {
        toast({ title: 'Status Updated', description: `Now: ${PHASES.find(p => p.value === phase)?.label}` });
      }
    } catch (err: unknown) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setIsUpdatingPhase(null);
    }
  };

  // ── Exception flag ────────────────────────────────────────────────────────
  const handleToggleException = async (load: Load, flagKey: ExceptionKey) => {
    if (!load.id) return;
    const isActive = load.driverExceptionFlag === flagKey;
    const newFlag  = isActive ? null : flagKey;
    const note     = noteByLoad[load.id]?.trim() || undefined;
    try {
      setIsUpdatingPhase(load.id);
      await reportDriverException(load.id, newFlag, note);
      if (newFlag) setNoteByLoad(prev => ({ ...prev, [load.id!]: '' }));
    } catch (err: unknown) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setIsUpdatingPhase(null);
    }
  };

  // ── Send Driver Note Independently ────────────────────────────────────────
  const handleSendNote = async (load: Load) => {
    if (!load.id) return;
    const note = noteByLoad[load.id]?.trim();
    if (!note) {
      toast({ title: 'Note Required', description: 'Please type a note before sending.', variant: 'destructive' });
      return;
    }
    try {
      setIsSubmittingNote(load.id);
      await updateDriverNote(load.id, note);
      setNoteByLoad(prev => ({ ...prev, [load.id!]: '' }));
      setShowNoteByLoad(prev => ({ ...prev, [load.id!]: false }));
    } catch (err: unknown) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setIsSubmittingNote(null);
    }
  };

  const [isPreparingBolForLoadId, setIsPreparingBolForLoadId] = useState<string | null>(null);
  const [activeBolModalUrl, setActiveBolModalUrl] = useState<string | null>(null);
  const [activeBolModalTitle, setActiveBolModalTitle] = useState<string>('Active Bill of Lading (BOL)');
  const [activeBolSelectedLoad, setActiveBolSelectedLoad] = useState<Load | null>(null);

  // Live device GPS coordinates & iOS detection
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const isApple = React.useMemo(() => isIosDevice(), []);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setDriverCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          // If permission denied or timeout, Google/Apple Maps defaults to device GPS automatically
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);

  /**
   * Primary Navigation: Routes strictly to the NEXT stop (Pickup if not yet departed; Delivery if in-transit)
   * Uses device GPS natively by default (omits stale origin address).
   */
  const handleNavigateNextStop = (load: Load, provider: 'google' | 'apple' = 'google') => {
    const nextStop = getNextStopForLoad(load);
    if (provider === 'apple') {
      window.open(getNextStopAppleMapsUrl(nextStop.address || nextStop.cleanAddress), '_blank');
    } else {
      window.open(getNextStopGoogleMapsUrl(nextStop.address || nextStop.cleanAddress, driverCoords), '_blank');
    }
  };

  /**
   * Secondary Navigation: Routes ALL remaining stops in sequence (skipping completed stops)
   */
  const handleNavigateFullRoute = (load: Load) => {
    const fullUrl = getFullRemainingRouteGoogleMapsUrl(load, loads, driverProfile, driverCoords);
    window.open(fullUrl, '_blank');
  };

  const handleNavigate = (load: Load) => handleNavigateNextStop(load, 'google');

  /**
   * Universal Driver Access to the Active Outbound BOL:
   * Serves strictly the single document associated with the active load.
   * If bolSource is 'broker' and no broker document is attached, displays a fallback.
   * If bolSource is 'system', uses uploaded file or generates standard internal BOL.
   */
  const handleViewActiveBol = async (load: Load) => {
    setActiveBolSelectedLoad(load);

    // If load has an outbound BOL URL attached, open it
    if (load.outboundBolUrl) {
      setActiveBolModalUrl(load.outboundBolUrl);
      setActiveBolModalTitle(
        load.bolSource === 'broker'
          ? `Broker BOL • Load #${load.loadNumber || load.id?.substring(0, 8)}`
          : `Active BOL • Load #${load.loadNumber || load.id?.substring(0, 8)}`
      );
      return;
    }

    // If broker BOL is specified but no document is attached to this load
    if (load.bolSource === 'broker') {
      setActiveBolModalUrl(null);
      setActiveBolModalTitle(`Broker BOL • Load #${load.loadNumber || load.id?.substring(0, 8)}`);
      toast({
        title: 'No Broker BOL Attached',
        description: 'No Broker BOL attached to this load',
        variant: 'destructive',
      });
      return;
    }

    // System-generated BOL: compile an internal standard PDF BOL on the fly for this specific load
    try {
      setIsPreparingBolForLoadId(load.id || 'current');
      const pdfBlob = await compileInternalOutboundBolPdf({
        load,
        carrierName: settings?.carrierName || 'PayloadLogic Fleet',
        carrierDot: settings?.carrierDotNumber,
        carrierMc: settings?.carrierMcNumber,
        carrierAddress: settings?.carrierAddress,
        carrierPhone: settings?.carrierContactPhone,
        carrierEmail: settings?.carrierContactEmail,
      });
      const blobUrl = URL.createObjectURL(pdfBlob);
      setActiveBolModalUrl(blobUrl);
      setActiveBolModalTitle(`Active BOL • Load #${load.loadNumber || load.id?.substring(0, 8)}`);
    } catch (err: any) {
      console.error('Error generating active BOL for driver:', err);
      toast({
        title: 'Could not open BOL',
        description: err?.message || 'Unable to open digital Bill of Lading.',
        variant: 'destructive',
      });
    } finally {
      setIsPreparingBolForLoadId(null);
    }
  };

  if (!driverProfile) {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-blue-600 mb-4" />
        <p className="text-slate-500">Loading driver profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 pb-20 sm:pb-8">
      {/* ── Admin Preview Notice & Driver Switcher ── */}
      {isAdminOrDispatcher && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold sticky top-0 z-30 shadow-md flex flex-wrap items-center justify-between gap-2 border-b border-amber-600">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-950 shrink-0" />
            <span className="font-black uppercase tracking-wide">Admin Preview — Driver View</span>
          </div>
          <div className="flex items-center gap-2">
            <select 
              className="bg-slate-950 text-white text-xs rounded-lg px-2.5 py-1 font-medium border-none focus:ring-2 focus:ring-slate-800 cursor-pointer max-w-[170px] sm:max-w-[220px] truncate"
              value={driverProfile ? getDriverProfileId(driverProfile) : (adminSelectedDriverId || '')} 
              onChange={(e) => setAdminSelectedDriverId(e.target.value)}
              title="Switch viewed driver"
            >
              <option value="" disabled>Switch Driver</option>
              {driverProfiles.map(dp => {
                const dpId = getDriverProfileId(dp);
                const trk = vehicles.find(v => v.id === dp.assignedTruckId);
                const trl = vehicles.find(v => v.id === dp.assignedTrailerId);
                const trkLabel = trk?.unitNumber || trk?.name || 'No Trk';
                const trlLabel = trl?.unitNumber || trl?.name || 'No Trl';
                return (
                  <option key={dpId} value={dpId}>
                    {dp.name} ({trkLabel}/{trlLabel})
                  </option>
                );
              })}
            </select>
            {previewRole === 'driver' && (
              <button
                onClick={() => setPreviewRole(null)}
                className="bg-slate-950 hover:bg-slate-900 active:scale-95 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Exit driver preview"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Top Brand Bar ── */}
      <div className={`bg-[#0c141f] border-b border-white/10 text-white px-4 py-2.5 shadow-xs ${isAdminOrDispatcher ? 'relative' : 'sticky top-0 z-20'}`}>
        <div className="max-w-[500px] mx-auto flex items-center justify-between">
          <PayloadLogicLogo variant="compact" iconSize={26} />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-slate-700 bg-slate-800/90 text-slate-300 text-[11px] font-semibold px-2.5 py-0.5">
              {isAdminOrDispatcher ? 'Preview Mode' : 'Driver View'}
            </Badge>
            {!isAdminOrDispatcher && <DriverPwaInstallBanner variant="header-button" />}
            <button
              type="button"
              onClick={() => setIsMyProfileOpen(true)}
              className="text-[11px] font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              My Profile
            </button>
            {!isAdminOrDispatcher && (
              <button
                type="button"
                onClick={handleSignOut}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[500px] mx-auto px-3.5 pt-4 sm:pt-6 space-y-4">
        {!isAdminOrDispatcher && <DriverPwaInstallBanner variant="banner" />}

        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quick Edit Driver</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Driver Name</Label>
                <Input value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input 
                  type="tel"
                  value={editForm.phone} 
                  onChange={e => setEditForm(prev => ({ ...prev, phone: sanitizePhoneDigits(e.target.value) }))} 
                  onPaste={(e) => handlePhonePaste(e, (sanitized) => setEditForm(prev => ({ ...prev, phone: sanitized })))}
                  placeholder="e.g., 5551234567"
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <Label>Assigned Truck</Label>
                <Select value={editForm.assignedTruckId} onValueChange={v => setEditForm(prev => ({ ...prev, assignedTruckId: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {vehicles.filter(v => v.type === 'truck').map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.unitNumber} - {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned Trailer</Label>
                <Select value={editForm.assignedTrailerId} onValueChange={v => setEditForm(prev => ({ ...prev, assignedTrailerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {vehicles.filter(v => v.type === 'trailer').map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.unitNumber} - {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Driver Regulatory Onboarding Modal: HOS & ELD Disclaimer ── */}
        <Dialog open={isDriverEldModalOpen} onOpenChange={() => {}}>
          <DialogContent className="max-w-md [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <div className="flex items-center gap-2.5 text-amber-600 mb-1">
                <div className="p-2 rounded-lg bg-amber-100">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                  Driver Regulatory Requirement
                </DialogTitle>
              </div>
            </DialogHeader>

            {/* Warning UI */}
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-left my-2">
              <p className="text-xs sm:text-sm font-semibold text-amber-950 leading-relaxed">
                Hours of Service (HOS) provided in this app are for estimation purposes only. Dash Dispatch is NOT a certified Electronic Logging Device (ELD). Drivers must strictly rely on their certified ELD for legal compliance.
              </p>
            </div>

            {/* Required Checkbox */}
            <div className="pt-2">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="driverDashboardEldAck"
                  checked={driverEldAckChecked}
                  onCheckedChange={(checked) => setDriverEldAckChecked(checked as boolean)}
                  className="mt-0.5 border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white"
                />
                <Label
                  htmlFor="driverDashboardEldAck"
                  className="text-xs sm:text-sm font-bold text-slate-900 leading-snug cursor-pointer select-none"
                >
                  I understand and agree that Dash Dispatch does not replace my ELD. <span className="text-red-600">*</span>
                </Label>
              </div>
              {!driverEldAckChecked && (
                <p className="text-[11px] text-amber-800 font-medium mt-1 pl-7">
                  * You must acknowledge this statement to access your driver dispatches.
                </p>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                onClick={handleConfirmDriverEld}
                disabled={!driverEldAckChecked}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Continue to Driver View
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Compact Mobile-Friendly Driver Profile Bar ── */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white truncate">
                  {driverProfile.name}
                </h1>
                {isAdminOrDispatcher && (
                  <button 
                    onClick={openEditModal} 
                    className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer" 
                    title="Edit Driver Profile"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-1.5 py-0">
                  {driverProfile.cdlStatus || 'CDL'}
                </Badge>
                <button
                  type="button"
                  onClick={() => setIsMyProfileOpen(true)}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                >
                  View My Profile
                </button>
              </div>

              {/* Tap to Call Driver Phone & Equipment */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {driverProfile.phone ? (
                  <a
                    href={`tel:${driverProfile.phone}`}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold bg-slate-800/90 hover:bg-slate-800 px-2.5 py-0.5 rounded-full transition-colors active:scale-95"
                    title="Tap to call driver phone"
                  >
                    <Phone className="w-3 h-3 text-blue-400 shrink-0" />
                    <span>{driverProfile.phone}</span>
                  </a>
                ) : (
                  <span className="text-[11px] text-slate-400">No phone</span>
                )}

                <div className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-slate-800/90 px-2.5 py-0.5 rounded-full">
                  <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-medium">
                    {assignedTruck?.unitNumber || 'Trk Unassigned'} • {assignedTrailer?.unitNumber || 'Trl Unassigned'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell driverId={targetDriverId || driverProfile.uid} />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setExpenseModalLoad(null);
                  setIsExpenseModalOpen(true);
                }}
                className="h-9 px-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Log fuel receipt or expense"
              >
                <Receipt className="w-3.5 h-3.5 text-slate-950" />
                <span>Log Fuel</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Active Dispatches ────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Active Dispatches</h2>
              <span className="text-xs text-slate-500 font-medium">({activeLoads.length})</span>
            </div>
            {activeLoads.length > 0 && (
              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[11px] font-bold">
                {activeLoads.length} In Progress
              </Badge>
            )}
          </div>

          {activeLoads.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 bg-white/60 shadow-none rounded-2xl">
              <CardContent className="p-8 text-center text-slate-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-bold text-slate-700">No active dispatches</p>
                <p className="text-xs text-slate-500 mt-1">Ready for next assignment. Enjoy the downtime!</p>
              </CardContent>
            </Card>
          ) : (
            dispatchGroupItems.map((item, groupIdx) => {
              if (item.type === 'trip') {
                return (
                  <TripManifestCard
                    key={item.trip.id}
                    trip={item.trip}
                    loads={item.loads}
                    driverProfile={driverProfile}
                    onUpdateLoad={updateLoad}
                    onLogExpense={(targetLoad) => {
                      setExpenseModalLoad(targetLoad);
                      setIsExpenseModalOpen(true);
                    }}
                    onOpenEpod={(targetLoad) => setSelectedLoadForEpod(targetLoad)}
                    onViewActiveBol={(targetLoad) => handleViewActiveBol(targetLoad)}
                    reportDriverException={reportDriverException}
                    updateDriverNote={updateDriverNote}
                  />
                );
              }

              const load = item.load;
              const currentPhase  = load.status as DriverPhase;
              const deck          = getDeckPos(load.id!);
              const busy          = isUpdatingPhase === load.id;
              const noteVal       = noteByLoad[load.id!] ?? '';
              const activeFlag    = load.driverExceptionFlag;
              const isPrimary     = groupIdx === 0;

              const nextAction = getNextRecommendedAction(load, isAwaitingPaperwork(load), isPaperworkClosedOut(load));
              const currentStatusDisplay = getStatusDisplayName(load.status);
              const showMore = showMoreDetailsByLoad[load.id!] ?? false;

              const originPhone = load.origin?.contactPhone;
              const destPhone   = load.destination?.contactPhone;

              return (
                <Card 
                  key={load.id} 
                  className={`border-0 rounded-2xl overflow-hidden relative bg-white transition-all shadow-sm ${
                    isPrimary ? 'ring-2 ring-blue-500/50 shadow-md' : ''
                  }`}
                >
                  {/* Left accent strip */}
                  <div className={`absolute top-0 left-0 w-2 h-full ${
                    load.status === 'delivered' || isAwaitingPaperwork(load)
                      ? 'bg-emerald-500'
                      : isPrimary 
                      ? 'bg-blue-600' 
                      : 'bg-slate-300'
                  }`} />

                  {/* Active exception banner */}
                  {activeFlag && (
                    <div className="ml-2 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-red-700">{activeFlag}</span>
                        {load.driverNote && (
                          <span className="text-xs text-red-600 ml-1.5">— {load.driverNote}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <CardHeader className="pb-3 border-b border-slate-100 pl-5 pr-4 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isPrimary && (
                          <Badge className="bg-blue-600 text-white font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 shadow-xs">
                            Current Active Dispatch
                          </Badge>
                        )}
                        {deck && (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-bold text-[10px]">
                            Deck #{deck.deckOrder}
                            {deck.isTopLoad ? ' • First Off' : deck.isBottomLoad ? ' • Last Off' : ''}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-500 ml-auto">
                        #{load.loadNumber ?? load.id?.substring(0, 8)}
                      </span>
                    </div>

                    {/* Current Status Pill */}
                    <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status:</span>
                        <Badge className={`text-xs font-extrabold px-2 py-0.5 ${nextAction.badgeClass}`}>
                          {currentStatusDisplay}
                        </Badge>
                        {load.driverAcceptedStatus === 'accepted' && (
                          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5">
                            ✓ Load Accepted
                          </Badge>
                        )}
                      </div>
                      {busy && (
                        <div className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Updating…</span>
                        </div>
                      )}
                    </div>

                    {/* ── Accept / Decline Load Assignment Banner ── */}
                    {load.driverAcceptedStatus !== 'accepted' &&
                      ['pending', 'pending_approval', 'approved', 'client-request-approved', 'dispatched'].includes(
                        (load.status || '').toLowerCase()
                      ) && (
                        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                              Assigned Load — Confirm Dispatch
                            </span>
                            <Badge className="bg-amber-200 text-amber-950 text-[10px] font-bold">
                              Action Required
                            </Badge>
                          </div>
                          <p className="text-[11px] text-amber-900 leading-snug">
                            Accept this load to lock in your dispatch and begin transit updates, or decline to return it to dispatch.
                          </p>
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <Button
                              type="button"
                              size="sm"
                              disabled={isProcessingAcceptDecline === load.id}
                              onClick={() => handleAcceptLoad(load)}
                              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                            >
                              {isProcessingAcceptDecline === load.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              )}
                              Accept Load
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isProcessingAcceptDecline === load.id}
                              onClick={() => {
                                setDeclineModalLoad(load);
                                setDeclineReason('');
                              }}
                              className="h-9 border-red-200 bg-white hover:bg-red-50 text-red-700 font-bold text-xs rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Decline Load
                            </Button>
                          </div>
                        </div>
                      )}

                    {/* Origin → Destination Route with Tap-to-Call Contact Phones */}
                    <div className="bg-slate-50 rounded-xl p-3 mt-3 border border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-0.5">
                            <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                            <span>Origin (Pickup)</span>
                          </div>
                          <div className="font-extrabold text-sm text-slate-900 truncate">
                            {load.origin?.city || 'Origin'}, {load.origin?.state || ''}
                          </div>
                          {originPhone && (
                            <a
                              href={`tel:${originPhone}`}
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold mt-0.5"
                              title="Tap to call shipper"
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>{originPhone}</span>
                            </a>
                          )}
                        </div>

                        <div className="px-2 text-slate-400 font-bold shrink-0">
                          <ChevronRight className="w-5 h-5 text-slate-300" />
                        </div>

                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-end gap-1 mb-0.5">
                            <span>Destination</span>
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                          </div>
                          <div className="font-extrabold text-sm text-slate-900 truncate">
                            {load.destination?.city || 'Destination'}, {load.destination?.state || ''}
                          </div>
                          {destPhone && (
                            <a
                              href={`tel:${destPhone}`}
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold mt-0.5 justify-end"
                              title="Tap to call receiver"
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>{destPhone}</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Cargo Summary Chips */}
                      <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                        <span className="font-bold text-slate-800 truncate max-w-[200px]">
                          {load.cargoDescription || 'Freight'}
                        </span>
                        {load.cargoWeightNum ? (
                          <Badge variant="outline" className="bg-white text-[10px] py-0 font-semibold">
                            {load.cargoWeightNum.toLocaleString()} lbs
                          </Badge>
                        ) : null}
                        {load.cargoLength ? (
                          <Badge variant="outline" className="bg-white text-[10px] py-0 font-semibold">
                            {load.cargoLength} ft
                          </Badge>
                        ) : null}
                        {load.requiresTarping && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] py-0 font-bold">
                            Tarp Required
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pl-5 space-y-3.5">
                    {/* Facility Detention Banner */}
                    {(load.status === 'arrived' || (load as any).status === 'Arrived' || load.arrivedAt) && (
                      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between text-xs text-teal-900 shadow-xs">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2.5 w-2.5 rounded-full bg-teal-500 animate-ping shrink-0" />
                          <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
                          <div>
                            <span className="font-black text-teal-900">Arrived at Facility • Detention Clock Active</span>
                            {load.arrivedAt && (
                              <span className="block text-[11px] text-teal-700 font-medium">
                                Arrived: <strong>{new Date(load.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge className="bg-teal-700 text-white font-bold text-[10px] shrink-0">
                          Detention Active
                        </Badge>
                      </div>
                    )}

                    {/* ── ACTION-FIRST: Single Next Recommended Status Button ── */}
                    {nextAction.actionType === 'phase' && nextAction.nextPhase && (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSetPhase(load, nextAction.nextPhase as DriverPhase)}
                          className={`w-full min-h-[52px] py-3 px-4 rounded-xl font-black text-sm flex items-center justify-between shadow-md active:scale-[0.99] transition-all cursor-pointer ${nextAction.buttonClass}`}
                        >
                          <div className="flex items-center gap-3 text-left min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : nextAction.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-black leading-tight flex items-center gap-2 truncate">
                                <span>{nextAction.label}</span>
                                <span className="text-[9px] uppercase font-bold tracking-wider bg-white/25 px-1.5 py-0.5 rounded shrink-0">
                                  Next Step
                                </span>
                              </div>
                              <div className="text-[11px] font-medium opacity-90 leading-tight mt-0.5 truncate">
                                {nextAction.sublabel}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 opacity-90 shrink-0 ml-2" />
                        </button>
                      </div>
                    )}

                    {/* ── Post-Delivery Paperwork Call to Action (When Drop-Off Recorded) ── */}
                    {(load.status === 'delivered' || isAwaitingPaperwork(load)) && (
                      <div className="p-3.5 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-50/80 via-white to-white shadow-sm space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-black text-emerald-950 uppercase tracking-wide block">
                                Drop-Off Timestamped
                              </span>
                              {load.deliveredAt && (
                                <span className="text-[10px] text-emerald-700 font-medium">
                                  {new Date(load.deliveredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge className={isPaperworkClosedOut(load) ? "bg-emerald-600 text-white text-[10px]" : "bg-amber-500 text-slate-950 font-bold text-[10px]"}>
                            {isPaperworkClosedOut(load) ? "✓ POD Verified" : "Awaiting Signed BOL"}
                          </Badge>
                        </div>

                        {!isPaperworkClosedOut(load) ? (
                          <div className="space-y-2 pt-1">
                            <p className="text-xs text-slate-600 font-medium">
                              Receiver signature is required to finalize paperwork for driver settlement:
                            </p>
                            <Button
                              type="button"
                              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-md text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                              onClick={() => setSelectedLoadForEpod(load)}
                            >
                              <PenLine className="w-4 h-4 mr-1" />
                              <span>Complete Bill of Lading (Sign on Glass)</span>
                            </Button>
                            <div className="pt-1">
                              <SignedBolUpload load={load} updateLoad={updateLoad} label="Upload Signed Paper BOL (POD)" compact={false} />
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-emerald-100/70 border border-emerald-300 rounded-xl flex items-center justify-between text-xs">
                            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                              Signed BOL Archived • Paperwork Complete
                            </span>
                            {load.signedBolUrl && (
                              <a
                                href={load.signedBolUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-purple-700 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors shadow-xs"
                              >
                                <FileCheck className="w-3.5 h-3.5 text-purple-600" />
                                <span>View BOL</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Practical Turn-by-Turn Navigation & Quick Actions ── */}
                    {(() => {
                      const nextStop = getNextStopForLoad(load);
                      const isPickup = nextStop.type === 'pickup';
                      const nextCityState = nextStop.cityState;

                      return (
                        <div className="space-y-2 pt-1">
                          {/* Primary Turn-by-Turn Navigate Action */}
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              onClick={() => handleNavigateNextStop(load, 'google')}
                              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-sm flex items-center justify-between px-3.5 transition-all cursor-pointer"
                              title={`Navigate directly to ${nextStop.label}: ${nextCityState || nextStop.cleanAddress} in Google Maps`}
                            >
                              <div className="flex items-center gap-2.5 truncate text-left">
                                <div className="w-7 h-7 rounded-lg bg-blue-500/40 flex items-center justify-center shrink-0">
                                  <Navigation2 className="w-4 h-4 fill-white text-white" />
                                </div>
                                <div className="truncate">
                                  <div className="text-xs font-black tracking-tight leading-none flex items-center gap-1.5">
                                    <span>{nextStop.label}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-800/60 text-blue-100">
                                      {isPickup ? 'Pickup' : 'Delivery'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-semibold text-blue-100/90 truncate mt-0.5">
                                    {nextCityState || nextStop.cleanAddress || 'Next Facility / Stop'}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-blue-200 shrink-0 ml-1" />
                            </Button>

                            {isApple && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleNavigateNextStop(load, 'apple')}
                                className="h-12 px-3 border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 font-bold text-xs rounded-xl shadow-xs shrink-0 flex flex-col items-center justify-center leading-none gap-1 cursor-pointer"
                                title="Open turn-by-turn directions in Apple Maps"
                              >
                                <Compass className="w-4 h-4 text-blue-700" />
                                <span className="text-[10px]">Apple</span>
                              </Button>
                            )}
                          </div>

                          {/* Secondary Route Options & GPS Status */}
                          <div className="flex items-center justify-between px-1 text-xs">
                            <button
                              type="button"
                              onClick={() => handleNavigateFullRoute(load)}
                              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
                              title="Route all remaining stops for this trip in Google Maps"
                            >
                              <Compass className="w-3.5 h-3.5 text-blue-600" />
                              <span>Full Remaining Trip Route</span>
                            </button>

                            {driverCoords ? (
                              <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                GPS Live
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">GPS Ready</span>
                            )}
                          </div>

                          {/* Auxiliary Actions: View BOL & Log Expense */}
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            {/* View Active Outbound BOL / Broker BOL */}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleViewActiveBol(load)}
                              disabled={isPreparingBolForLoadId === (load.id || 'current')}
                              className="h-10 px-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              title="View outbound BOL / shipping manifest to present at facility gate"
                            >
                              {isPreparingBolForLoadId === (load.id || 'current') ? (
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                              ) : (
                                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                              )}
                              <span>{load.bolSource === 'broker' ? 'Broker BOL' : 'View BOL'}</span>
                            </Button>

                            {/* Log Expense / Fuel */}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setExpenseModalLoad(load);
                                setIsExpenseModalOpen(true);
                              }}
                              className="h-10 px-2 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              title="Log fuel or route expense for this load"
                            >
                              <Receipt className="w-4 h-4 text-amber-700 shrink-0" />
                              <span>Expense</span>
                              {load.actualExpenses && load.actualExpenses.length > 0 && (
                                <span className="ml-0.5 px-1 bg-amber-600 text-white rounded-full text-[9px] font-black">
                                  {load.actualExpenses.length}
                                </span>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Progressive Disclosure: Expandable Options, Exceptions & Status List ── */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowMoreDetailsByLoad(prev => ({ ...prev, [load.id!]: !showMore }))}
                        className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5 text-slate-400" />
                          <span>More Options &amp; Status Override</span>
                        </span>
                        {showMore ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </button>

                      {showMore && (
                        <div className="mt-3 space-y-4 pt-1">

                          {/* Quick Exception / Delay Reporter */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                Report Delay or Issue
                              </span>
                              {activeFlag && (
                                <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px] font-bold">
                                  Flagged: {activeFlag}
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              {EXCEPTION_FLAGS.map(({ key, emoji, color }) => {
                                const isActive = activeFlag === key;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleToggleException(load, key as ExceptionKey)}
                                    className={`flex items-center gap-1.5 text-xs font-bold border rounded-lg px-2.5 py-2 transition-all text-left cursor-pointer ${
                                      isActive ? `ring-2 ring-red-400 ${color}` : color
                                    }`}
                                  >
                                    <span className="text-sm">{emoji}</span>
                                    <span className="truncate flex-1">{key}</span>
                                    {isActive && <X className="w-3 h-3 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Driver Note to Dispatcher */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                                Send Note to Dispatcher
                              </span>
                            </div>
                            <Textarea
                              placeholder="Type a quick update or message for dispatch…"
                              rows={2}
                              value={noteVal}
                              onChange={e => setNoteByLoad(prev => ({ ...prev, [load.id!]: e.target.value }))}
                              className="text-xs resize-none bg-white border-slate-200"
                            />
                            <div className="flex items-center justify-between pt-1">
                              <p className="text-[10px] text-slate-400">
                                Visible immediately on dispatcher dashboard.
                              </p>
                              <Button
                                size="sm"
                                disabled={!noteVal.trim() || isSubmittingNote === load.id}
                                onClick={() => handleSendNote(load)}
                                className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold"
                              >
                                {isSubmittingNote === load.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                ) : (
                                  <Send className="w-3.5 h-3.5 mr-1" />
                                )}
                                Send Note
                              </Button>
                            </div>
                            {load.driverNote && (
                              <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-200 text-slate-600 mt-2">
                                <span className="font-bold text-slate-700">Last note on file: </span>
                                &ldquo;{load.driverNote}&rdquo;
                              </div>
                            )}
                          </div>

                          {/* Manual Status Override List */}
                          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                                Manual Status Override
                              </span>
                              <span className="text-[10px] text-slate-400">Choose any state</span>
                            </div>
                            <div className="space-y-1 pt-1 max-h-[220px] overflow-y-auto">
                              {PHASES.filter(p => !['pending', 'client-request-approved'].includes(p.value)).map((phase) => {
                                const isCurrent = phase.value === currentPhase;
                                return (
                                  <button
                                    key={phase.value}
                                    type="button"
                                    disabled={busy || isCurrent}
                                    onClick={() => handleSetPhase(load, phase.value as DriverPhase)}
                                    className={`w-full flex items-center justify-between py-1.5 px-2.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                      isCurrent ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <span>{phase.label}</span>
                                    {isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Multi-Stop Legs Sequence (if multiple stops) */}
                          {(() => {
                            const remainingLegs = buildDriverProgressLegs(load, loads, driverProfile);
                            if (remainingLegs.length <= 1) return null;
                            return (
                              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs space-y-1.5">
                                <div className="font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                                  <Navigation2 className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Route Sequence ({remainingLegs.length} stops remaining):</span>
                                </div>
                                {remainingLegs.map((leg, idx) => (
                                  <div key={`${leg.type}-${idx}`} className="flex items-center gap-2 text-slate-700 text-[11px]">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${
                                      leg.isDeadhead ? 'bg-purple-600 text-white' : idx === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-800'
                                    }`}>
                                      {leg.isDeadhead ? 'DEADHEAD' : idx === 0 ? 'NEXT' : `STOP ${idx + 1}`}
                                    </span>
                                    <span className="truncate">{leg.location}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Logged in-transit expenses */}
                          {load.actualExpenses && load.actualExpenses.length > 0 && (
                            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                              <div className="flex items-center justify-between font-bold text-amber-950">
                                <span className="flex items-center gap-1.5">
                                  <Receipt className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Logged Expenses ({load.actualExpenses.length})</span>
                                </span>
                                <span>${load.actualExpenses.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2)}</span>
                              </div>
                              <div className="space-y-1">
                                {load.actualExpenses.map((exp, expIdx) => (
                                  <div key={exp.id || expIdx} className="bg-white p-2 rounded-lg border border-amber-100 flex items-center justify-between text-[11px]">
                                    <span className="font-medium text-slate-800">{exp.category}</span>
                                    <span className="font-bold text-slate-900">${exp.amount.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* ── Completed Deliveries & POD Paperwork (Collapsible & Compact) ── */}
        {completedToday.length > 0 && (() => {
          const pendingPodList = completedToday.filter(l => !isPaperworkClosedOut(l));
          const verifiedList   = completedToday.filter(l => isPaperworkClosedOut(l));
          const hasPendingPod  = pendingPodList.length > 0;

          return (
            <div className="space-y-3 pt-2">
              <div 
                onClick={() => setIsCompletedOpen(!isCompletedOpen)}
                className="flex items-center justify-between px-1 py-1 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Completed Deliveries ({completedToday.length})
                  </h3>
                  {hasPendingPod && (
                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-black">
                      ⚠️ {pendingPodList.length} Need Signed BOL
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                >
                  <span>{isCompletedOpen ? 'Collapse' : 'Show All'}</span>
                  {isCompletedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Always show any load awaiting POD paperwork right away, even if the verified section is collapsed */}
              {hasPendingPod && !isCompletedOpen && (
                <div className="space-y-2">
                  {pendingPodList.map((cLoad) => (
                    <Card key={cLoad.id} className="border-2 border-amber-300 bg-amber-50/50 rounded-xl overflow-hidden shadow-xs">
                      <CardContent className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-xs text-slate-900">
                                Load #{cLoad.loadNumber || cLoad.id?.substring(0, 8)}
                              </span>
                              <Badge className="bg-amber-500 text-slate-950 text-[10px] font-black">
                                Awaiting Signed BOL
                              </Badge>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 font-medium">
                              {cLoad.origin?.city} → {cLoad.destination?.city}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => setSelectedLoadForEpod(cLoad)}
                            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                          >
                            <PenLine className="w-3.5 h-3.5 mr-1" />
                            Sign BOL
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Full expanded list */}
              {isCompletedOpen && (
                <div className="space-y-2.5">
                  {/* First render pending POD items */}
                  {pendingPodList.map((cLoad) => (
                    <Card key={cLoad.id} className="border-2 border-amber-300 bg-amber-50/50 rounded-xl overflow-hidden shadow-xs">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-slate-900">
                                Load #{cLoad.loadNumber || cLoad.id?.substring(0, 8)}
                              </span>
                              <Badge className="bg-amber-500 text-slate-950 text-[10px] font-black">
                                Awaiting Signed BOL
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                              {cLoad.origin?.city || 'Origin'} → {cLoad.destination?.city || 'Destination'}
                            </p>
                            {cLoad.deliveredAt && (
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Delivered at {new Date(cLoad.deliveredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-amber-200/80 space-y-2">
                          <Button
                            type="button"
                            className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                            onClick={() => setSelectedLoadForEpod(cLoad)}
                          >
                            <PenLine className="w-4 h-4 mr-1" />
                            <span>Complete Bill of Lading (Sign on Glass)</span>
                          </Button>
                          <SignedBolUpload load={cLoad} updateLoad={updateLoad} compact={false} label="Upload Signed Paper BOL (POD)" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Then verified completed items in a sleek compact list */}
                  {verifiedList.map((cLoad) => (
                    <div 
                      key={cLoad.id} 
                      className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 truncate">
                            Load #{cLoad.loadNumber || cLoad.id?.substring(0, 8)}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 truncate font-medium">
                            {cLoad.origin?.city} → {cLoad.destination?.city}
                          </span>
                        </div>
                        {cLoad.deliveredAt && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Delivered {new Date(cLoad.deliveredAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(cLoad.deliveredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {cLoad.signedBolUrl && (
                          <a
                            href={cLoad.signedBolUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors shadow-xs"
                            title="View signed BOL / POD"
                          >
                            <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>View POD</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Sign Out ─────────────────────────────────────────────── */}
        <div className="pt-4 pb-12">
          <Button
            variant="ghost"
            className="w-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl h-12"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {selectedLoadForEpod && (
        <EpodModal
          load={selectedLoadForEpod}
          isOpen={true}
          onClose={() => setSelectedLoadForEpod(null)}
        />
      )}

      {isExpenseModalOpen && (
        <LogExpenseModal
          load={expenseModalLoad}
          driverId={driverProfile?.uid || user?.uid || ''}
          truckId={driverProfile?.assignedTruckId ?? null}
          trailerId={driverProfile?.assignedTrailerId ?? null}
          isOpen={isExpenseModalOpen}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setExpenseModalLoad(null);
          }}
        />
      )}

      {/* ── Active BOL Viewer Dialog (Digital Copy for Receiver) ── */}
      <Dialog 
        open={Boolean(activeBolSelectedLoad)} 
        onOpenChange={(open) => {
          if (!open) {
            setActiveBolSelectedLoad(null);
            setActiveBolModalUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl w-[95vw] h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="pb-2 border-b">
            <div className="flex items-center justify-between pr-4">
              <DialogTitle className="text-base sm:text-lg flex items-center gap-2 text-indigo-900 font-bold">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>{activeBolModalTitle}</span>
              </DialogTitle>
              <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-xs">
                {activeBolSelectedLoad?.bolSource === 'broker' ? 'Broker BOL' : 'Active Shipping Manifest'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 pt-1">
              Official outbound transit documentation. Present this to the receiver or facility gatekeeper upon arrival.
            </p>
          </DialogHeader>

          <div className="flex-1 w-full h-full min-h-[300px] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 my-2 flex items-center justify-center">
            {activeBolModalUrl ? (
              <iframe
                src={activeBolModalUrl}
                title="Active Bill of Lading"
                className="w-full h-full border-none"
              />
            ) : (
              <div className="text-center p-8 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm mb-1">
                  No Broker BOL attached to this load
                </h4>
                <p className="text-xs text-slate-500">
                  {activeBolSelectedLoad?.loadNumber ? `Load #${activeBolSelectedLoad.loadNumber}` : 'This load'} does not have a broker-provided document uploaded yet. Please contact dispatch or verify documentation.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t flex flex-row items-center justify-between sm:justify-end gap-2">
            {activeBolModalUrl && (
              <a
                href={activeBolModalUrl}
                download="Active_Bill_of_Lading.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Download / Fullscreen
              </a>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveBolSelectedLoad(null);
                setActiveBolModalUrl(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Decline Load Confirmation Modal ── */}
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
            <DialogTitle className="text-base font-bold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Decline Assigned Load #{declineModalLoad?.loadNumber || declineModalLoad?.id?.substring(0, 8)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-slate-600">
            <p>
              Declining this load removes it from your active dispatches and notifies your dispatcher.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Reason for Declining (Optional)</Label>
              <Textarea
                rows={3}
                placeholder="e.g., Out of HOS hours, equipment maintenance issue, schedule conflict..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="text-xs"
              />
            </div>
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
              disabled={Boolean(declineModalLoad?.id && isProcessingAcceptDecline === declineModalLoad.id)}
              onClick={handleConfirmDeclineLoad}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
            >
              {declineModalLoad?.id && isProcessingAcceptDecline === declineModalLoad.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : null}
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Driver's Own Profile Modal (Scoped Strictly to This Driver) ── */}
      <Dialog open={isMyProfileOpen} onOpenChange={setIsMyProfileOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              My Driver Profile
            </DialogTitle>
            <p className="text-xs text-slate-500">
              Your personal driver record, compliance credentials, and assigned equipment.
            </p>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {/* Personal & Contact */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                Personal &amp; Contact Details
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500">Full Name:</span>
                <span className="font-bold text-slate-900">{driverProfile.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="font-semibold text-slate-800">{driverProfile.phone || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email / Login:</span>
                <span className="font-semibold text-slate-800">
                  {driverProfile.email || driverProfile.loginEmail || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duty Status:</span>
                <Badge variant="outline" className="text-[10px] font-bold capitalize">
                  {driverProfile.status || 'active'}
                </Badge>
              </div>
            </div>

            {/* Licensing & DOT Compliance */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                License &amp; DOT Compliance
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500">License Classification:</span>
                <span className="font-bold text-slate-900">{driverProfile.cdlStatus || 'Non-CDL'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">License Number:</span>
                <span className="font-semibold text-slate-800">
                  {driverProfile.cdlNumber || driverProfile.idNumber || 'Not entered'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">License Issuing State:</span>
                <span className="font-semibold text-slate-800">
                  {driverProfile.licenseIssuingState || 'Not entered'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">License Expiration:</span>
                <span className="font-semibold text-slate-800">
                  {driverProfile.cdlExpirationDate || 'Not entered'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DOT Medical Card Expiration:</span>
                <span className="font-semibold text-slate-800">
                  {driverProfile.medicalCardExpirationDate || 'Not entered'}
                </span>
              </div>
              {((driverProfile.endorsements && driverProfile.endorsements.length > 0) ||
                driverProfile.additionalEndorsements) && (
                <div className="pt-1.5 border-t border-slate-200 space-y-1">
                  <span className="text-slate-500 block">Endorsements &amp; Qualifications:</span>
                  <div className="flex flex-wrap gap-1">
                    {(driverProfile.endorsements || []).map((end) => (
                      <Badge
                        key={end}
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold"
                      >
                        {end}
                      </Badge>
                    ))}
                    {driverProfile.additionalEndorsements && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-slate-200 text-slate-800 font-medium"
                      >
                        {driverProfile.additionalEndorsements}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Assigned Equipment */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                Assigned Equipment &amp; HOS
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Truck:</span>
                <span className="font-semibold text-slate-800">
                  {assignedTruck ? `#${assignedTruck.unitNumber} ${assignedTruck.name || ''}` : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Trailer:</span>
                <span className="font-semibold text-slate-800">
                  {assignedTrailer ? `#${assignedTrailer.unitNumber} ${assignedTrailer.name || ''}` : 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estimated Drive HOS Remaining:</span>
                <span className="font-bold text-blue-700">
                  {(driverProfile.estimatedHosRemaining ?? 11.0).toFixed(1)} hrs
                </span>
              </div>
            </div>

            {/* Uploaded Compliance Documents */}
            {(driverProfile.licenseFrontUrl || driverProfile.licenseBackUrl || driverProfile.medicalCardUrl) && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                  Uploaded Compliance Photos
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'License Front', url: driverProfile.licenseFrontUrl },
                    { label: 'License Back', url: driverProfile.licenseBackUrl },
                    { label: 'Medical Card', url: driverProfile.medicalCardUrl },
                  ].map((docItem) => (
                    <div
                      key={docItem.label}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-center space-y-1"
                    >
                      <span className="text-[10px] font-bold text-slate-700 block truncate">
                        {docItem.label}
                      </span>
                      {docItem.url ? (
                        <a
                          href={docItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-blue-600 hover:underline block"
                        >
                          View Document
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400 block">Not uploaded</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Contact & Address */}
            {(driverProfile.emergencyContactName || driverProfile.homeAddress || driverProfile.homeCity) && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                  Emergency Contact &amp; Address
                </p>
                {driverProfile.emergencyContactName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Emergency Contact:</span>
                    <span className="font-semibold text-slate-800">
                      {driverProfile.emergencyContactName}{' '}
                      {driverProfile.emergencyContactPhone ? `(${driverProfile.emergencyContactPhone})` : ''}
                    </span>
                  </div>
                )}
                {(driverProfile.homeAddress || driverProfile.homeCity) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Address:</span>
                    <span className="font-semibold text-slate-800 text-right">
                      {[
                        driverProfile.homeAddress,
                        driverProfile.homeCity,
                        driverProfile.homeState,
                        driverProfile.homeZip,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setIsMyProfileOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
