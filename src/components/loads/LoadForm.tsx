import React, { useMemo } from 'react';
import { type Load, type Client, type Trip, type Vehicle, type DriverProfile, isDriverOffDuty } from '@/types';
import { calculateTripMetrics, computeCargoLinearFootprint } from '@/lib/logisticsEngine';
import { getDriverProfileId } from '@/lib/driverAssignment';
import { vehicleToEngineTruck, vehicleToEngineTrailer, loadToCargoItem } from '@/lib/logisticsAdapters';
import { calculateHOSTransit } from '@/lib/hosEngine';
import { computeCompliance } from '@/lib/complianceEngine';
import { HOSWarningBanner } from './HOSWarningBanner';
import { HOSPlanningPanel } from './HOSPlanningPanel';
import { ComplianceBadges } from './ComplianceBadges';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MapPin, DollarSign, Milestone, Package as CargoIcon, CalendarClock, Timer, Edit, Save, XCircle, Ruler, Weight, ShieldCheck, Hash, RotateCcw, TrendingUp, Zap, ShieldAlert, ShieldX, AlertTriangle, Navigation, Loader2, Sliders, CheckCircle2, Lock, FileText, Trash2, Upload, FileCheck, ExternalLink, Sparkles, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { uploadOutboundBolDocument } from '@/lib/storage';
import { compileInternalOutboundBolPdf } from '@/lib/loadPacket';
import { differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CDL_THRESHOLD = 26_000; // lbs — 49 CFR § 383.91

const emptyAddress = { street: '', city: '', state: '', zip: '', contactName: '', contactPhone: '' };
const blankLoadForm = {
  clientId: '', origin: emptyAddress, destination: emptyAddress,
  pickupDateTime: '', deliveryDateTime: '',
  ratePerMile: 0, distance: 0, deadheadMiles: 0, status: 'pending' as const,
  cargoDescription: '', specialTerms: '', requiresTarping: false, tarpingFee: 0,
  tripDuration: undefined, assignedTruckId: '', assignedTrailerId: '', assignedDriverId: '',
  cargoQuantity: 1,
  bolSource: 'broker' as const,
};

import { AddressFields } from '../common/AddressFields';
import { DispatcherDateTimePicker } from '../common/DispatcherDateTimePicker';
import { calculateRoadDistance, calculateRoadDistanceWithCoords } from '@/lib/googleMaps';
import { geocodePhysicalAddress } from '@/lib/geocoding';
import { generateGoogleMapsUrl, buildChronologicalTripGoogleMapsUrl } from '@/lib/routeUtils';
import { formatPhoneNumber } from '@/lib/utils';
import type { Address } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type LoadFormProps = {
  loadForm: Partial<Load>;
  setLoadForm: React.Dispatch<React.SetStateAction<Partial<Load>>>;
  clients: Client[];
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit?: () => void;
  onDeclineClientRequest?: (requestId: string, reason?: string) => void;
  isSubmitting?: boolean;
  editingLoadId: string | null;
  trips: Trip[];
  vehicles: Vehicle[];
  driverProfiles: DriverProfile[];
  loads?: Load[];
  settings?: import('@/types').Settings;
  calculateVehicleCPM?: (vehicleId: string) => number;
  isClientsLoading?: boolean;
  clientLoadRequests?: import('@/types').ClientLoadRequest[];
};


const ALL_SECTIONS = ['section-locations', 'section-schedule', 'section-cargo', 'section-pricing', 'section-fleet', 'section-notes', 'section-bol'];
const DEFAULT_OPEN_SECTIONS = ['section-locations', 'section-cargo', 'section-pricing'];

const SECTION_NAV_ITEMS = [
  { id: 'section-locations', num: 1, label: 'Locations' },
  { id: 'section-schedule',  num: 2, label: 'Schedule' },
  { id: 'section-cargo',     num: 3, label: 'Cargo' },
  { id: 'section-pricing',   num: 4, label: 'Pricing' },
  { id: 'section-fleet',     num: 5, label: 'Fleet' },
  { id: 'section-notes',     num: 6, label: 'Notes' },
  { id: 'section-bol',       num: 7, label: 'Documents' },
];

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
      {n}
    </span>
  );
}

export function LoadForm({
  loadForm, setLoadForm, clients, trips, vehicles, driverProfiles, loads,
  onSubmit, onCancelEdit, onDeclineClientRequest, isSubmitting, editingLoadId,
  settings, calculateVehicleCPM, isClientsLoading, clientLoadRequests,
}: LoadFormProps) {
  const { toast } = useToast();
  const { 
    clients: appClients, 
    isClientsLoading: appIsClientsLoading, 
    clientLoadRequests: appClientLoadRequests,
    loads: appLoads,
    settings: appSettings,
    financialProfile,
    isFinancialProfileComplete,
    setIsFleetFinancialModalOpen,
    handleDeleteTrip,
  } = useApp();

  const effectiveSettings = settings || appSettings;
  const [tripToDelete, setTripToDelete] = React.useState<Trip | null>(null);
  const [isDeletingTrip, setIsDeletingTrip] = React.useState(false);
  const [isUploadingOutboundBol, setIsUploadingOutboundBol] = React.useState(false);
  const [isGeneratingOutboundBol, setIsGeneratingOutboundBol] = React.useState(false);
  const [openSections, setOpenSections] = React.useState<string[]>(DEFAULT_OPEN_SECTIONS);
  // True while the user has chosen "Add to Existing Trip" but not yet picked a specific trip.
  const [existingTripPicked, setExistingTripPicked] = React.useState(false);
  React.useEffect(() => {
    const t = loadForm.tripId ?? 'none';
    if (t !== 'none' && t !== '') setExistingTripPicked(false);
  }, [loadForm.tripId]);
  React.useEffect(() => { setExistingTripPicked(false); }, [editingLoadId]);
  const outboundFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleOutboundFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingOutboundBol(true);
      const tempId = editingLoadId || `draft_${Date.now()}`;
      const downloadUrl = await uploadOutboundBolDocument(tempId, file);
      setLoadForm(prev => ({
        ...prev,
        bolSource: 'broker',
        outboundBolUrl: downloadUrl,
        outboundBolFileName: file.name,
        outboundBolGeneratedAt: new Date().toISOString(),
      }));
      toast({
        title: "External BOL Attached",
        description: `Successfully uploaded broker document: ${file.name}`,
      });
    } catch (err: any) {
      console.error("Outbound BOL upload failed:", err);
      toast({
        title: "Upload Failed",
        description: err?.message || "Could not upload broker BOL document.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingOutboundBol(false);
      if (outboundFileInputRef.current) outboundFileInputRef.current.value = '';
    }
  };

  const handleGenerateInternalOutboundBol = async () => {
    try {
      setIsGeneratingOutboundBol(true);
      const pdfBlob = await compileInternalOutboundBolPdf({
        load: loadForm,
        carrierName: effectiveSettings?.carrierName || 'PayloadLogic Fleet',
        carrierDot: effectiveSettings?.carrierDotNumber,
        carrierMc: effectiveSettings?.carrierMcNumber,
        carrierAddress: effectiveSettings?.carrierAddress,
        carrierPhone: effectiveSettings?.carrierContactPhone,
        carrierEmail: effectiveSettings?.carrierContactEmail,
      });

      const tempId = editingLoadId || `draft_${Date.now()}`;
      const loadRef = loadForm.loadNumber || (editingLoadId ? editingLoadId.substring(0, 8) : Date.now().toString().slice(-6));
      const fileName = `Internal_BOL_${loadRef}.pdf`;
      const downloadUrl = await uploadOutboundBolDocument(tempId, pdfBlob, fileName);

      setLoadForm(prev => ({
        ...prev,
        bolSource: 'system',
        outboundBolUrl: downloadUrl,
        outboundBolFileName: fileName,
        outboundBolGeneratedAt: new Date().toISOString(),
      }));

      toast({
        title: "Internal BOL Generated",
        description: "Official outbound shipping BOL created with freight specs.",
      });
    } catch (err: any) {
      console.error("Error generating internal BOL:", err);
      toast({
        title: "Generation Failed",
        description: err?.message || "Could not generate internal BOL.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOutboundBol(false);
    }
  };

  const effectiveLoads = (appLoads && appLoads.length > 0) ? appLoads : (loads || []);
  const effectiveClients = (appClients && appClients.length > 0) ? appClients : (clients || []);
  const effectiveIsClientsLoading = appIsClientsLoading !== undefined ? appIsClientsLoading : (isClientsLoading ?? false);
  const effectiveClientLoadRequests = (appClientLoadRequests && appClientLoadRequests.length > 0) ? appClientLoadRequests : (clientLoadRequests || []);

  // Alphabetically sorted client facilities ascending (A-Z) using localeCompare
  const sortedClients = React.useMemo(() => {
    return [...effectiveClients]
      .filter(c => Boolean(c.id))
      .sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '', undefined, { sensitivity: 'base' }));
  }, [effectiveClients]);

  const pendingRequestId = loadForm.originalClientRequestId ? String(loadForm.originalClientRequestId).trim() : '';
  const cleanReqId = pendingRequestId.replace(/^#/, '');
  const matchingReq = pendingRequestId 
    ? effectiveClientLoadRequests.find(r => r.id === pendingRequestId || r.id === cleanReqId || String(r.id).replace(/^#/, '') === cleanReqId)
    : undefined;

  // Auto-calculate trip duration when dates or mileage change
  React.useEffect(() => {
    if (loadForm.pickupDateTime && loadForm.deliveryDateTime) {
      const pickupDate = new Date(loadForm.pickupDateTime);
      const deliveryDate = new Date(loadForm.deliveryDateTime);
      if (!isNaN(pickupDate.getTime()) && !isNaN(deliveryDate.getTime())) {
        const diffMs = deliveryDate.getTime() - pickupDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        const rawDays = diffHours / 24;
        
        let calculatedDays = rawDays;
        if (diffHours > 12) {
          calculatedDays = Math.ceil(rawDays);
        }
        
        const operationalDays = Math.max(1, calculatedDays);
        setLoadForm(prev => ({ ...prev, tripDuration: parseFloat(operationalDays.toFixed(1)) }));
        return;
      }
    }

    const totalMiles = (loadForm.distance || 0) + (loadForm.deadheadMiles || 0);
    if (totalMiles > 0) {
      const calculatedDays = Math.ceil(totalMiles / 500);
      setLoadForm(prev => ({ ...prev, tripDuration: calculatedDays }));
    }
  }, [loadForm.distance, loadForm.deadheadMiles, loadForm.pickupDateTime, loadForm.deliveryDateTime, setLoadForm]);

  // ── HOS transit feasibility — derived, no state needed ──────────────────────
  const effectiveDeadheadMiles = (loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none') || (loadForm.assignedTruckId && loadForm.assignedTruckId !== 'none')
    ? (loadForm.deadheadMiles || 0)
    : 0;

  const hosResult = React.useMemo(
    () =>
      calculateHOSTransit(
        loadForm.distance     || 0,
        effectiveDeadheadMiles,
        loadForm.pickupDateTime  || '',
        loadForm.deliveryDateTime || '',
      ),
    [loadForm.distance, effectiveDeadheadMiles, loadForm.pickupDateTime, loadForm.deliveryDateTime],
  );

  const [lastCalculatedRoute, setLastCalculatedRoute] = React.useState('');
  const [lastCalculatedDriver, setLastCalculatedDriver] = React.useState('');
  const [isCalculatingRoute, setIsCalculatingRoute] = React.useState(false);
  const [isDeclineDialogOpen, setIsDeclineDialogOpen] = React.useState(false);
  const [selectedDeclineCategory, setSelectedDeclineCategory] = React.useState('Insufficient profit / Rate too low');
  const [customDeclineNote, setCustomDeclineNote] = React.useState('');
  const [destinationClientId, setDestinationClientId] = React.useState<string>('');
  const [showAdvancedLocations, setShowAdvancedLocations] = React.useState(false);
  const [showAdvancedCargo, setShowAdvancedCargo] = React.useState(false);
  const [showAdvancedPricing, setShowAdvancedPricing] = React.useState(false);

  const jumpToSection = (sectionId: string) => {
    setOpenSections(prev => prev.includes(sectionId) ? prev : [...prev, sectionId]);
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  // Format address helper - strict full address string construction
  const getFormattedAddressStr = React.useCallback((addr?: Address) => {
    if (!addr) return '';
    const street = addr.street?.trim() || '';
    const city = addr.city?.trim() || '';
    const state = addr.state?.trim() || '';
    const zip = addr.zip?.trim() || '';
    
    // Construct strict full address: ${street}, ${city}, ${state} ${zip}
    const parts: string[] = [];
    if (street) parts.push(street);
    if (city) parts.push(city);
    if (state || zip) parts.push([state, zip].filter(Boolean).join(' '));
    return parts.join(', ').trim();
  }, []);

  // Helper to resolve assigned driver/truck location for Deadhead calculation.
  // Strictly pulls the selected driver's current location from their live database profile or GPS coordinates.
  // Never uses carrier headquarters address or stale cached route data.
  const getDriverOrTruckLocation = React.useCallback(() => {
    let driverId = loadForm.assignedDriverId;
    if ((!driverId || driverId === 'none') && loadForm.assignedTruckId && loadForm.assignedTruckId !== 'none') {
      const truck = vehicles.find(v => v.id === loadForm.assignedTruckId);
      if (truck?.assignedDriverId) {
        driverId = truck.assignedDriverId;
      }
    }

    if (driverId && driverId !== 'none') {
      const driver = driverProfiles.find(d => d.uid === driverId || d.id === driverId);

      // 1. Current staging location from driver database profile
      if (driver?.currentStaging && driver.currentStaging.trim()) {
        return driver.currentStaging.trim();
      }

      // 2. Live location from driver database profile (lastLocationCity & lastLocationState)
      if (driver?.lastLocationCity && driver?.lastLocationState) {
        return `${driver.lastLocationCity.trim()}, ${driver.lastLocationState.trim()}`;
      }

      // 2. Live GPS coordinates from driver database profile
      if (driver?.currentLat && driver?.currentLng) {
        return `${driver.currentLat},${driver.currentLng}`;
      }

      // 3. Fallback to destination of most recently completed load
      const completedLoads = effectiveLoads
        .filter(l => l.id !== editingLoadId && (l.assignedDriverId === driverId || (l as any).driverId === driverId) && (['delivered', 'completed'].includes(String(l.status || '').toLowerCase())))
        .sort((a, b) => new Date(b.deliveryDateTime || (b as any).lastCompletionTimestamp || 0).getTime() - new Date(a.deliveryDateTime || (a as any).lastCompletionTimestamp || 0).getTime());

      if (completedLoads.length > 0 && completedLoads[0].destination) {
        const destStr = getFormattedAddressStr(completedLoads[0].destination);
        if (destStr) return destStr;
      }
    }

    // Driver location is unknown — do not fall back to carrier headquarters.
    return '';
  }, [loadForm.assignedDriverId, loadForm.assignedTruckId, vehicles, driverProfiles, effectiveLoads, editingLoadId, getFormattedAddressStr]);

  // Calculate route distance and deadhead distance
  const handleCalculateRouteAndMileage = async () => {
    // Directly read DOM values to ensure no lag from Autocomplete/programmatic fills
    const getDomAddress = (prefix: string, fallback?: Address): Address => {
      if (typeof document === 'undefined') return fallback || { street: '', city: '', state: '', zip: '' };
      const streetEl = (document.getElementById(`${prefix}-street`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-street"]`)) as HTMLInputElement | null;
      const cityEl = (document.getElementById(`${prefix}-city`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-city"]`)) as HTMLInputElement | null;
      const stateEl = (document.getElementById(`${prefix}-state`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-state"]`)) as HTMLInputElement | null;
      const zipEl = (document.getElementById(`${prefix}-zip`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-zip"]`)) as HTMLInputElement | null;

      return {
        street: streetEl?.value?.trim() ?? fallback?.street ?? '',
        city: cityEl?.value?.trim() ?? fallback?.city ?? '',
        state: stateEl?.value?.trim() ?? fallback?.state ?? '',
        zip: zipEl?.value?.trim() ?? fallback?.zip ?? '',
        companyName: fallback?.companyName,
        contactName: fallback?.contactName,
        contactPhone: fallback?.contactPhone,
      };
    };

    const oDom = getDomAddress('origin', loadForm.origin as Address);
    const dDom = getDomAddress('destination', loadForm.destination as Address);

    const exactOrigin = getFormattedAddressStr(oDom);
    const exactDestination = getFormattedAddressStr(dDom);

    if (!exactOrigin || !exactDestination || !oDom.city || !dDom.city) {
      toast({
        variant: "destructive",
        title: "Incomplete Address",
        description: "Please enter at least City and State for both Origin and Destination."
      });
      return;
    }

    setIsCalculatingRoute(true);
    try {
      // 1. Calculate loaded miles and coordinates via Google Maps / Routes API / physical geocoder
      const distanceResult = await calculateRoadDistanceWithCoords(exactOrigin, exactDestination);
      const loadedMilesVal = distanceResult.miles;
      if (loadedMilesVal <= 0) {
        throw new Error("Could not calculate driving distance between origin and destination.");
      }

      let resolvedOrigCoords = distanceResult.originCoords;
      let resolvedDestCoords = distanceResult.destinationCoords;

      if (!resolvedOrigCoords) {
        resolvedOrigCoords = await geocodePhysicalAddress(exactOrigin) || undefined;
      }
      if (!resolvedDestCoords) {
        resolvedDestCoords = await geocodePhysicalAddress(exactDestination) || undefined;
      }

      // Sync route key to prevent race conditions with auto-calculation effects
      const routeKey = `${exactOrigin}|${exactDestination}`;
      setLastCalculatedRoute(routeKey);

      // Single atomic update to state: write Loaded Miles and exact physical coordinates
      setLoadForm(prev => ({
        ...prev,
        origin: {
          ...(prev.origin || {}),
          ...oDom,
          ...(resolvedOrigCoords ? { lat: resolvedOrigCoords.lat, lng: resolvedOrigCoords.lng } : {})
        } as Address,
        destination: {
          ...(prev.destination || {}),
          ...dDom,
          ...(resolvedDestCoords ? { lat: resolvedDestCoords.lat, lng: resolvedDestCoords.lng } : {})
        } as Address,
        originLat: resolvedOrigCoords?.lat ?? (prev as any).originLat,
        originLng: resolvedOrigCoords?.lng ?? (prev as any).originLng,
        destinationLat: resolvedDestCoords?.lat ?? (prev as any).destinationLat,
        destinationLng: resolvedDestCoords?.lng ?? (prev as any).destinationLng,
        distance: loadedMilesVal,
      }));

      toast({
        title: "Route & Mileage Calculated",
        description: `Loaded Miles: ${loadedMilesVal} mi` + (
          loadForm.deadheadMiles ? ` | Deadhead: ${loadForm.deadheadMiles} mi` : ''
        )
      });
    } catch (err: any) {
      console.error("Route calculation error:", err);
      toast({
        variant: "destructive",
        title: "Calculation Failed",
        description: err?.message || "Could not calculate driving distance. Please check your addresses."
      });
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Open Google Maps directions in a new tab
  const handleViewRouteOnMap = () => {
    const getDomAddress = (prefix: string, fallback?: Address): Address => {
      if (typeof document === 'undefined') return fallback || { street: '', city: '', state: '', zip: '' };
      const streetEl = (document.getElementById(`${prefix}-street`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-street"]`)) as HTMLInputElement | null;
      const cityEl = (document.getElementById(`${prefix}-city`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-city"]`)) as HTMLInputElement | null;
      const stateEl = (document.getElementById(`${prefix}-state`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-state"]`)) as HTMLInputElement | null;
      const zipEl = (document.getElementById(`${prefix}-zip`) || document.querySelector<HTMLInputElement>(`input[name="${prefix}-zip"]`)) as HTMLInputElement | null;

      return {
        street: streetEl?.value?.trim() ?? fallback?.street ?? '',
        city: cityEl?.value?.trim() ?? fallback?.city ?? '',
        state: stateEl?.value?.trim() ?? fallback?.state ?? '',
        zip: zipEl?.value?.trim() ?? fallback?.zip ?? '',
      };
    };

    const oDom = getDomAddress('origin', loadForm.origin as Address);
    const dDom = getDomAddress('destination', loadForm.destination as Address);
    const oStr = getFormattedAddressStr(oDom);
    const dStr = getFormattedAddressStr(dDom);
    const driverLoc = getDriverOrTruckLocation();

    // Check if this load is part of a consolidated trip container
    if (loadForm.tripId && loadForm.tripId !== 'none') {
      const containerLoads = effectiveLoads.filter(
        l => l.tripId === loadForm.tripId && l.id !== loadForm.id && l.status !== 'delivered'
      );

      // Create a transient load representation of the current form
      const currentFormLoad: Load = {
        id: loadForm.id || 'temp-current-load',
        clientId: loadForm.clientId || '',
        origin: oDom,
        destination: dDom,
        pickupDateTime: loadForm.pickupDateTime || new Date().toISOString(),
        deliveryDateTime: loadForm.deliveryDateTime || new Date().toISOString(),
        cargoDescription: loadForm.cargoDescription || 'Cargo',
        loadNumber: loadForm.loadNumber,
        status: loadForm.status || 'pending',
        ratePerMile: loadForm.ratePerMile || 0,
        distance: loadForm.distance || 0,
        tripId: loadForm.tripId,
      } as Load;

      const combinedLoads = [...containerLoads, currentFormLoad];
      const tripMapUrl = buildChronologicalTripGoogleMapsUrl(combinedLoads, driverLoc || undefined);
      if (tripMapUrl && tripMapUrl !== 'https://maps.google.com') {
        window.open(tripMapUrl, '_blank');
        return;
      }
    }

    if (driverLoc && oStr && dStr && driverLoc.toLowerCase().trim() !== oStr.toLowerCase().trim()) {
      // Single load with driver starting point: sequence [Driver's Last Known Location] -> [Active Load Origin] -> [Active Load Destination]
      const currentLoad: Load = {
        id: loadForm.id || 'temp-load',
        clientId: loadForm.clientId || '',
        origin: oDom,
        destination: dDom,
        pickupDateTime: loadForm.pickupDateTime || new Date().toISOString(),
        deliveryDateTime: loadForm.deliveryDateTime || new Date().toISOString(),
        loadNumber: loadForm.loadNumber,
        status: loadForm.status || 'pending',
      } as Load;
      const url = buildChronologicalTripGoogleMapsUrl([currentLoad], driverLoc);
      window.open(url, '_blank');
    } else if (oStr && dStr && oDom?.city && dDom?.city) {
      const currentLoad: Load = {
        id: loadForm.id || 'temp-load',
        clientId: loadForm.clientId || '',
        origin: oDom,
        destination: dDom,
        pickupDateTime: loadForm.pickupDateTime || new Date().toISOString(),
        deliveryDateTime: loadForm.deliveryDateTime || new Date().toISOString(),
        loadNumber: loadForm.loadNumber,
        status: loadForm.status || 'pending',
      } as Load;
      const url = buildChronologicalTripGoogleMapsUrl([currentLoad]);
      window.open(url, '_blank');
    } else {
      toast({
        variant: "destructive",
        title: "Incomplete Address",
        description: "Please enter both origin and destination addresses to view route on map."
      });
    }
  };

  React.useEffect(() => {
    const o = loadForm.origin as Address;
    const d = loadForm.destination as Address;
    if (!o?.city || !o?.state || !d?.city || !d?.state) return;
    
    const oStr = getFormattedAddressStr(o);
    const dStr = getFormattedAddressStr(d);
    const routeKey = `${oStr}|${dStr}`;

    if (routeKey !== lastCalculatedRoute) {
      setLastCalculatedRoute(routeKey);
      calculateRoadDistanceWithCoords(oStr, dStr)
        .then(async res => {
          if (res.miles > 0) {
            let oCoords = res.originCoords;
            let dCoords = res.destinationCoords;
            if (!oCoords) oCoords = await geocodePhysicalAddress(oStr) || undefined;
            if (!dCoords) dCoords = await geocodePhysicalAddress(dStr) || undefined;

            setLoadForm(prev => ({
              ...prev,
              distance: res.miles,
              origin: {
                ...(prev.origin || {}),
                ...(oCoords ? { lat: oCoords.lat, lng: oCoords.lng } : {})
              } as Address,
              destination: {
                ...(prev.destination || {}),
                ...(dCoords ? { lat: dCoords.lat, lng: dCoords.lng } : {})
              } as Address,
              originLat: oCoords?.lat ?? (prev as any).originLat,
              originLng: oCoords?.lng ?? (prev as any).originLng,
              destinationLat: dCoords?.lat ?? (prev as any).destinationLat,
              destinationLng: dCoords?.lng ?? (prev as any).destinationLng,
            }));
            toast({ title: 'Route Calculated', description: `Loaded miles auto-calculated: ${res.miles} mi` });
          }
        }).catch(err => {
          console.warn('Auto distance fetch skipped or failed:', err?.message || err);
        });
    }
  }, [loadForm.origin, loadForm.destination, lastCalculatedRoute, setLoadForm, toast, getFormattedAddressStr]);

  React.useEffect(() => {
    const o = loadForm.origin as Address;
    const isUnassigned = (!loadForm.assignedDriverId || loadForm.assignedDriverId === 'none') &&
                         (!loadForm.assignedTruckId  || loadForm.assignedTruckId  === 'none');

    // When no driver/truck is assigned, stop auto-calculating deadhead entirely.
    // We intentionally do NOT reset the field here — the admin may have typed a value manually.
    if (isUnassigned) return;

    const driverLoc = getDriverOrTruckLocation();
    if (!o?.city || !o?.state || !driverLoc) return;

    const oStr = getFormattedAddressStr(o);
    const key = `${driverLoc}|${oStr}`;

    const oCity = (o.city || '').toLowerCase().trim();
    const oState = (o.state || '').toLowerCase().trim();
    const driverCityState = driverLoc.toLowerCase().trim();

    // 3. The City-Match Bypass: If driver's currentLocation contains the exact same City and State,
    // automatically set Deadhead Miles to 0 and bypass the API call entirely.
    const hasCityMatch = oCity && (driverCityState.includes(oCity) || (driverCityState.split(',')[0] || '').trim() === oCity);
    const hasStateMatch = !oState || driverCityState.includes(oState);

    if (hasCityMatch && hasStateMatch) {
      setLastCalculatedDriver(key);
      setLoadForm(prev => {
        if (prev.deadheadMiles === 0) return prev;
        return { ...prev, deadheadMiles: 0 };
      });
      return;
    }

    if (key !== lastCalculatedDriver) {
      setLastCalculatedDriver(key);
      fetch(`/api/distance?origin=${encodeURIComponent(driverLoc)}&destination=${encodeURIComponent(oStr)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.distanceMiles !== undefined) {
             const dh = data.distanceMiles;
             // Safeguard: Never put the loaded route distance into deadhead!
             if (dh > 0 && Math.abs(dh - (loadForm.distance || 0)) > 1) {
               setLoadForm(prev => {
                 if (prev.deadheadMiles !== undefined && prev.deadheadMiles !== null && prev.deadheadMiles > 0) {
                   return prev; // User-typed deadhead persists
                 }
                 return { ...prev, deadheadMiles: dh };
               });
               toast({ title: 'Deadhead Calculated', description: `Deadhead miles auto-calculated: ${dh} mi from driver location` });
             }
          }
        }).catch(err => {
          console.warn('Auto deadhead fetch skipped or failed:', err);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loadForm.assignedDriverId,
    loadForm.assignedTruckId,
    (loadForm.origin as Address)?.city,
    (loadForm.origin as Address)?.state,
    (loadForm.origin as Address)?.street,
    (loadForm.origin as Address)?.zip,
    loadForm.distance,
    driverProfiles,
    vehicles,
    settings,
    lastCalculatedDriver,
    setLoadForm,
    toast,
    getDriverOrTruckLocation,
    getFormattedAddressStr
  ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {

    const { name, value, type } = e.target;
    if (type === 'number' || name === 'distance' || name === 'deadheadMiles' || name === 'ratePerMile' || name === 'tarpingFee' || name === 'tripDuration' || name === 'cargoLength' || name === 'cargoWidth' || name === 'cargoHeight' || name === 'cargoWeightNum' || name === 'deckPercentageUsed') {
      setLoadForm(prev => ({ ...prev, [name]: value === '' ? undefined : Number(value) })); 
    } else {
      setLoadForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAddressChange = (type: 'origin' | 'destination', field: keyof Address, value: string) => {
    setLoadForm(prev => ({
      ...prev,
      [type]: {
        ...(prev[type] as Address || { street: '', city: '', state: '', zip: '' }),
        [field]: value
      }
    }));
  };


  // ── Helper to populate origin address from selected client ──
  const populateOriginWithClientData = React.useCallback((clientIdVal: string) => {
    if (!clientIdVal) return;
    const clientList = (appClients && appClients.length > 0) ? appClients : (clients || []);
    const selectedClient = clientList.find(c => c.id === clientIdVal);
    if (selectedClient && selectedClient.address) {
      const rawPhone = selectedClient.contactPhone || selectedClient.address.contactPhone || '';
      const clientAddressObj = {
        companyName: selectedClient.companyName || '',
        street: selectedClient.address.street || '',
        city: selectedClient.address.city || '',
        state: selectedClient.address.state || '',
        zip: selectedClient.address.zip || '',
        contactName: selectedClient.contactName || '',
        contactPhone: formatPhoneNumber(rawPhone),
      };
      setLoadForm(prev => {
        const cur = (prev as any).origin as Record<string, any> | undefined;
        // Skip no-op updates: a fresh object each time re-triggers effects forever (React #185)
        if (cur && Object.keys(clientAddressObj).every(key => (cur[key] ?? '') === (clientAddressObj as any)[key])) return prev;
        return { ...prev, origin: clientAddressObj };
      });
    }
  }, [appClients, clients, setLoadForm]);

  // ── Helper to populate destination address from selected client ──
  const populateDestinationWithClientData = React.useCallback((clientIdVal: string) => {
    if (!clientIdVal) return;
    const clientList = (appClients && appClients.length > 0) ? appClients : (clients || []);
    const selectedClient = clientList.find(c => c.id === clientIdVal);
    if (selectedClient && selectedClient.address) {
      const rawPhone = selectedClient.contactPhone || selectedClient.address.contactPhone || '';
      const clientAddressObj = {
        companyName: selectedClient.companyName || '',
        street: selectedClient.address.street || '',
        city: selectedClient.address.city || '',
        state: selectedClient.address.state || '',
        zip: selectedClient.address.zip || '',
        contactName: selectedClient.contactName || '',
        contactPhone: formatPhoneNumber(rawPhone),
      };
      setLoadForm(prev => {
        const cur = (prev as any).destination as Record<string, any> | undefined;
        if (cur && Object.keys(clientAddressObj).every(key => (cur[key] ?? '') === (clientAddressObj as any)[key])) return prev;
        return { ...prev, destination: clientAddressObj };
      });
    }
  }, [appClients, clients, setLoadForm]);

  const LS_LOAD_DRAFT = 'agy_load_draft';

  // ── Draft Persistence: Keep loadForm synchronized to persistence layer ───────
  const loadFormRef = React.useRef(loadForm);
  React.useEffect(() => {
    loadFormRef.current = loadForm;
  }, [loadForm]);

  // Persist draft on every meaningful field change
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = loadForm;
    const hasData = Boolean(
      current.clientId ||
      current.clientName ||
      (current as any).companyName ||
      current.cargoDescription ||
      (current.origin as Address)?.city ||
      (current.destination as Address)?.city ||
      current.originalClientRequestId
    );
    if (hasData) {
      try {
        localStorage.setItem(LS_LOAD_DRAFT, JSON.stringify(current));
      } catch (e) {
        console.warn('Failed to save load draft', e);
      }
    }
  }, [loadForm]);

  // Ensure clientId and all fields are serialized to persistence layer right before unmount
  React.useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && loadFormRef.current) {
        const current = loadFormRef.current;
        const hasData = Boolean(
          current.clientId ||
          current.clientName ||
          (current as any).companyName ||
          current.cargoDescription ||
          (current.origin as Address)?.city ||
          (current.destination as Address)?.city ||
          current.originalClientRequestId
        );
        if (hasData) {
          try {
            localStorage.setItem(LS_LOAD_DRAFT, JSON.stringify(current));
          } catch (e) {
            console.warn('Failed to serialize draft before unmount', e);
          }
        }
      }
    };
  }, []);

  // ── Client Dropdown Binding: read clientId directly from pending request object ──────
  // Reads clientId directly from the pending request object, matches against global clients array,
  // and binds it directly to the dropdown's selected state, completely ignoring email.
  const lastAutoMappedReqIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Watch clients directly from AppContext / props
    const clientList = (appClients && appClients.length > 0) ? appClients : (clients || []);

    const pendingReqId = loadForm.originalClientRequestId ? String(loadForm.originalClientRequestId).trim() : '';
    const cleanId = pendingReqId.replace(/^#/, '');

    const allReqs = (appClientLoadRequests && appClientLoadRequests.length > 0) ? appClientLoadRequests : (clientLoadRequests || []);
    const matchingReq = pendingReqId 
      ? allReqs.find(r => r.id === pendingReqId || r.id === cleanId || String(r.id).replace(/^#/, '') === cleanId)
      : undefined;

    // Read clientId directly from matching request, form, or draft
    let directClientId = String(
      matchingReq?.clientId ||
      loadForm.clientId ||
      ''
    ).trim();

    // Read clientName directly from matching request, form, or draft (strictly non-email)
    let directClientName = String(
      matchingReq?.companyName ||
      loadForm.clientName ||
      (loadForm as any)?.companyName ||
      ''
    ).trim();
    if (directClientName.includes('@')) {
      directClientName = '';
    }

    // Check localStorage draft if not present in request object or loadForm
    if ((!directClientId || !directClientName) && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_LOAD_DRAFT);
        if (raw) {
          const draft = JSON.parse(raw);
          if (!draft.originalClientRequestId || draft.originalClientRequestId === pendingReqId || draft.originalClientRequestId === cleanId) {
            if (!directClientId) directClientId = String(draft.clientId || '').trim();
            if (!directClientName && draft.clientName && !String(draft.clientName).includes('@')) {
              directClientName = String(draft.clientName).trim();
            }
          }
        }
      } catch {}
    }

    if (!directClientId && !directClientName) {
      return;
    }

    const cleanClientId = directClientId.replace(/^#/, '');

    // Find matching company profile in global clients array strictly by clientId (or companyName)
    const matchedCompany = clientList.find(c => {
      const cId = String(c.id || '').trim();
      const cCleanId = cId.replace(/^#/, '');
      const cClientId = (c as any).clientId ? String((c as any).clientId).trim().replace(/^#/, '') : '';
      const idMatch = Boolean(directClientId && (cId === directClientId || cCleanId === cleanClientId || cClientId === cleanClientId));
      const reqCompanyName = directClientName || (matchingReq?.companyName && !matchingReq.companyName.includes('@') ? matchingReq.companyName : '');
      const nameMatch = Boolean(reqCompanyName && (
        c.companyName?.trim().toLowerCase() === reqCompanyName.trim().toLowerCase() ||
        (c as any).name?.trim().toLowerCase() === reqCompanyName.trim().toLowerCase()
      ));
      return idMatch || nameMatch;
    });

    const targetClientId = matchedCompany?.id || directClientId;
    const targetClientName = matchedCompany?.companyName || directClientName || '';

    lastAutoMappedReqIdRef.current = pendingReqId || targetClientId;

    // Explicitly bind to the dropdown's selected state
    if (targetClientId && (loadForm.clientId !== targetClientId || (targetClientName && loadForm.clientName !== targetClientName))) {
      setLoadForm(prev => ({
        ...prev,
        clientId: targetClientId,
        clientName: targetClientName || prev.clientName,
        companyName: targetClientName || (prev as any).companyName,
      }));
    }

    // Rehydrate freight specs from matching request if absent in draft
    if (matchingReq) {
      setLoadForm(prev => {
        let updated = false;
        const next = { ...prev };
        if (!next.cargoDescription && matchingReq.cargoDescription) {
          next.cargoDescription = matchingReq.cargoDescription;
          updated = true;
        }
        if (next.cargoQuantity === undefined && matchingReq.cargoQuantity !== undefined) {
          next.cargoQuantity = matchingReq.cargoQuantity;
          updated = true;
        }
        if (next.cargoWeightNum === undefined && matchingReq.cargoWeightNum !== undefined) {
          next.cargoWeightNum = matchingReq.cargoWeightNum;
          updated = true;
        }
        if (next.cargoLength === undefined && matchingReq.cargoLength !== undefined) {
          next.cargoLength = matchingReq.cargoLength;
          updated = true;
        }
        if (next.cargoWidth === undefined && matchingReq.cargoWidth !== undefined) {
          next.cargoWidth = matchingReq.cargoWidth;
          updated = true;
        }
        if (next.cargoHeight === undefined && matchingReq.cargoHeight !== undefined) {
          next.cargoHeight = matchingReq.cargoHeight;
          updated = true;
        }
        if (!next.placementMode && matchingReq.placementMode) {
          next.placementMode = matchingReq.placementMode;
          updated = true;
        }
        return updated ? next : prev;
      });
    }

    // Ensure origin pickup gets populated if empty
    const currentOrigin = loadForm.origin as Address | undefined;
    if (!currentOrigin?.street && matchedCompany?.address) {
      populateOriginWithClientData(targetClientId);
    }

    // Update persistence layer
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_LOAD_DRAFT);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(LS_LOAD_DRAFT, JSON.stringify({
          ...parsed,
          ...loadForm,
          clientId: targetClientId,
          clientName: targetClientName || loadForm.clientName,
          companyName: targetClientName || (loadForm as any).companyName,
          originalClientRequestId: pendingReqId || parsed.originalClientRequestId,
        }));
      } catch {}
    }
  }, [
    appClients,
    clients,
    loadForm.originalClientRequestId,
    loadForm.requestedByAuthUid,
    loadForm.clientId,
    loadForm.clientName,
    (loadForm as any).companyName,
    appClientLoadRequests,
    clientLoadRequests,
    populateOriginWithClientData,
    setLoadForm,
  ]);

  // Trigger auto-fill on initial load when a client is pre-selected but origin street is empty
  React.useEffect(() => {
    const isLoading = appIsClientsLoading !== undefined ? appIsClientsLoading : isClientsLoading;
    if (isLoading) return; // Wait until clients are resolved
    if (loadForm.clientId) {
      const currentOrigin = loadForm.origin as Address | undefined;
      if (!currentOrigin?.street) {
        populateOriginWithClientData(loadForm.clientId);
      }
    }
  }, [appIsClientsLoading, isClientsLoading, loadForm.clientId, loadForm.origin, populateOriginWithClientData]);

  const handleSelectChange = (name: string, value: string) => {
    setLoadForm(prev => {
      const newForm = { ...prev, [name]: value };
      
      // Auto-populate truck, trailer, and driver name if a driver is selected
      if (name === 'assignedDriverId') {
        if (value !== 'none' && value !== '') {
          const selectedDriver = driverProfiles.find(d => getDriverProfileId(d) === value || (d as any).id === value);
          if (selectedDriver) {
            newForm.assignedDriverId = getDriverProfileId(selectedDriver);
            newForm.assignedDriverName = selectedDriver.name;
            if (selectedDriver.assignedTruckId && (!newForm.assignedTruckId || newForm.assignedTruckId === 'none')) {
              newForm.assignedTruckId = selectedDriver.assignedTruckId;
            }
            if (selectedDriver.assignedTrailerId && (!newForm.assignedTrailerId || newForm.assignedTrailerId === 'none')) {
              newForm.assignedTrailerId = selectedDriver.assignedTrailerId;
            }
          }
        } else {
          newForm.assignedDriverId = '';
          newForm.assignedDriverName = '';
        }
      }

      // Auto-populate trailer and driver if truck is selected
      if (name === 'assignedTruckId' && value !== 'none' && value !== '') {
        const truck = vehicles.find(v => v.id === value);
        if (!newForm.assignedDriverId || newForm.assignedDriverId === 'none') {
          const driverWithTruck = driverProfiles.find(d => d.assignedTruckId === value);
          if (driverWithTruck) {
            newForm.assignedDriverId = getDriverProfileId(driverWithTruck);
            newForm.assignedDriverName = driverWithTruck.name;
            if (driverWithTruck.assignedTrailerId && (!newForm.assignedTrailerId || newForm.assignedTrailerId === 'none')) {
              newForm.assignedTrailerId = driverWithTruck.assignedTrailerId;
            }
          } else if (truck?.assignedDriverId) {
            const matched = driverProfiles.find(d => getDriverProfileId(d) === truck.assignedDriverId);
            if (matched) {
              newForm.assignedDriverId = getDriverProfileId(matched);
              newForm.assignedDriverName = matched.name;
              if (matched.assignedTrailerId && (!newForm.assignedTrailerId || newForm.assignedTrailerId === 'none')) {
                newForm.assignedTrailerId = matched.assignedTrailerId;
              }
            }
          }
        }
      }

      // Auto-populate truck, trailer, and driver from selected trip container
      if (name === 'tripId' && value !== 'none' && value !== 'auto-create') {
        const selectedTrip = trips.find(t => t.id === value);
        if (selectedTrip) {
          if (selectedTrip.assignedTruckId && (!newForm.assignedTruckId || newForm.assignedTruckId === 'none')) {
            newForm.assignedTruckId = selectedTrip.assignedTruckId;
          }
          if (selectedTrip.assignedTrailerId && (!newForm.assignedTrailerId || newForm.assignedTrailerId === 'none')) {
            newForm.assignedTrailerId = selectedTrip.assignedTrailerId;
          }
          if (selectedTrip.assignedDriverId && (!newForm.assignedDriverId || newForm.assignedDriverId === 'none')) {
            newForm.assignedDriverId = selectedTrip.assignedDriverId;
            const tripDriver = driverProfiles.find(d => getDriverProfileId(d) === selectedTrip.assignedDriverId);
            if (tripDriver) newForm.assignedDriverName = tripDriver.name;
          }
        }
      }

      return newForm;
    });

    // Auto-populate origin (pickup) and destination address if a client is selected
    if (name === 'clientId' && value) {
      populateOriginWithClientData(value);
    }
  };
  
  const handleCheckboxChange = (name: string, checked: boolean | 'indeterminate') => {
    setLoadForm(prev => ({ ...prev, [name]: Boolean(checked) }));
  };
  
  const isEditMode = !!editingLoadId;

  // ── Logistics Engine: single source of truth for all weight / financial math ──
  const assignedTruck = loadForm.assignedTruckId && loadForm.assignedTruckId !== 'none'
    ? vehicles.find(v => v.id === loadForm.assignedTruckId && v.type === 'truck')
    : undefined;
  const assignedTrailer = loadForm.assignedTrailerId && loadForm.assignedTrailerId !== 'none'
    ? vehicles.find(v => v.id === loadForm.assignedTrailerId && v.type === 'trailer')
    : undefined;

  // ── Trip Container & Capacity Proration Logic ──────────────────────────────
  const isTripConsolidated = Boolean(loadForm.tripId && loadForm.tripId !== 'none');
  
  const matchedTrip = (loadForm.tripId && loadForm.tripId !== 'none' && loadForm.tripId !== 'auto-create')
    ? trips.find(t => t.id === loadForm.tripId)
    : undefined;

  // Resolve effective truck, trailer, and driver (including trip inheritance)
  let effectiveTruck = assignedTruck;
  if (!effectiveTruck && matchedTrip?.assignedTruckId) {
    effectiveTruck = vehicles.find(v => v.id === matchedTrip.assignedTruckId && v.type === 'truck');
  }
  if (!effectiveTruck) {
    effectiveTruck = vehicles.find(v => v.type === 'truck');
  }

  let effectiveTrailer = assignedTrailer;
  if (!effectiveTrailer && matchedTrip) {
    const tripLoads = (loads ?? []).filter(l => l.tripId === matchedTrip.id && l.status !== 'delivered');
    const trlId = matchedTrip.assignedTrailerId || tripLoads[0]?.assignedTrailerId;
    if (trlId) effectiveTrailer = vehicles.find(v => v.id === trlId && v.type === 'trailer');
  }
  if (!effectiveTrailer) {
    effectiveTrailer = vehicles.find(v => v.type === 'trailer');
  }

  const rawAssignedDriver = loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none'
    ? driverProfiles.find(d => d.uid === loadForm.assignedDriverId)
    : undefined;
  let effectiveDriver = rawAssignedDriver;
  if (!effectiveDriver && matchedTrip?.assignedDriverId) {
    effectiveDriver = driverProfiles.find(d => d.uid === matchedTrip.assignedDriverId);
  }
  if (!effectiveDriver && driverProfiles.length > 0) {
    effectiveDriver = driverProfiles[0];
  }

  const effectiveDeckLength = effectiveTrailer?.trailerLength ?? 40;
  const effectivePayloadCapacity = effectiveTrailer?.payloadCapacity
    || Math.max(0, (effectiveTrailer?.gvwr ?? 0) - (effectiveTrailer?.emptyWeight ?? 0))
    || 15_000;

  const CARGO_SAFETY_BUFFER = (settings as any)?.CARGO_SAFETY_BUFFER ?? (settings as any)?.cargoSafetyBuffer ?? 0.33;
  const cargoItem = loadToCargoItem(loadForm);
  const cargoLinearFt = computeCargoLinearFootprint(
    cargoItem,
    effectiveTrailer?.trailerWidth ?? 8.5,
    CARGO_SAFETY_BUFFER
  ).linearFeet;
  const incomingCargoWeight = (cargoItem.weight || 0) * (cargoItem.quantity || 1);

  // Dynamic capacity percentage: Space Share vs Weight Share
  const spaceShare = effectiveDeckLength > 0 && cargoLinearFt > 0
    ? Math.min(1.0, cargoLinearFt / effectiveDeckLength)
    : 0;
  const weightShare = effectivePayloadCapacity > 0 && incomingCargoWeight > 0
    ? Math.min(1.0, incomingCargoWeight / effectivePayloadCapacity)
    : 0;

  const maxCapacityShare = Math.max(spaceShare, weightShare);

  // ── LTL / Partial Freight Distribution State ─────────────────────────────
  const isPartialLTL = Boolean(loadForm.isPartialLTL ?? loadForm.isLtl ?? loadForm.isPartialLoad);
  const autoDeckPercentage = effectiveDeckLength > 0 && cargoLinearFt > 0
    ? Math.min(100, Math.max(5, Math.round((cargoLinearFt / effectiveDeckLength) * 100)))
    : (maxCapacityShare > 0 ? Math.round(maxCapacityShare * 100) : 25);
  const deckPercentageUsed = (loadForm.deckPercentageUsed !== undefined && loadForm.deckPercentageUsed > 0)
    ? loadForm.deckPercentageUsed
    : autoDeckPercentage;

  // Deck footprint accounting for (Quantity * Length) / Max Trailer Length
  const loadQuantity = Math.max(1, loadForm.cargoQuantity || 1);
  const exactLinearFeet = (loadForm.cargoLength && loadForm.cargoLength > 0)
    ? loadForm.cargoLength * loadQuantity
    : (cargoLinearFt > 0 ? cargoLinearFt : (effectiveDeckLength * (deckPercentageUsed / 100)));
  const trailerMaxLength = effectiveDeckLength > 0 ? effectiveDeckLength : 40;
  const calculatedDeckRatio = trailerMaxLength > 0 ? Math.min(1.0, Math.max(0.01, exactLinearFeet / trailerMaxLength)) : 1.0;
  const effectiveDeckPercentageRatio = (loadForm.deckPercentageUsed !== undefined && loadForm.deckPercentageUsed > 0)
    ? Math.min(1.0, Math.max(0.01, loadForm.deckPercentageUsed / 100))
    : calculatedDeckRatio;
  const deckFootprintPercentage = Math.round(effectiveDeckPercentageRatio * 100);

  // Proration factor for shared container expenses / partial loads
  // When isPartialLTL is INACTIVE (false), the fractional multiplier is completely REMOVED and 100% applies.
  let costShareRatio = 1.0;
  if (isPartialLTL) {
    costShareRatio = Math.max(0.01, Math.min(1.0, deckPercentageUsed / 100));
  } else if (isTripConsolidated) {
    if (maxCapacityShare > 0) {
      costShareRatio = Math.max(0.01, Math.min(1.0, maxCapacityShare));
    } else if (matchedTrip) {
      const existingTripLoads = (loads ?? []).filter(l => l.tripId === matchedTrip.id && l.id !== editingLoadId && l.status !== 'delivered');
      const estimatedSlotCount = Math.max(2, existingTripLoads.length + 1);
      costShareRatio = 1 / estimatedSlotCount;
    } else {
      costShareRatio = 0.25;
    }
  } else {
    // Dedicated Full Load: 100% (1.0) strictly applies
    costShareRatio = 1.0;
  }

  const averageMonthlyMiles = effectiveTruck?.estimatedMonthlyMiles || 8_000;
  const fuelPrice = effectiveTruck?.avgFuelPrice || settings?.defaultFuelCostPerGallon || 0;
  const mpg       = effectiveTruck?.mpg ?? settings?.truckMpg ?? 6;
  const DEF_RATIO = 0.025;
  const avgDefCostPerGallon = effectiveTruck?.avgDefCostPerGallon || settings?.defCostPerGallon || (fuelPrice > 0 ? fuelPrice * 0.9 : 0);

  const loadedMiles   = loadForm.distance ?? 0;
  const deadheadMiles = loadForm.deadheadMiles ?? 0;
  const totalMiles    = loadedMiles + deadheadMiles;
  const tarpingFee    = loadForm.tarpingFee ?? 0;

  const projectedFuel = totalMiles > 0 && mpg > 0 && fuelPrice > 0 ? (totalMiles / mpg) * fuelPrice : 0;
  const projectedDef  = totalMiles > 0 && mpg > 0 && avgDefCostPerGallon > 0 ? (totalMiles / mpg) * DEF_RATIO * avgDefCostPerGallon : 0;

  const truckPayment = effectiveTruck?.monthlyRecurringExpenses?.payment || 0;
  const truckInsurance = effectiveTruck?.monthlyRecurringExpenses?.insurance || 0;
  const truckMaintFund = effectiveTruck?.monthlyRecurringExpenses?.maintenanceFund || 0;
  const truckMaintenanceRate = effectiveTruck?.operatingCostPerMile || settings?.defaultOperatingCostPerMile || 0;

  const BUSINESS_NET_PROFIT_TARGET_PER_DAY = settings?.targetDailyBusinessProfit || 0;
  const DRIVER_PAYROLL_TARGET_PER_DAY = effectiveDriver
    ? (effectiveDriver.payType === 'hourly'
        ? (effectiveDriver.payRate || settings?.defaultDriverHourlyRate || 0) * 8
        : effectiveDriver.payType === 'per-mile'
        ? (effectiveDriver.payRate || 0) * 450
        : 250)
    : (settings?.defaultDriverHourlyRate ? settings.defaultDriverHourlyRate * 8 : 0);

  // Build engine inputs — strictly bound to individual vehicle documents without placeholder math
  const engineTruck = effectiveTruck
    ? vehicleToEngineTruck(effectiveTruck, averageMonthlyMiles)
    : { id: '', description: '', gvwr: 0, opCostPerMile: truckMaintenanceRate, insuranceMo: truckInsurance, monthlyPayment: truckPayment, maintFundMo: truckMaintFund, maxTongueWeightCapacity: 0 };

  const engineTrailer = effectiveTrailer
    ? vehicleToEngineTrailer(effectiveTrailer)
    : { id: '', description: '', gvwr: 0, emptyWeight: 0, monthlyPayment: 0, maintFundMo: 0, insuranceMo: 0, deckLength: 40, deckWidth: 8.5 };

  const engineCargo = [cargoItem];

  const engineResults = calculateTripMetrics({
    truck:   engineTruck,
    trailer: engineTrailer,
    cargo:   engineCargo,
    loadedMiles,
    deadheadMiles,
    pickupDate:   loadForm.pickupDateTime || new Date().toISOString(),
    deliveryDate: loadForm.deliveryDateTime || new Date().toISOString(),
    projectedFuel,
    projectedDef,
    averageMonthlyMiles,
    businessNetProfitTargetPerDay: BUSINESS_NET_PROFIT_TARGET_PER_DAY,
    driverPayrollTargetPerDay:     DRIVER_PAYROLL_TARGET_PER_DAY,
    userEnteredRatePerMile: (loadForm.ratePerMile ?? 0) > 0 ? loadForm.ratePerMile : undefined,
    costShareRatio,
  });

  // Destructure the results we need
  const {
    paperGcwr,
    isCdlRequired:    requiresClassACDL,
    operationalDays,
    trueExpenseAccumulation,
    grossMinimumRevenueRequired,
    suggestedRatePerMile: engineSuggestedRate,
  } = engineResults;

  const hasGcwr    = engineTruck.gvwr > 0 && engineTrailer.gvwr > 0;
  const truckGvwr  = engineTruck.gvwr;
  const trailerGvwr = engineTrailer.gvwr;
  const totalCargoWeight = engineResults.totalCargoWeight;

  // Actual operating weight computed locally from physical tare weights (not passed to engine)
  const actualOperatingWeight =
    (effectiveTruck?.emptyWeight  ?? 0) +
    (effectiveTrailer?.emptyWeight ?? 0) +
    totalCargoWeight;
  const grossOperatingWeight = actualOperatingWeight;

  const assignedDriverObj = (loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none')
    ? driverProfiles.find(d => d.uid === loadForm.assignedDriverId)
    : (matchedTrip?.assignedDriverId ? driverProfiles.find(d => d.uid === matchedTrip.assignedDriverId) : undefined);

  const complianceResult = computeCompliance(
    effectiveTruck,
    effectiveTrailer,
    assignedDriverObj,
    totalCargoWeight
  );

  // Driver eligibility filter — Non-CDL blocked when engine flags CDL required
  const eligibleDriverProfiles = driverProfiles.filter(d => {
    if (d.status === 'terminated') return false;
    if ((d.cdlStatus ?? 'Non-CDL') === 'Class A CDL') return true;
    return !requiresClassACDL;
  });
  const availableEligibleDrivers = eligibleDriverProfiles.filter(d => !isDriverOffDuty(d));
  const offDutyDrivers = eligibleDriverProfiles.filter(d => isDriverOffDuty(d));
  const hasIneligibleNonCdlDrivers =
    requiresClassACDL && driverProfiles.some(d => (d.cdlStatus ?? 'Non-CDL') === 'Non-CDL');

  // Recurring allocation — miles-based: (vehicleMonthlyFixed + perTruckGlobalOverhead) ÷ max(8,500, truck.estimatedMonthlyMiles) × tripMiles
  // maintenanceFund is excluded from overhead (it is the separate maintenance reserve line).
  const getMonthlyFixedTotal = (vehicle: Vehicle | null | undefined) => {
    if (!vehicle) return 0;
    let total = 0;
    if (vehicle.monthlyRecurringExpenses) {
      total += (vehicle.monthlyRecurringExpenses.insurance || 0);
      total += (vehicle.monthlyRecurringExpenses.payment || 0);
      // maintenanceFund intentionally excluded — covered by maintenance reserve line ($0.20/mi)
    }
    if (vehicle.monthlyFixedCosts) {
      total += vehicle.monthlyFixedCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
    }
    return total;
  };
  const truckMonthly   = getMonthlyFixedTotal(effectiveTruck);
  const trailerMonthly = getMonthlyFixedTotal(effectiveTrailer);
  
  // Overhead proration — enforce minimum 8,500-mile denominator to prevent over-allocation
  const OVERHEAD_MONTHLY_MILES = Math.max(
    8_500,
    effectiveTruck?.estimatedMonthlyMiles ?? 0
  );
  // Divide global recurring by active truck count (consistent with AppContext and LoadCard)
  const activeTruckCount = Math.max(1, (vehicles ?? []).filter(v => v.type === 'truck').length);
  const globalMonthlyRecurring = (settings?.recurringExpenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const perTruckGlobalMonthly = globalMonthlyRecurring / activeTruckCount;
  const totalMonthlyForOverhead = (truckMonthly + trailerMonthly) > 0
    ? truckMonthly + trailerMonthly + perTruckGlobalMonthly
    : perTruckGlobalMonthly;

  // ── Multi-Day Calendar Trip Days Calculation ─────────────────────────────
  let tripCalendarDays = 1;
  if (loadForm.pickupDateTime && loadForm.deliveryDateTime) {
    try {
      const pDate = new Date(loadForm.pickupDateTime);
      const dDate = new Date(loadForm.deliveryDateTime);
      if (isValid(pDate) && isValid(dDate)) {
        // Difference in calendar days + 1 (e.g., Sep 24 to Sep 26 = 3 calendar days)
        const days = differenceInCalendarDays(dDate, pDate) + 1;
        tripCalendarDays = Math.max(1, days);
      }
    } catch {
      tripCalendarDays = 1;
    }
  }
  if (loadForm.tripDuration && loadForm.tripDuration > 0) {
    tripCalendarDays = loadForm.tripDuration;
  }
  const effectiveTripDays = Math.max(operationalDays, tripCalendarDays);

  // ── LTL / Partial Freight Distribution & Suggested Rate (Memoized Reactively) ─
  const {
    effectiveShare,
    recurringAllocation,
    estimatedMaintenance,
    proratedFuel,
    proratedDef,
    totalTripOperatingExpenses,
    suggestedRateBreakdown,
    manualDriverPay,
    manualNetProfit,
    showMarginAlert,
    targetMarginRatio,
    profitTargetFloor,
    suggestedRate,
    estDriveHours,
    estLoadUnloadHours,
    estTotalTripHours,
    isShortTripScaled,
    shortTripTimeScale
  } = useMemo(() => {
    // When isPartialLTL is false, strictly remove fractional multiplier and apply 100% of trip costs!
    let share = 1.0;
    if (isPartialLTL) {
      share = Math.max(0.01, Math.min(1.0, deckPercentageUsed / 100));
    } else if (isTripConsolidated) {
      share = costShareRatio;
    } else {
      share = 1.0;
    }

    // ── Trip Time & Short-Trip Scaling ─────────────────────────────────────
    const avgSpeed = settings?.truckAverageSpeed || 55;
    const driveHrs = totalMiles > 0 ? totalMiles / avgSpeed : 0;
    const loadUnloadHrs = totalMiles > 0 ? 1.0 : 0; // ~30 min load + ~30 min unload
    const totalHrs = driveHrs + loadUnloadHrs;
    const isShortTrip = totalMiles > 0 && effectiveTripDays <= 1 && (totalMiles < 100 || totalHrs < 2);
    const timeScale = isShortTrip ? Math.min(1, Math.max(0.125, totalHrs / 8)) : 1;

    // ── Global Overhead Rule ────────────────────────────────────────────────
    // 1. Deck Percentage: (Load Linear Feet / Trailer Max Length) uses effectiveDeckPercentageRatio computed above

    // 2. Gross Overhead: (Daily Truck Overhead * Transit Calendar Days, time-scaled for short local trips)
    const dailyTruckOverhead = totalMonthlyForOverhead / 30;
    const transitCalendarDays = effectiveTripDays > 0 ? effectiveTripDays : 1;
    const effectiveOverheadDays = isShortTrip ? timeScale : transitCalendarDays;
    const grossOverhead = dailyTruckOverhead * effectiveOverheadDays;

    // 3. Prorated Allocation: (Gross Overhead * Deck Percentage)
    // 4. Override: Applies globally to all loads — even if the only load in a container, 15% deck = 15% overhead.
    const recurring = grossOverhead * effectiveDeckPercentageRatio;

    // Maintenance reserve
    const maintenanceRate = effectiveTruck?.operatingCostPerMile || financialProfile?.maintenanceCostPerMile || settings?.defaultOperatingCostPerMile || 0;
    const maint = totalMiles * maintenanceRate * share;

    const fuel = projectedFuel * share;
    const def = projectedDef * share;
    const totalExpenses = fuel + def + recurring + maint;

    // Breakdown rows
    const breakdown: { label: string; value: string; highlight?: boolean }[] = [
      ...(hasGcwr ? [
        { label: 'Paper GCWR',     value: `${paperGcwr.toLocaleString()} lbs`, highlight: true },
        { label: 'Gross Op. Wt',  value: `${grossOperatingWeight.toLocaleString()} lbs` },
      ] : []),
      ...(totalMiles > 0 ? [
        { label: 'Est. Total Time', value: `${totalHrs.toFixed(1)}h (${driveHrs.toFixed(1)}h drive + ${loadUnloadHrs.toFixed(1)}h load/unload)` },
      ] : []),
      ...(isShortTrip
        ? [{ label: 'Short-Trip Scaling', value: `${Math.round(timeScale * 100)}% of 8h day`, highlight: true }]
        : [{ label: 'Operational Days', value: `${effectiveTripDays.toFixed(1)} Days` }]
      ),
      {
        label: 'Cost Allocation',
        value: isPartialLTL
          ? `${deckPercentageUsed}% (LTL Partial)`
          : isTripConsolidated && costShareRatio < 1.0
          ? `${(costShareRatio * 100).toFixed(0)}% (Consolidated)`
          : `100% (Dedicated Full Load)`,
        highlight: isPartialLTL || costShareRatio < 1.0,
      },
      { label: 'Projected Fuel',    value: `$${fuel.toFixed(2)}` },
      { label: 'Projected DEF',     value: `$${def.toFixed(2)}` },
      { label: 'Recurring Alloc',   value: `$${recurring.toFixed(2)}` },
      { label: 'Maintenance Fund',  value: `$${maint.toFixed(2)}` },
      { label: 'Total Op. Expenses', value: `$${totalExpenses.toFixed(2)}`, highlight: true },
    ];

    // Manual Rate Checks & Margin Warning Alert
    const manualRatePerMile = loadForm.ratePerMile || 0;
    const manualGrossRevenue = loadedMiles * manualRatePerMile + tarpingFee;
    const assignedDriver = assignedDriverObj;

    let driverPay = 0;
    if (assignedDriver) {
      if (assignedDriver.payType === 'per-mile') {
        driverPay = totalMiles * (assignedDriver.payRate || 0) * share;
      } else if (assignedDriver.payType === 'hourly') {
        const estHours = assignedDriver.estimatedTripHours || totalHrs;
        driverPay = estHours * (assignedDriver.payRate || settings?.defaultDriverHourlyRate || 0) * share;
      } else {
        const rate = assignedDriver.payPercentageOfGross ?? assignedDriver.payrollPercentage ?? settings?.payrollPercentage ?? 0;
        driverPay = manualGrossRevenue * (rate / 100);
      }
    } else if (settings?.defaultDriverPayType === 'hourly') {
      driverPay = totalHrs * (settings?.defaultDriverHourlyRate || 0) * share;
    } else if (financialProfile?.targetDriverCPM) {
      driverPay = totalMiles * financialProfile.targetDriverCPM * share;
    } else {
      const rate = settings?.payrollPercentage || 0;
      driverPay = manualGrossRevenue * (rate / 100);
    }

    const netProfit = manualGrossRevenue - driverPay - totalExpenses;

    const marginRatio = isFinancialProfileComplete
      ? Math.min(0.85, Math.max(0.01, (financialProfile?.targetProfitMargin || 20) / 100))
      : 0;

    const floor = isFinancialProfileComplete
      ? (manualGrossRevenue > 0
          ? manualGrossRevenue * marginRatio
          : (totalExpenses + driverPay) * (marginRatio / (1 - marginRatio)))
      : 0;

    const marginAlert = isFinancialProfileComplete && manualRatePerMile > 0 && Math.round(netProfit * 100) < Math.round(floor * 100);

    let calculatedRate: number | null = null;
    if (isFinancialProfileComplete && loadedMiles > 0) {
      const isPercentagePay = assignedDriver && assignedDriver.payType !== 'per-mile' && assignedDriver.payType !== 'hourly';

      if (isPercentagePay) {
        const payPct = (assignedDriver.payPercentageOfGross ?? assignedDriver.payrollPercentage ?? 0) / 100;
        const netEffectiveRate = 1 - payPct - marginRatio;
        if (netEffectiveRate > 0) {
          const numerator = totalExpenses - tarpingFee * netEffectiveRate;
          calculatedRate = Math.ceil((numerator / (loadedMiles * netEffectiveRate)) * 100) / 100 + 0.01;
        }
      } else {
        let fixedDriverPay = driverPay;
        if (!assignedDriver && financialProfile?.targetDriverCPM) {
          fixedDriverPay = totalMiles * financialProfile.targetDriverCPM * share;
        }

        const totalBaseCost = totalExpenses + fixedDriverPay;
        const grossRevNeeded = marginRatio < 1 ? totalBaseCost / (1 - marginRatio) : totalBaseCost;
        const needed = grossRevNeeded - tarpingFee;
        calculatedRate = Math.ceil((needed / loadedMiles) * 100) / 100 + 0.01;
      }
    }

    return {
      effectiveShare: share,
      recurringAllocation: recurring,
      estimatedMaintenance: maint,
      proratedFuel: fuel,
      proratedDef: def,
      totalTripOperatingExpenses: totalExpenses,
      suggestedRateBreakdown: breakdown,
      manualDriverPay: driverPay,
      manualNetProfit: netProfit,
      showMarginAlert: marginAlert,
      targetMarginRatio: marginRatio,
      profitTargetFloor: floor,
      suggestedRate: calculatedRate
    };
  }, [
    isPartialLTL,
    deckPercentageUsed,
    costShareRatio,
    isTripConsolidated,
    totalMonthlyForOverhead,
    effectiveTripDays,
    effectiveTruck?.operatingCostPerMile,
    financialProfile?.maintenanceCostPerMile,
    financialProfile?.targetProfitMargin,
    financialProfile?.targetDriverCPM,
    settings?.defaultOperatingCostPerMile,
    settings?.truckAverageSpeed,
    settings?.defaultDriverHourlyRate,
    settings?.payrollPercentage,
    settings?.defaultDriverPayType,
    totalMiles,
    projectedFuel,
    projectedDef,
    hasGcwr,
    paperGcwr,
    grossOperatingWeight,
    loadForm.ratePerMile,
    loadedMiles,
    tarpingFee,
    assignedDriverObj,
    isFinancialProfileComplete
  ]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline flex items-center gap-2">
            <Edit /> {isEditMode ? 'Edit Load' : 'Create New Load'}
            {isEditMode && loadForm.loadNumber && <span className="text-base font-normal text-muted-foreground">({loadForm.loadNumber})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            if (existingTripPicked && (loadForm.tripId ?? 'none') === 'none') {
              e.preventDefault();
              setOpenSections(prev => (prev.includes('section-fleet') ? prev : [...prev, 'section-fleet']));
              toast({
                variant: 'destructive',
                title: 'Choose a trip first',
                description: 'You selected "Add to Existing Trip" — pick a trip from the list, or choose a different fleet assignment option.',
              });
              return;
            }
            if (!loadForm.cargoQuantity || loadForm.cargoQuantity < 1) {
              setLoadForm(prev => ({ ...prev, cargoQuantity: 1 }));
            }
            onSubmit(e);
          }}
          className="space-y-6"
        >
          {/* ── Section Quick Navigation & Step Jump Ribbon ── */}
          <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Jump to Section
              </span>
              <div className="flex shrink-0 items-center gap-1.5 text-xs">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900" 
                  onClick={() => setOpenSections(ALL_SECTIONS)}
                >
                  Expand all
                </Button>
                <span className="text-slate-300">·</span>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900" 
                  onClick={() => setOpenSections([])}
                >
                  Collapse all
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {SECTION_NAV_ITEMS.map((item) => {
                const isOpen = openSections.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jumpToSection(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                      isOpen
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isOpen ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.num}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-4">

            {/* Section 1: Client & Locations */}
            {/* Section 1: Client & Locations */}
            <AccordionItem id="section-locations" value="section-locations" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={1} /><MapPin className="h-5 w-5 text-blue-600" /> Client &amp; Route Locations</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-6">
                <div>
                  <Label htmlFor="clientId">Client / Company (Origin)</Label>
                  {effectiveIsClientsLoading && effectiveClients.length === 0 ? (
                    <div className="flex items-center gap-2 h-10 px-3 border border-input rounded-md bg-muted/40 text-muted-foreground text-sm cursor-not-allowed">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span>Loading client directory…</span>
                    </div>
                  ) : (
                    (() => {
                      const selectedClientId = loadForm.clientId || '';
                      const matchedClient = effectiveClients.find(c => {
                        const cId = String(c.id || '').trim();
                        const cCleanId = cId.replace(/^#/, '');
                        const sId = String(selectedClientId).trim();
                        const sCleanId = sId.replace(/^#/, '');
                        const cClientId = (c as any).clientId ? String((c as any).clientId).trim().replace(/^#/, '') : '';
                        return Boolean(sId && (cId === sId || cCleanId === sCleanId || (cClientId && cClientId === sCleanId)));
                      });
                      const hasSelectedInList = Boolean(matchedClient);
                      const displayCompanyName = matchedClient?.companyName || (loadForm.clientName && !loadForm.clientName.includes('@') ? loadForm.clientName : '');

                      return (
                        <Select 
                          key={`client-select-${matchedClient?.id || selectedClientId || 'empty'}-${effectiveClients.length}`}
                          value={matchedClient ? matchedClient.id : selectedClientId} 
                          onValueChange={(value) => {
                            const found = effectiveClients.find(c => c.id === value);
                            if (found) {
                              setLoadForm(prev => ({
                                ...prev,
                                clientId: value,
                                clientName: found.companyName,
                                companyName: found.companyName,
                              }));
                            }
                            handleSelectChange('clientId', value);
                            populateOriginWithClientData(value);
                          }}
                          name="clientId"
                        >
                          <SelectTrigger id="clientId">
                            <SelectValue placeholder="Select a client company">
                              {hasSelectedInList
                                ? undefined
                                : (displayCompanyName || undefined)
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {!hasSelectedInList && selectedClientId && displayCompanyName && (
                              <SelectItem key={selectedClientId} value={selectedClientId}>
                                {displayCompanyName}
                              </SelectItem>
                            )}
                            {sortedClients.map(client => (
                              <SelectItem key={client.id} value={client.id!}>
                                {client.isPinned ? '📌 ' : ''}{client.companyName} ({client.contactName})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()
                  )}
                  {loadForm.originalClientRequestId && (
                      <p className="text-xs text-muted-foreground mt-1">
                          Pre-filled from Client Request ID: {loadForm.originalClientRequestId}
                      </p>
                  )}
                </div>

                {/* Origin & Destination Addresses (Standard side-by-side layout) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-1">
                  <div className="space-y-3">
                    <AddressFields 
                      label="Origin (Pickup)"
                      prefix="origin"
                      address={loadForm.origin as Address}
                      onChange={(field, value) => handleAddressChange('origin', field, value)}
                      required
                      hideCompany
                    />
                  </div>
                  <div className="space-y-3">
                    <AddressFields 
                      label="Destination (Delivery)"
                      prefix="destination"
                      address={loadForm.destination as Address}
                      onChange={(field, value) => handleAddressChange('destination', field, value)}
                      required
                      hideCompany
                      enableAutocomplete
                    />
                  </div>
                </div>

                {/* Progressive Disclosure: Additional Route & Document Options */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/60 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedLocations(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                      Additional Route &amp; Document Options (Destination Client, BOL Source)
                    </span>
                    {(showAdvancedLocations || Boolean(destinationClientId) || loadForm.bolSource === 'system') ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </button>

                  {(showAdvancedLocations || Boolean(destinationClientId) || loadForm.bolSource === 'system') && (
                    <div className="p-4 border-t border-slate-200 bg-white space-y-4 animate-in fade-in duration-150">
                      <div>
                        <Label htmlFor="destinationClientId">Destination Client / Company (Optional)</Label>
                        {effectiveIsClientsLoading && effectiveClients.length === 0 ? (
                          <div className="flex items-center gap-2 h-10 px-3 border border-input rounded-md bg-muted/40 text-muted-foreground text-sm cursor-not-allowed">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            <span>Loading client directory…</span>
                          </div>
                        ) : (
                          (() => {
                            const matchedClient = effectiveClients.find(c => {
                              const cId = String(c.id || '').trim();
                              const cCleanId = cId.replace(/^#/, '');
                              const sId = String(destinationClientId).trim();
                              const sCleanId = sId.replace(/^#/, '');
                              const cClientId = (c as any).clientId ? String((c as any).clientId).trim().replace(/^#/, '') : '';
                              return Boolean(sId && (cId === sId || cCleanId === sCleanId || (cClientId && cClientId === sCleanId)));
                            });
                            const hasSelectedInList = Boolean(matchedClient);
                            const displayCompanyName = matchedClient?.companyName || '';

                            return (
                              <Select 
                                key={`dest-client-select-${matchedClient?.id || destinationClientId || 'empty'}-${effectiveClients.length}`}
                                value={matchedClient ? matchedClient.id : destinationClientId} 
                                onValueChange={(value) => {
                                  setDestinationClientId(value);
                                  populateDestinationWithClientData(value);
                                }}
                                name="destinationClientId"
                              >
                                <SelectTrigger id="destinationClientId">
                                  <SelectValue placeholder="Select a destination client/facility">
                                    {hasSelectedInList
                                      ? undefined
                                      : (displayCompanyName || undefined)
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {!hasSelectedInList && destinationClientId && displayCompanyName && (
                                    <SelectItem key={destinationClientId} value={destinationClientId}>
                                      {displayCompanyName}
                                    </SelectItem>
                                  )}
                                  {sortedClients.map(client => (
                                    <SelectItem key={client.id} value={client.id!}>
                                      {client.isPinned ? '📌 ' : ''}{client.companyName} ({client.contactName})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">If delivering to an existing client account or receiving depot.</p>
                      </div>

                      {/* ── BOL Source Toggle / Selector (Dual-Path BOL Workflow) ── */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="bolSource" className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                            <FileText className="h-4 w-4 text-blue-600" /> BOL Source
                          </Label>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {loadForm.bolSource === 'system' ? 'Digital Sign-on-Glass' : 'Physical Paper Upload'}
                          </span>
                        </div>
                        <Select
                          value={loadForm.bolSource || 'broker'}
                          onValueChange={(val) => {
                            handleSelectChange('bolSource', val);
                            setLoadForm(prev => ({ ...prev, bolSource: val as 'broker' | 'system' }));
                          }}
                          name="bolSource"
                        >
                          <SelectTrigger id="bolSource" className="bg-white">
                            <SelectValue placeholder="Select BOL Source" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="broker">Broker Provided (External)</SelectItem>
                            <SelectItem value="system">System Generated (Internal)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {loadForm.bolSource === 'system'
                            ? '⚡ System Generated: Compiles digital BOL from load data; receiver signs on driver device via digital Sign-on-Glass.'
                            : '📄 Broker Provided: Third-party broker freight; driver is strictly prompted to take a camera photo / attach the signed physical paper BOL.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Trip Schedule & Transit Dates */}
            <AccordionItem id="section-schedule" value="section-schedule" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={2} /><CalendarClock className="h-5 w-5 text-blue-600" /> Trip Schedule &amp; Transit Dates</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="pickupDateTime">Pickup Date &amp; Time</Label>
                      <DispatcherDateTimePicker
                        id="pickupDateTime"
                        name="pickupDateTime"
                        value={loadForm.pickupDateTime || ''}
                        onChange={(val) => setLoadForm(prev => ({ ...prev, pickupDateTime: val }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="deliveryDateTime">Delivery Date &amp; Time</Label>
                      <DispatcherDateTimePicker
                        id="deliveryDateTime"
                        name="deliveryDateTime"
                        value={loadForm.deliveryDateTime || ''}
                        onChange={(val) => setLoadForm(prev => ({ ...prev, deliveryDateTime: val }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                    <div>
                      <Label htmlFor="tripDuration">Estimated Operational Duration (Days)</Label>
                      <div className="relative">
                        <Timer className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="tripDuration"
                          name="tripDuration"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={loadForm.tripDuration !== undefined ? loadForm.tripDuration : ''}
                          onChange={handleInputChange}
                          placeholder="Auto-calculated from miles/dates"
                          className="pl-9"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Auto-calculated from miles or pickup/delivery dates (can be overridden).
                      </p>
                    </div>
                  </div>

                  {hosResult && (
                    <div className="mt-3">
                      <HOSWarningBanner hosResult={hosResult} />
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Freight & Cargo Specifications */}
            <AccordionItem id="section-cargo" value="section-cargo" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={3} /><CargoIcon className="h-5 w-5 text-amber-600" /> Freight &amp; Cargo Specifications</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-6">
                {/* Commodity Description */}
                <div>
                  <Label htmlFor="cargoDescription">Commodity / Freight Description</Label>
                  <Input
                    id="cargoDescription"
                    name="cargoDescription"
                    value={loadForm.cargoDescription || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., Structural Steel Pipes, Crated Machinery, Palletized Equipment..."
                    className="bg-white"
                  />
                </div>

                {/* Weight & Quantity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <Label htmlFor="cargoQuantity">Quantity / Units</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cargoQuantity"
                        name="cargoQuantity"
                        type="number"
                        min="1"
                        step="1"
                        value={loadForm.cargoQuantity !== undefined ? loadForm.cargoQuantity : ''}
                        onChange={handleInputChange}
                        onBlur={() => {
                          if (!loadForm.cargoQuantity || loadForm.cargoQuantity < 1) {
                            setLoadForm(prev => ({ ...prev, cargoQuantity: 1 }));
                          } else {
                            setLoadForm(prev => ({ ...prev, cargoQuantity: Math.floor(prev.cargoQuantity || 1) }));
                          }
                        }}
                        placeholder="e.g., 1"
                        className="pl-9 bg-white"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Number of distinct units/pieces.</p>
                  </div>

                  <div>
                    <Label htmlFor="cargoWeightNum">Unit Weight (lbs)</Label>
                    <div className="relative">
                      <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cargoWeightNum"
                        name="cargoWeightNum"
                        type="number"
                        min="0"
                        step="1"
                        value={loadForm.cargoWeightNum !== undefined ? loadForm.cargoWeightNum : ''}
                        onChange={handleInputChange}
                        placeholder="e.g., 4500"
                        className="pl-9 bg-white"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Weight per individual unit.</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Cargo Weight</span>
                    <span className="text-xl font-black text-slate-800">
                      {((loadForm.cargoWeightNum || 0) * (loadForm.cargoQuantity || 1)).toLocaleString()} <span className="text-sm font-semibold text-slate-500">lbs</span>
                    </span>
                    {((loadForm.cargoWeightNum || 0) * (loadForm.cargoQuantity || 1)) > 10000 && (
                      <span className="text-[10px] font-semibold text-amber-600 mt-0.5">Heavy freight payload</span>
                    )}
                  </div>
                </div>

                {/* Primary Cargo Dimensions (Length & Width) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="cargoLength">Length (ft)</Label>
                    <div className="relative">
                      <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cargoLength"
                        name="cargoLength"
                        type="number"
                        min="0"
                        step="any"
                        value={loadForm.cargoLength !== undefined ? loadForm.cargoLength : ''}
                        onChange={handleInputChange}
                        placeholder="e.g., 15.5"
                        className="pl-9 bg-white"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Per-unit item length in feet.</p>
                  </div>

                  <div>
                    <Label htmlFor="cargoWidth">Width (ft)</Label>
                    <div className="relative">
                      <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cargoWidth"
                        name="cargoWidth"
                        type="number"
                        min="0"
                        step="any"
                        value={loadForm.cargoWidth !== undefined ? loadForm.cargoWidth : ''}
                        onChange={handleInputChange}
                        placeholder="e.g., 8.2"
                        className="pl-9 bg-white"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Standard deck max is 8.5ft.</p>
                  </div>
                </div>

                {/* Progressive Disclosure: Advanced Cargo & Stacking Options */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/60 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedCargo(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <CargoIcon className="h-3.5 w-3.5 text-amber-600" />
                      Advanced Cargo &amp; Stacking Options (Height, Stacking Mode, LTL Partial Distribution)
                    </span>
                    {(showAdvancedCargo || isPartialLTL || (loadForm.placementMode && loadForm.placementMode !== 'standard') || Boolean(loadForm.cargoHeight)) ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </button>

                  {(showAdvancedCargo || isPartialLTL || (loadForm.placementMode && loadForm.placementMode !== 'standard') || Boolean(loadForm.cargoHeight)) && (
                    <div className="p-4 border-t border-slate-200 bg-white space-y-4 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <Label htmlFor="cargoHeight">Height (ft) (Optional)</Label>
                          <div className="relative">
                            <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="cargoHeight"
                              name="cargoHeight"
                              type="number"
                              min="0"
                              step="any"
                              value={loadForm.cargoHeight !== undefined ? loadForm.cargoHeight : ''}
                              onChange={handleInputChange}
                              placeholder="e.g., 6.5"
                              className="pl-9 bg-white"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">Height in feet (e.g. 6.5 ft for 6&apos; 6&quot;).</p>
                        </div>

                        <div>
                          <Label htmlFor="placementMode">Loading / Placement Mode</Label>
                          <Select
                            value={loadForm.placementMode || 'standard'}
                            onValueChange={(value) => handleSelectChange('placementMode', value)}
                            name="placementMode"
                          >
                            <SelectTrigger id="placementMode" className="bg-white">
                              <SelectValue placeholder="Standard" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard (Side-by-side / Floor)</SelectItem>
                              <SelectItem value="stacked">Stacked (Vertical 2-High)</SelectItem>
                              <SelectItem value="nested">Nested / Compact</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground mt-1">How items sit on trailer deck.</p>
                        </div>
                      </div>

                      {/* Cargo Deck Footprint Summary Badge */}
                      {(() => {
                        const qty = loadForm.cargoQuantity ?? 1;
                        const len = loadForm.cargoLength ?? 0;
                        const wid = loadForm.cargoWidth ?? 0;
                        const ht = loadForm.cargoHeight ?? 0;
                        const mode = loadForm.placementMode || 'standard';
                        const SAFETY = (settings as any)?.cargoSafetyBuffer ?? 0.33;
                        const deckW = assignedTrailer?.trailerWidth ?? 8.5;

                        const footprint = computeCargoLinearFootprint(
                          { quantity: qty, length: len, width: wid, height: (ht <= 20 ? ht * 12 : ht), placementMode: mode },
                          deckW,
                          SAFETY
                        );

                        return len > 0 && wid > 0 ? (
                          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-900">📐 Deck Space Required:</span>
                              <span className="font-extrabold text-amber-800 text-sm">{footprint.linearFeet} linear ft</span>
                              <span className="text-amber-700">
                                ({mode === 'nested'
                                  ? `Nested / Bundled across ${deckW}ft deck: ${footprint.unitsPerRow} base width, ~${footprint.tiers} tier${footprint.tiers !== 1 ? 's' : ''}`
                                  : mode === 'stacked'
                                  ? `Stacked (2-High): ${footprint.rows} floor row${footprint.rows !== 1 ? 's' : ''}, ${footprint.unitsPerRow} across`
                                  : `${footprint.rows} floor row${footprint.rows !== 1 ? 's' : ''}, ${footprint.unitsPerRow} unit${footprint.unitsPerRow !== 1 ? 's' : ''} per row across ${deckW}ft deck`
                                })
                              </span>
                            </div>
                            <span className="text-[11px] text-amber-700 font-medium">
                              {mode === 'nested' ? 'Compact bundled / cylindrical tiering' : `Includes ${SAFETY}ft physical safety buffer`}
                            </span>
                          </div>
                        ) : null;
                      })()}

                      {/* ── LTL / Partial Freight Distribution ── */}
                      <div className={`rounded-xl border p-4 transition-all duration-200 ${isPartialLTL ? 'border-purple-300 bg-purple-50/50 shadow-sm' : 'border-slate-200 bg-slate-50/60'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id="isLtl"
                              name="isLtl"
                              checked={isPartialLTL}
                              onCheckedChange={(checked) => {
                                const val = Boolean(checked);
                                setLoadForm(prev => ({
                                  ...prev,
                                  isPartialLTL: val,
                                  isLtl: val,
                                  isPartialLoad: val,
                                  deckPercentageUsed: val ? (prev.deckPercentageUsed || autoDeckPercentage) : undefined
                                }));
                              }}
                              className="mt-1 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                            />
                            <div>
                              <Label htmlFor="isLtl" className="text-sm font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
                                <span>LTL / Partial Freight Distribution</span>
                                {isPartialLTL && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-300 uppercase tracking-wider">
                                    Active ({deckPercentageUsed}% Deck)
                                  </span>
                                )}
                              </Label>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Prorate fixed operating overhead, maintenance, and multi-day trip costs by deck footprint so this partial load only absorbs its fair share.
                              </p>
                            </div>
                          </div>

                          {isPartialLTL && (
                            <div className="flex items-center gap-3 shrink-0 bg-white p-2 rounded-lg border border-purple-200 shadow-xs">
                              <Label htmlFor="deckPercentageUsed" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                                Deck Space Used (%):
                              </Label>
                              <div className="relative w-24">
                                <Input
                                  id="deckPercentageUsed"
                                  name="deckPercentageUsed"
                                  type="number"
                                  min="1"
                                  max="100"
                                  step="1"
                                  value={loadForm.deckPercentageUsed !== undefined ? loadForm.deckPercentageUsed : autoDeckPercentage}
                                  onChange={handleInputChange}
                                  className="h-8 text-sm font-bold pr-7 bg-white text-right"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">%</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {isPartialLTL && (
                          <div className="mt-3 pt-3 border-t border-purple-200/70 flex flex-wrap items-center justify-between gap-2 text-xs text-purple-900">
                            <span className="flex items-center gap-1.5 font-medium">
                              <CheckCircle2 className="h-4 w-4 text-purple-600" />
                              Fixed expenses &amp; daily overhead scaled to <strong>{deckPercentageUsed}%</strong> (eliminates false negative margins).
                            </span>
                            {effectiveDeckLength > 0 && cargoLinearFt > 0 && (
                              <span className="text-purple-700 text-[11px]">
                                Auto-calculated from {cargoLinearFt}ft cargo / {effectiveDeckLength}ft trailer deck.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: Rate & Pricing (mileage, rates & financials) */}
            <AccordionItem id="section-pricing" value="section-pricing" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={4} /><DollarSign className="h-5 w-5 text-emerald-600" /> Rate &amp; Pricing</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="distance">Loaded Miles</Label>
                    <div className="relative">
                      <Milestone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input 
                        id="distance"
                        name="distance"
                        type="number"
                        step="any"
                        value={loadForm.distance !== undefined && loadForm.distance !== null ? loadForm.distance : ''} 
                        onChange={handleInputChange} 
                        placeholder="e.g., 500"
                        className="pl-10 bg-white" 
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Total revenue-generating loaded miles.</p>
                  </div>
                  <div>
                    <Label htmlFor="ratePerMile">Rate per Mile ($)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input 
                        id="ratePerMile"
                        name="ratePerMile"
                        type="number"
                        step="0.01"
                        value={loadForm.ratePerMile || ''} 
                        onChange={handleInputChange} 
                        placeholder="e.g., 2.50"
                        className="pl-10 bg-white"
                        required
                      />
                    </div>
                    {showMarginAlert && (
                      <div className="mt-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold flex items-start gap-2 shadow-sm animate-shake">
                        <XCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-bold">Warning:</span>{' '}
                          Rate does not meet the minimum net profit target of{' '}
                          <span className="font-bold">${profitTargetFloor.toFixed(2)}</span>
                          {' '}({operationalDays === 1
                            ? '1-day trip'
                            : `${operationalDays}-day trip`
                          } &times; ${BUSINESS_NET_PROFIT_TARGET_PER_DAY.toFixed(0)}/day).
                          <span className="block mt-0.5 opacity-80 font-normal">
                            Current Est. Net Profit:{' '}
                            <span className="font-bold">${manualNetProfit.toFixed(2)}</span>
                            {' '}vs Required:{' '}
                            <span className="font-bold">${profitTargetFloor.toFixed(2)}</span>
                            {' '}&mdash; Shortfall:{' '}
                            <span className="font-bold text-amber-900">${Math.abs(manualNetProfit - profitTargetFloor).toFixed(2)}</span>
                          </span>
                          {loadForm.originalClientRequestId && onDeclineClientRequest && (
                            <div className="mt-2.5 pt-2 border-t border-amber-200 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-amber-900">
                                This client request produces an unprofitable shortfall.
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setIsDeclineDialogOpen(true)}
                                className="h-7 text-xs border-red-300 text-red-700 bg-white hover:bg-red-50 hover:text-red-800 font-bold"
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1 text-red-600" />
                                Decline Request
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Suggested Rate Panel ─────────────────────────────────────────── */}
                {!isFinancialProfileComplete ? (
                  <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/90 overflow-hidden shadow-sm">
                    {/* Blurred mock preview */}
                    <div className="filter blur-sm select-none opacity-25 pointer-events-none p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-200">
                          <TrendingUp className="h-5 w-5 text-slate-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Suggested Rate</p>
                          <p className="text-xl font-black text-slate-400">$0.00/mi</p>
                        </div>
                      </div>
                    </div>

                    {/* Security Gate Overlay Prompt */}
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/10 backdrop-blur-[2px] p-4 text-center">
                      <div className="p-1.5 rounded-full bg-blue-100 text-blue-700 mb-1.5">
                        <Lock className="h-4 w-4" />
                      </div>
                      <p className="text-xs font-bold text-slate-900 mb-1">
                        Complete Fleet Financial Setup to unlock rate projections.
                      </p>
                      <p className="text-[11px] text-slate-600 mb-2.5 max-w-sm">
                        Rate calculations are securely bound to your custom baseline operating costs. Default placeholder math has been disabled.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setIsFleetFinancialModalOpen(true)}
                        className="h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                      >
                        Complete Fleet Financial Setup
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={`rounded-xl border-2 overflow-hidden transition-all duration-300 ${suggestedRate !== null ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${suggestedRate !== null ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                          <TrendingUp className={`h-4 w-4 ${suggestedRate !== null ? 'text-emerald-700' : 'text-slate-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className={`text-[10px] font-bold uppercase tracking-wider ${suggestedRate !== null ? 'text-emerald-700' : 'text-slate-500'}`}>
                              Suggested Rate
                            </p>
                            {deckFootprintPercentage < 100 ? (
                              <span className={`px-1.5 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide border ${isPartialLTL ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                {isPartialLTL ? `LTL Partial (${deckFootprintPercentage}% Share)` : `Partial Load (${deckFootprintPercentage}% Share)`}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-extrabold text-[9px] uppercase tracking-wide border border-slate-300">
                                Full Load (100% Share)
                              </span>
                            )}
                            {effectiveTripDays > 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[9px] uppercase tracking-wide border border-slate-300">
                                {effectiveTripDays} Calendar Days
                              </span>
                            )}
                          </div>
                          <p className={`text-[10px] ${suggestedRate !== null ? 'text-emerald-700' : 'text-slate-500'} opacity-75 font-normal`}>
                            Target: ${settings?.targetDailyBusinessProfit || 0}/day profit
                            {effectiveDriver ? ` + Driver: ${effectiveDriver.name || 'Assigned'}` : ''}
                            {effectiveTruck ? ` + Truck: #${effectiveTruck.unitNumber || effectiveTruck.name}` : ''}
                            {isPartialLTL ? ` [${deckPercentageUsed}% deck space]` : isTripConsolidated && costShareRatio < 1.0 ? ` [${(costShareRatio * 100).toFixed(0)}% trip share]` : ''}
                            {effectiveTripDays !== 1 ? ` over ${effectiveTripDays} calendar days` : ''}
                          </p>
                          {suggestedRate !== null ? (
                            <p className="text-xl font-black text-emerald-800 leading-tight mt-0.5">
                              ${suggestedRate.toFixed(2)}<span className="text-sm font-semibold text-emerald-600">/mi</span>
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 italic mt-0.5">
                              {loadedMiles === 0
                                ? 'Enter Loaded Miles to calculate…'
                                : 'Enter miles + assign equipment to calculate…'}
                            </p>
                          )}
                        </div>
                      </div>
                      {suggestedRate !== null && (
                        <button
                          type="button"
                          onClick={() => setLoadForm(prev => ({ ...prev, ratePerMile: parseFloat(suggestedRate!.toFixed(2)) }))}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all duration-150"
                          title="Apply this rate to the Rate per Mile field"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Apply
                        </button>
                      )}
                    </div>

                    {/* Breakdown rows */}
                    {suggestedRate !== null && suggestedRateBreakdown.length > 0 && (
                      <div className="border-t border-emerald-200 bg-emerald-50/50 px-4 py-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-1">
                        {suggestedRateBreakdown.map(row => (
                          <div key={row.label} className="flex flex-col">
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${row.highlight ? 'text-blue-600' : 'text-emerald-600'}`}>{row.label}</span>
                            <span className={`text-xs font-semibold ${row.highlight ? 'text-blue-800' : 'text-slate-700'}`}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Progressive Disclosure: Additional Pricing & Load Options */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/60 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedPricing(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Sliders className="h-3.5 w-3.5 text-emerald-600" />
                      Additional Pricing &amp; Load Options (Deadhead Miles, Tarping, Status)
                    </span>
                    {(showAdvancedPricing || Boolean(loadForm.deadheadMiles) || Boolean(loadForm.requiresTarping) || Boolean(loadForm.tarpingFee && loadForm.tarpingFee > 0) || (loadForm.status && loadForm.status !== 'pending' && loadForm.status !== 'pending_approval')) ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </button>

                  {(showAdvancedPricing || Boolean(loadForm.deadheadMiles) || Boolean(loadForm.requiresTarping) || Boolean(loadForm.tarpingFee && loadForm.tarpingFee > 0) || (loadForm.status && loadForm.status !== 'pending' && loadForm.status !== 'pending_approval')) && (
                    <div className="p-4 border-t border-slate-200 bg-white space-y-4 animate-in fade-in duration-150">
                      <div>
                        <Label htmlFor="deadheadMiles">Deadhead Miles (Empty transit to pickup)</Label>
                        <div className="relative">
                          <Milestone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input 
                            id="deadheadMiles"
                            name="deadheadMiles"
                            type="number"
                            step="any"
                            value={loadForm.deadheadMiles !== undefined && loadForm.deadheadMiles !== null ? loadForm.deadheadMiles : ''} 
                            onChange={handleInputChange} 
                            placeholder="e.g., 50"
                            className="pl-10 bg-white" 
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Miles driven empty before reaching the pickup facility.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        <div className="flex items-center space-x-2 pt-2">
                          <Checkbox
                            id="requiresTarping"
                            name="requiresTarping"
                            checked={loadForm.requiresTarping || false}
                            onCheckedChange={(checked) => handleCheckboxChange('requiresTarping', checked)}
                          />
                          <Label htmlFor="requiresTarping" className="flex items-center gap-1 cursor-pointer">
                            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                            Requires Tarping?
                          </Label>
                        </div>
                        <div>
                          <Label htmlFor="tarpingFee">Tarping Fee ($) (if applicable)</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                              id="tarpingFee"
                              name="tarpingFee"
                              type="number"
                              step="0.01"
                              value={loadForm.tarpingFee || ''}
                              onChange={handleInputChange}
                              placeholder="e.g., 100.00"
                              className="pl-10 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="status">Load Status</Label>
                        <Select 
                          value={loadForm.status || 'pending'}
                          onValueChange={(value) => handleSelectChange('status', value as Load['status'])}
                          name="status"
                        >
                          <SelectTrigger id="status" className="bg-white">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="pending_approval">Pending Approval (New Load created)</SelectItem>
                              <SelectItem value="approved">Approved (Ready for dispatch)</SelectItem>
                              <SelectItem value="pending">Pending (Waiting for broker/client)</SelectItem>
                              <SelectItem value="client-request-approved">Request Approved (Load locked in)</SelectItem>
                              <SelectItem value="dispatched">Dispatched / En Route (Driver is heading to the pickup facility)</SelectItem>
                              <SelectItem value="arrived-origin">Arrived at Origin (Driver is at the pickup facility)</SelectItem>
                              <SelectItem value="loading">Loading (Freight is being loaded)</SelectItem>
                              <SelectItem value="in-transit">In Transit (Loaded) (Driver is on the road to the destination)</SelectItem>
                              <SelectItem value="arrived-destination">Arrived at Destination (Driver is at the drop-off facility)</SelectItem>
                              <SelectItem value="unloading">Unloading (Freight is being taken off the truck)</SelectItem>
                              <SelectItem value="delivered">Delivered / Completed (Empty and finished)</SelectItem>
                            </SelectGroup>
                            <SelectSeparator className="my-1" />
                            <SelectGroup>
                              <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                                Operational Exceptions
                              </SelectLabel>
                              <SelectItem value="waiting">Waiting / Detention</SelectItem>
                              <SelectItem value="on-break">On Break</SelectItem>
                              <SelectItem value="idle">Idle / Staging</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Fleet Assignment & Consolidation */}
            <AccordionItem id="section-fleet" value="section-fleet" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={5} /><Navigation className="h-5 w-5 text-purple-600" /> Fleet Assignment &amp; Consolidation</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-6">
                {/* ── Trip Consolidation Routing Panel ────────────────────────────────── */}
                {(() => {
                  const SAFETY_BUFFER = (settings as any)?.CARGO_SAFETY_BUFFER ?? (settings as any)?.cargoSafetyBuffer ?? 0.33;

                  // Compute incoming cargo footprint from the form (same row math as engine)
                  let parsedDimLength: number | null = null;
                  let parsedDimWidth: number | null = null;
                  let parsedDimHeight: number | null = null;
                  if (loadForm.cargoDimensions) {
                    const matches = String(loadForm.cargoDimensions).match(/(\d+(?:\.\d+)?)/g);
                    if (matches && matches.length >= 2) {
                      parsedDimLength = parseFloat(matches[0]);
                      parsedDimWidth = parseFloat(matches[1]);
                      if (matches[2]) parsedDimHeight = parseFloat(matches[2]);
                    }
                  }
                  const parsedCargoWeight = loadForm.cargoWeight ? parseFloat(String(loadForm.cargoWeight).replace(/[^0-9.]/g, '')) : null;

                  const incomingQty    = loadForm.cargoQuantity ?? (cargoItem.quantity || 1);
                  const incomingLen    = (loadForm.cargoLength && loadForm.cargoLength > 0)
                    ? loadForm.cargoLength
                    : (parsedDimLength ?? (cargoItem.length || 0));
                  const incomingWid    = (loadForm.cargoWidth && loadForm.cargoWidth > 0)
                    ? loadForm.cargoWidth
                    : (parsedDimWidth ?? (cargoItem.width || 0));
                  const incomingHt     = (loadForm.cargoHeight && loadForm.cargoHeight > 0)
                    ? loadForm.cargoHeight
                    : (parsedDimHeight ?? (cargoItem.height || 0));
                  const perUnitWeight  = (loadForm.cargoWeightNum !== undefined && loadForm.cargoWeightNum !== null && loadForm.cargoWeightNum > 0)
                    ? loadForm.cargoWeightNum
                    : (parsedCargoWeight && parsedCargoWeight > 0 ? (parsedCargoWeight / incomingQty) : (cargoItem.weight || 0));
                  const incomingWeight = perUnitWeight * incomingQty;

                  // Per-trip capacity math pulled from real loads + vehicles
                  const tripOptions = trips
                    .filter(t => t.status === 'active' || t.status === 'planned')
                    .map(trip => {
                      const tripLoads = effectiveLoads.filter(l => l.tripId === trip.id && l.status !== 'delivered');
                      const isContainerEmpty = tripLoads.length === 0;
                      const effectiveTrailerId = trip.assignedTrailerId || tripLoads[0]?.assignedTrailerId;
                      const effectiveTrailer   = effectiveTrailerId ? vehicles.find(v => v.id === effectiveTrailerId) : undefined;

                      const deckWidth  = effectiveTrailer?.trailerWidth  ?? 8.5;
                      const deckLength = effectiveTrailer?.trailerLength ?? 40;
                      const maxPayload = effectiveTrailer?.payloadCapacity
                        || Math.max(0, (effectiveTrailer?.gvwr ?? 0) - (effectiveTrailer?.emptyWeight ?? 0));

                      // Recalculate used deck space using engine footprint math
                      let usedDeckLength = 0;
                      tripLoads.forEach(l => {
                        const fp = computeCargoLinearFootprint(
                          {
                            quantity: l.cargoQuantity ?? 1,
                            length: l.cargoLength ?? 0,
                            width: l.cargoWidth ?? 0,
                            height: l.cargoHeight ? (l.cargoHeight <= 20 ? l.cargoHeight * 12 : l.cargoHeight) : 0,
                            placementMode: l.placementMode ?? 'standard',
                          },
                          deckWidth,
                          SAFETY_BUFFER
                        );
                        usedDeckLength += fp.linearFeet;
                      });

                      const usedWeight = tripLoads.reduce((s, l) => s + (l.cargoWeightNum ?? 0) * (l.cargoQuantity ?? 1), 0);

                      // Incoming footprint against THIS trip's trailer width
                      const incomingFp = computeCargoLinearFootprint(
                        {
                          quantity: incomingQty,
                          length: incomingLen,
                          width: incomingWid,
                          height: incomingHt ? (incomingHt <= 20 ? incomingHt * 12 : incomingHt) : 0,
                          placementMode: loadForm.placementMode ?? 'standard',
                        },
                        deckWidth,
                        SAFETY_BUFFER
                      );
                      const incomingLinearFt = incomingFp.linearFeet;

                      const remSpace  = Math.max(0, deckLength - usedDeckLength);
                      const remWeight = Math.max(0, maxPayload - usedWeight);
                      const fitsSpace  = remSpace  >= incomingLinearFt;
                      const fitsWeight = remWeight >= incomingWeight;

                      // Pull truck/trailer names for display
                      const assignedTruckForTrip   = vehicles.find(v => v.id === trip.assignedTruckId);
                      const assignedTrailerForTrip  = effectiveTrailer;

                      const truckLabel   = assignedTruckForTrip?.unitNumber || 'No Truck';
                      const trailerLabel = assignedTrailerForTrip?.unitNumber || 'No Trailer';

                      const pickupCount = tripLoads.length;
                      const routeLabel  = pickupCount > 0 ? `${pickupCount} Pickups attached` : `Empty Container`;

                      return {
                        trip, truckLabel, trailerLabel, routeLabel, assignedTruckForTrip, assignedTrailerForTrip,
                        remSpace, remWeight, incomingLinearFt,
                        fitsSpace, fitsWeight,
                        maxPayload, deckLength,
                        isContainerEmpty,
                        tripLoads,
                      };
                    })
                    .filter(t => t.remSpace > 0 && t.trip.status === 'active');

                  const isSelected = (id: string) => (loadForm.tripId ?? 'none') === id;

                  // ── Fleet assignment mode (derived from tripId so the data model is unchanged) ──
                  //   'none'        → Independent load
                  //   'auto-create' → Start New Multi-Stop Trip (container created on save)
                  //   <trip id>     → Add to Existing Trip
                  const tid = loadForm.tripId ?? 'none';
                  const hasSpecificTrip = tid !== 'none' && tid !== 'auto-create' && tid !== '';
                  const fleetMode: 'independent' | 'existing' | 'new' =
                    tid === 'auto-create' ? 'new'
                    : hasSpecificTrip ? 'existing'
                    : existingTripPicked ? 'existing'
                    : 'independent';

                  const chooseMode = (mode: 'independent' | 'existing' | 'new') => {
                    if (mode === 'independent') {
                      setExistingTripPicked(false);
                      handleSelectChange('tripId', 'none');
                    } else if (mode === 'new') {
                      setExistingTripPicked(false);
                      handleSelectChange('tripId', 'auto-create');
                    } else if (!hasSpecificTrip) {
                      // Wait for the user to pick a specific trip from the list
                      setExistingTripPicked(true);
                      handleSelectChange('tripId', 'none');
                    }
                  };

                  // A load being edited may already belong to a trip that is full/closed and therefore not in the list.
                  const orphanTrip = hasSpecificTrip && !tripOptions.some(o => o.trip.id === tid)
                    ? trips.find(t => t.id === tid)
                    : undefined;

                  const previewTruck   = vehicles.find(v => v.id === loadForm.assignedTruckId && v.type === 'truck');
                  const previewTrailer = vehicles.find(v => v.id === loadForm.assignedTrailerId && v.type === 'trailer');
                  const previewDriver  = driverProfiles.find(d => d.uid === loadForm.assignedDriverId);

                  const radioKey = (fn: () => void) => (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
                  };

                  const RadioDot = ({ on, tone }: { on: boolean; tone: 'blue' | 'emerald' | 'red' }) => (
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      on
                        ? tone === 'emerald' ? 'border-emerald-600 bg-emerald-600' : tone === 'red' ? 'border-red-500 bg-red-500' : 'border-blue-600 bg-blue-600'
                        : tone === 'red' ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
                    }`}>
                      {on && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  );

                  const optionHeader = (
                    mode: 'independent' | 'existing' | 'new',
                    title: string,
                    description: string,
                    tone: 'blue' | 'emerald',
                  ) => {
                    const on = fleetMode === mode;
                    return (
                      <div
                        role="radio"
                        aria-checked={on}
                        tabIndex={0}
                        onClick={() => chooseMode(mode)}
                        onKeyDown={radioKey(() => chooseMode(mode))}
                        className={`flex cursor-pointer items-start gap-3 px-4 py-4 transition-colors border-l-4 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                          on
                            ? tone === 'emerald' ? 'border-l-emerald-600 bg-emerald-50' : 'border-l-blue-600 bg-blue-50'
                            : 'border-l-transparent hover:bg-slate-50'
                        }`}
                      >
                        <RadioDot on={on} tone={tone} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">{title}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{description}</p>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fleet Assignment</p>
                        <p className="text-sm text-slate-600">Is this load on its own, or one stop in a multi-stop trip?</p>
                      </div>

                      {/* Contextual Help: Trip Modes Explained */}
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs space-y-2 text-slate-700">
                        <div className="flex items-center gap-1.5 font-bold text-blue-900 text-xs">
                          <Info className="h-4 w-4 text-blue-600 shrink-0" />
                          <span>Quick Guide: Which option should you choose?</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-0.5 text-[11px] leading-relaxed">
                          <div className="bg-white/85 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                            <p className="font-bold text-slate-900 mb-0.5">1. Independent Load</p>
                            <p className="text-slate-600">Single haul from A to B. Assigned truck and trailer are dedicated exclusively to this cargo.</p>
                          </div>
                          <div className="bg-white/85 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                            <p className="font-bold text-slate-900 mb-0.5">2. Add to Existing Trip</p>
                            <p className="text-slate-600">Co-load cargo. Pick an open trip that has leftover deck footage and payload weight along the route.</p>
                          </div>
                          <div className="bg-white/85 p-2.5 rounded-lg border border-blue-100/80 shadow-2xs">
                            <p className="font-bold text-slate-900 mb-0.5">3. Start New Multi-Stop Trip</p>
                            <p className="text-slate-600">Start a shared route container. Assign equipment once, then stack 2 or more loads onto the trailer.</p>
                          </div>
                        </div>
                      </div>

                      <div role="radiogroup" aria-label="Fleet assignment" className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                        {/* Option 1 — Independent */}
                        {optionHeader('independent', 'Create as Independent Load', 'This load will not be part of any multi-stop trip. Assign a driver, truck and trailer below.', 'blue')}

                        {/* Option 2 — Add to existing trip */}
                        <div>
                          {optionHeader('existing', 'Add to Existing Trip', 'Select an open trip below to add this load as another stop.', 'blue')}
                          {fleetMode === 'existing' && (
                            <div className="space-y-2 border-t border-blue-100 bg-blue-50/40 px-4 py-4">
                              {tripOptions.length === 0 && !orphanTrip && (
                                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center">
                                  <p className="text-sm font-semibold text-slate-700">No open trips have room right now.</p>
                                  <p className="mt-0.5 text-xs text-slate-500">Start a new multi-stop trip instead, and add more loads to it later.</p>
                                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => chooseMode('new')}>
                                    Start New Multi-Stop Trip
                                  </Button>
                                </div>
                              )}

                              {orphanTrip && (
                                <div className="flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-50 px-3 py-3">
                                  <RadioDot on tone="blue" />
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{orphanTrip.name}</p>
                                    <p className="text-[11px] text-slate-500">Currently assigned trip (no longer listed as open).</p>
                                  </div>
                                </div>
                              )}

                              {tripOptions.map(({ trip, routeLabel, remSpace, remWeight, incomingLinearFt, fitsSpace, fitsWeight, maxPayload, deckLength, isContainerEmpty, tripLoads, assignedTruckForTrip, assignedTrailerForTrip }) => {
                                const isSelectable = fitsSpace && fitsWeight;
                                const selected = isSelected(trip.id);
                                const pick = () => { if (isSelectable) handleSelectChange('tripId', trip.id); };
                                const equipment = `${assignedTruckForTrip ? `#${assignedTruckForTrip.unitNumber} ${assignedTruckForTrip.name}` : 'No truck'} + ${assignedTrailerForTrip ? `#${assignedTrailerForTrip.unitNumber} ${assignedTrailerForTrip.name}` : 'No trailer'}`;
                                return (
                                  <div
                                    key={trip.id}
                                    role="radio"
                                    aria-checked={selected}
                                    aria-disabled={!isSelectable}
                                    tabIndex={isSelectable ? 0 : -1}
                                    onClick={pick}
                                    onKeyDown={radioKey(pick)}
                                    className={`rounded-lg border bg-white px-3 py-3 outline-none transition-all focus-visible:ring-2 focus-visible:ring-blue-400 ${
                                      !isSelectable ? 'cursor-not-allowed border-red-200 opacity-70'
                                      : selected ? 'cursor-pointer border-blue-500 ring-1 ring-blue-500'
                                      : 'cursor-pointer border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex min-w-0 items-start gap-3">
                                        <RadioDot on={selected && isSelectable} tone={isSelectable ? 'blue' : 'red'} />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-bold text-slate-900">{trip.name}</p>
                                            {tripLoads.length > 0 && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  // Never read stale precalculated data — query freshest active loads directly.
                                                  const freshLoads = effectiveLoads.filter(
                                                    l => l.tripId === trip.id && l.status !== 'delivered' && (l.status as string) !== 'completed'
                                                  );
                                                  const loadsToMap = freshLoads.length > 0 ? freshLoads : tripLoads;
                                                  const mapUrl = generateGoogleMapsUrl(loadsToMap);
                                                  if (mapUrl && mapUrl !== 'https://www.google.com/maps') {
                                                    window.open(mapUrl, '_blank');
                                                  }
                                                }}
                                                title="View Consolidated Route on Map"
                                                className="rounded p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                                aria-label="View Route on Map"
                                              >
                                                <MapPin className="h-3.5 w-3.5 text-blue-500" />
                                              </button>
                                            )}
                                            {isContainerEmpty && (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setTripToDelete(trip); }}
                                                title="Delete empty trip"
                                                className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                aria-label="Delete empty trip"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                          </div>
                                          <p className="mt-0.5 text-xs text-slate-600">{equipment}</p>
                                          <p className="text-[11px] text-slate-400">{isContainerEmpty ? 'Empty trip — no stops yet' : routeLabel.replace('Pickups attached', 'stops so far')}</p>
                                        </div>
                                      </div>

                                      <div className="shrink-0 space-y-1 text-right">
                                        <div className="flex justify-end">
                                          {isSelectable ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                              Fits Load ✓
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                                              Over Capacity ✕
                                            </span>
                                          )}
                                        </div>
                                        <div className={`text-[11px] font-bold ${fitsSpace ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {fitsSpace ? '✓' : '✕'} Deck: {remSpace.toFixed(1)} ft free (need {incomingLinearFt.toFixed(1)} ft)
                                        </div>
                                        <div className={`text-[11px] font-bold ${fitsWeight ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {fitsWeight ? '✓' : '✕'} Weight: {remWeight.toLocaleString()} lbs free (need {incomingWeight.toLocaleString()} lbs)
                                        </div>
                                      </div>
                                    </div>

                                    {maxPayload > 0 && (
                                      <div className="mt-2 grid grid-cols-2 gap-3">
                                        <div>
                                          <div className="mb-0.5 flex justify-between text-[9px] text-slate-400">
                                            <span>DECK</span>
                                            <span>{((deckLength - remSpace) / deckLength * 100).toFixed(0)}% used</span>
                                          </div>
                                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                              className={`h-full rounded-full transition-all ${!fitsSpace ? 'bg-red-400' : 'bg-blue-400'}`}
                                              style={{ width: `${Math.min(100, (deckLength - remSpace) / deckLength * 100)}%` }}
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <div className="mb-0.5 flex justify-between text-[9px] text-slate-400">
                                            <span>PAYLOAD</span>
                                            <span>{((maxPayload - remWeight) / maxPayload * 100).toFixed(0)}% used</span>
                                          </div>
                                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                              className={`h-full rounded-full transition-all ${!fitsWeight ? 'bg-red-400' : 'bg-emerald-400'}`}
                                              style={{ width: `${Math.min(100, (maxPayload - remWeight) / maxPayload * 100)}%` }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {!isSelectable && (
                                      <p className="mt-2 text-[11px] font-bold text-red-700">
                                        ⚠️ Doesn&apos;t fit — this cargo exceeds the trip&apos;s remaining deck space or payload.
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Option 3 — Start new multi-stop trip (formerly "Auto-Create") */}
                        <div>
                          {optionHeader('new', 'Start New Multi-Stop Trip', 'Creates a new trip and adds this load as the first stop. You can add more loads to it later.', 'emerald')}
                          {fleetMode === 'new' && (
                            <div className="border-t border-emerald-100 bg-emerald-50/40 px-4 py-4">
                              <p className="mb-2 text-[11px] text-emerald-800">The trip will be named after the equipment you pick below:</p>
                              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                                {[
                                  { label: 'Truck', value: previewTruck ? `#${previewTruck.unitNumber} ${previewTruck.name}` : null },
                                  { label: 'Trailer', value: previewTrailer ? `#${previewTrailer.unitNumber} ${previewTrailer.name}` : null },
                                  { label: 'Driver', value: previewDriver ? previewDriver.name : null },
                                ].map(({ label, value }) => (
                                  <div key={label} className="rounded border border-emerald-200 bg-white px-2 py-1.5">
                                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{label}</p>
                                    <p className="truncate text-slate-700">{value ?? <span className="italic text-slate-400">None selected</span>}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500">Each trip is checked in real time against its remaining deck space and payload capacity.</p>
                    </div>
                  );
                })()}


                <div className="space-y-4 border-t border-slate-200 pt-6">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Driver &amp; Equipment</p>
                  {/* ── Driver Assignment — select first so equipment auto-populates ─── */}
                  <div>
                    <Label htmlFor="assignedDriverId">
                      Assigned Driver
                      {requiresClassACDL && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                          <ShieldAlert className="h-3 w-3" />
                          CDL Only &#8212; Heavy Load
                        </span>
                      )}
                    </Label>
                    <Select 
                      value={loadForm.assignedDriverId || 'none'}
                      onValueChange={(value) => handleSelectChange('assignedDriverId', value === 'none' ? '' : value)}
                    >
                      <SelectTrigger id="assignedDriverId" className={requiresClassACDL ? 'border-amber-300 bg-amber-50/50' : ''}>
                        <SelectValue placeholder="Select Driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Use Global Default)</SelectItem>
                        {availableEligibleDrivers.map(driver => {
                          const dId = getDriverProfileId(driver);
                          return (
                            <SelectItem key={dId} value={dId}>
                              {driver.name}{(driver.cdlStatus ?? 'Non-CDL') === 'Class A CDL' ? ' ✓ CDL' : ''}
                            </SelectItem>
                          );
                        })}
                        {offDutyDrivers.map(driver => {
                          const dId = getDriverProfileId(driver);
                          return (
                            <SelectItem key={dId} value={dId} disabled className="opacity-50 text-slate-400 cursor-not-allowed">
                              {driver.name} (Off Duty — Unavailable)
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const sel = loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none'
                        ? driverProfiles.find(d => d.uid === loadForm.assignedDriverId)
                        : null;
                      if (!sel || !isDriverOffDuty(sel)) return null;
                      return (
                        <p className="text-[11px] text-amber-700 font-bold mt-1 flex items-center gap-1 bg-amber-50 p-1.5 rounded border border-amber-200">
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                          Assigned driver ({sel.name}) is currently Off Duty. Please reassign to an active driver before dispatching.
                        </p>
                      );
                    })()}
                    {hasIneligibleNonCdlDrivers && (
                      <p className="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                        <ShieldX className="h-3 w-3" />
                        Non-CDL drivers are ineligible for this load weight. Only CDL-licensed drivers are shown.
                      </p>
                    )}
                    {/* Auto-fill hint when driver paired equipment was pre-populated */}
                    {(() => {
                      const sel = loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none'
                        ? driverProfiles.find(d => d.uid === loadForm.assignedDriverId)
                        : null;
                      if (!sel) return null;
                      const autoTruck   = sel.assignedTruckId   && sel.assignedTruckId   === loadForm.assignedTruckId;
                      const autoTrailer = sel.assignedTrailerId && sel.assignedTrailerId === loadForm.assignedTrailerId;
                      if (!autoTruck && !autoTrailer) return null;
                      return (
                        <p className="text-[11px] text-blue-600 font-semibold mt-1 flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Truck &amp; trailer auto-filled from driver&apos;s assigned equipment — you can still change them below.
                        </p>
                      );
                    })()}
                  </div>

                  {/* ── Truck + Trailer ─────────────────────────────────────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="assignedTruckId">Assigned Truck</Label>
                      <Select 
                        value={loadForm.assignedTruckId || 'none'}
                        onValueChange={(value) => handleSelectChange('assignedTruckId', value === 'none' ? '' : value)}
                      >
                        <SelectTrigger id="assignedTruckId">
                          <SelectValue placeholder="Select Truck" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Use Global Default)</SelectItem>
                          {vehicles.filter(v => v.type === 'truck').map(truck => (
                            <SelectItem key={truck.id} value={truck.id}>#{truck.unitNumber} {truck.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="assignedTrailerId">Assigned Trailer</Label>
                      <Select 
                        value={loadForm.assignedTrailerId || 'none'}
                        onValueChange={(value) => handleSelectChange('assignedTrailerId', value === 'none' ? '' : value)}
                      >
                        <SelectTrigger id="assignedTrailerId">
                          <SelectValue placeholder="Select Trailer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {vehicles.filter(v => v.type === 'trailer').map(trailer => (
                            <SelectItem key={trailer.id} value={trailer.id}>#{trailer.unitNumber} {trailer.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="mt-4 mb-2">
                    <ComplianceBadges result={complianceResult} />
                  </div>
                </div>

                {/* ── Relocated Route & Mileage Calculation Action Bar ─────────── */}
                {(() => {
                  const originAddress = loadForm.origin as Address | undefined;
                  const destAddress   = loadForm.destination as Address | undefined;
                  const isLocationsPresent = Boolean(originAddress?.city && destAddress?.city);
                  return (
                    <div className="flex flex-wrap items-center justify-end gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        disabled={isCalculatingRoute || !isLocationsPresent}
                        onClick={handleCalculateRouteAndMileage}
                        className="flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCalculatingRoute ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Navigation className="h-4 w-4 text-blue-600" />
                        )}
                        {isCalculatingRoute ? 'Calculating Route…' : 'Calculate Route & Mileage'}
                      </Button>
                      <Button 
                        type="button" 
                        variant="secondary" 
                        size="sm"
                        disabled={!isLocationsPresent}
                        onClick={handleViewRouteOnMap}
                        className="flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>🗺️</span> View Route on Map
                      </Button>
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            {/* Section 6: Special Terms / Notes */}
            <AccordionItem id="section-notes" value="section-notes" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={6} /><FileText className="h-5 w-5 text-slate-600" /> Special Terms / Notes</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-6">
                <div>
                  <Label htmlFor="specialTerms">Special Terms (Optional)</Label>

                  <Textarea
                      id="specialTerms"
                      name="specialTerms"
                      value={loadForm.specialTerms || ''}
                      onChange={handleInputChange}
                      placeholder="Any special instructions or terms for this load..."
                      rows={3}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 7: Outbound Bill of Lading (Active BOL) */}
            <AccordionItem id="section-bol" value="section-bol" className="border border-slate-200 rounded-xl px-5 py-1 bg-white shadow-sm">
              <AccordionTrigger className="hover:no-underline font-bold text-slate-900 text-lg py-4">
                <span className="flex items-center gap-3"><StepBadge n={7} />
                  <FileText className="h-5 w-5 text-indigo-600" /> Outbound Bill of Lading (Active BOL)
                  {loadForm.outboundBolUrl && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <FileCheck className="h-3 w-3" /> Ready for Driver
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-800 mb-1">Active Transit Shipping Document</p>
                  Provide the outbound Bill of Lading (BOL) that the driver will carry digitally and present to the receiver upon arrival.
                  <span className="block mt-1 font-medium text-slate-500">
                    Note: This active shipping document is distinct from the receiver-signed Proof of Delivery (POD) uploaded after drop-off.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option 1: Upload External BOL (Broker Paperwork) */}
                  <div className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-4 ${
                    loadForm.bolSource === 'broker' ? 'border-blue-400 bg-blue-50/40 shadow-xs' : 'border-slate-200 bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <Upload className="h-4 w-4 text-blue-600" /> Upload External BOL
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          Broker Paperwork
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">
                        Upload the broker-provided rate confirmation or signed physical shipping manifest (PDF or image).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="file"
                        ref={outboundFileInputRef}
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleOutboundFileSelect}
                      />
                      <Button
                        type="button"
                        variant={loadForm.bolSource === 'broker' ? 'default' : 'outline'}
                        size="sm"
                        disabled={isUploadingOutboundBol}
                        onClick={() => outboundFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2"
                      >
                        {isUploadingOutboundBol ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Uploading Document…</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            <span>{loadForm.outboundBolUrl && loadForm.bolSource === 'broker' ? 'Replace External BOL' : 'Choose Broker File'}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Option 2: Generate Internal BOL */}
                  <div className={`p-4 rounded-xl border-2 transition-all flex flex-col justify-between gap-4 ${
                    loadForm.bolSource === 'system' ? 'border-emerald-400 bg-emerald-50/40 shadow-xs' : 'border-slate-200 bg-white'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-emerald-600" /> Generate Internal BOL
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Direct / In-House
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">
                        Auto-generate a standard PDF Bill of Lading with full freight specifications (cargo weight, dimensions, origin, destination).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant={loadForm.bolSource === 'system' ? 'default' : 'outline'}
                        size="sm"
                        disabled={isGeneratingOutboundBol}
                        onClick={handleGenerateInternalOutboundBol}
                        className={`w-full flex items-center justify-center gap-2 ${
                          loadForm.bolSource === 'system' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                        }`}
                      >
                        {isGeneratingOutboundBol ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Compiling Internal BOL…</span>
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4" />
                            <span>{loadForm.outboundBolUrl && loadForm.bolSource === 'system' ? 'Re-generate Internal BOL' : 'Auto-Generate PDF BOL'}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Document Status Banner */}
                {loadForm.outboundBolUrl && (
                  <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <FileCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-emerald-950 block">
                          Active BOL Attached: {loadForm.outboundBolFileName || 'Active_BOL_Document.pdf'}
                        </span>
                        <span className="text-emerald-800 text-[11px]">
                          Source: {loadForm.bolSource === 'system' ? 'System Generated (Direct/Internal)' : 'Broker Provided (External Paperwork)'}
                          {loadForm.outboundBolGeneratedAt && ` • Attached ${new Date(loadForm.outboundBolGeneratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={loadForm.outboundBolUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shadow-2xs transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Preview BOL
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setLoadForm(prev => ({
                          ...prev,
                          outboundBolUrl: undefined,
                          outboundBolFileName: undefined,
                          outboundBolGeneratedAt: undefined,
                        }))}
                        className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Remove attached document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* ── HOS Planning Suggestions — suggestions only, never enforced ── */}
          {(() => {
            const assignedDriver = loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none'
              ? driverProfiles.find(d => d.uid === loadForm.assignedDriverId)
              : undefined;
            return (
              <HOSPlanningPanel
                distanceMiles={loadForm.distance}
                averageSpeedMph={settings?.truckAverageSpeed || 55}
                recentOnDutyHours={(assignedDriver as any)?.recentOnDutyHours}
                driverName={assignedDriver?.name}
                defaultCollapsed={true}
              />
            );
          })()}

          {/* Action bar — normal document flow on mobile so it never covers form fields; sticky on desktop */}
          <div className="md:sticky md:bottom-0 md:z-30 mt-6 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm md:shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-slate-500">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Fleet assignment</span>
              <span className="block truncate text-sm font-semibold text-slate-800">
                {loadForm.tripId === 'auto-create'
                  ? 'Starts a new multi-stop trip (this load is stop 1)'
                  : matchedTrip
                    ? `Added to ${matchedTrip.name}`
                    : existingTripPicked
                      ? 'Pick a trip to add this load to'
                      : 'Independent load (not part of a trip)'}
              </span>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
            {loadForm.originalClientRequestId && onDeclineClientRequest && (
              <Button
                type="button"
                variant="outline"
                title="Decline this client request"
                className="w-full sm:w-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setIsDeclineDialogOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4 text-red-500" />
                Decline Request
              </Button>
            )}
            {!isEditMode && (
              <Button
                type="button"
                variant="outline"
                title="Clear this form and start fresh"
                className="w-full sm:w-auto border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                onClick={() => {
                  try { localStorage.removeItem('agy_load_draft'); } catch {}
                  setLoadForm({ ...blankLoadForm });
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Form
              </Button>
            )}
            {isEditMode && onCancelEdit && (
              <Button type="button" variant="outline" onClick={onCancelEdit} disabled={isSubmitting} className="w-full sm:w-auto">
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Edit
              </Button>
            )}
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isEditMode ? 'Update Load' : 'Create Load'}
            </Button>
            </div>
          </div>
        </form>
      </CardContent>

      {/* Decline Client Request Confirmation Dialog */}
      <Dialog open={isDeclineDialogOpen} onOpenChange={setIsDeclineDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Decline Client Load Request
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to decline this request? It will be marked as declined and removed from pending requests. No load will be created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="declineReason" className="text-xs font-semibold text-slate-700">
                Reason for Declining (Optional)
              </Label>
              <Select
                value={selectedDeclineCategory}
                onValueChange={(val) => {
                  setSelectedDeclineCategory(val);
                  if (val !== 'Other / Custom') {
                    setCustomDeclineNote('');
                  }
                }}
              >
                <SelectTrigger id="declineReason" className="mt-1 bg-white">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Insufficient profit / Rate too low">Insufficient profit / Rate too low</SelectItem>
                  <SelectItem value="Logistically not feasible / No truck capacity">Logistically not feasible / No truck capacity</SelectItem>
                  <SelectItem value="Out of service area">Out of service area</SelectItem>
                  <SelectItem value="Scheduling / Timeline conflict">Scheduling / Timeline conflict</SelectItem>
                  <SelectItem value="Other / Custom">Other / Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="declineNotes" className="text-xs font-semibold text-slate-700">
                Additional Notes
              </Label>
              <Textarea
                id="declineNotes"
                value={customDeclineNote}
                onChange={(e) => setCustomDeclineNote(e.target.value)}
                placeholder="Optional notes explaining why this request was declined..."
                className="mt-1 text-xs"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeclineDialogOpen(false)}
            >
              Keep Reviewing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const finalReason = selectedDeclineCategory === 'Other / Custom'
                  ? (customDeclineNote.trim() || 'Declined by dispatcher')
                  : (customDeclineNote.trim()
                      ? `${selectedDeclineCategory} — ${customDeclineNote.trim()}`
                      : selectedDeclineCategory);
                if (loadForm.originalClientRequestId && onDeclineClientRequest) {
                  onDeclineClientRequest(loadForm.originalClientRequestId, finalReason);
                }
                setIsDeclineDialogOpen(false);
              }}
            >
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Scheduled Trip Container Confirmation Modal */}
      <AlertDialog open={!!tripToDelete} onOpenChange={(open) => !open && !isDeletingTrip && setTripToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip Container?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete trip container &ldquo;{tripToDelete?.name}&rdquo;? It has zero active loads attached. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTrip}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingTrip}
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async (e) => {
                e.preventDefault();
                if (!tripToDelete) return;
                setIsDeletingTrip(true);
                try {
                  await handleDeleteTrip(tripToDelete.id);
                  if (loadForm.tripId === tripToDelete.id) {
                    handleSelectChange('tripId', 'none');
                  }
                  setTripToDelete(null);
                } catch (error) {
                  console.error('Failed to delete container:', error);
                } finally {
                  setIsDeletingTrip(false);
                }
              }}
            >
              {isDeletingTrip ? 'Deleting...' : 'Delete Container'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
