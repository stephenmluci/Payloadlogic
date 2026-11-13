
import React from 'react';
import { type Client, isDriverOffDuty } from '@/types';
import { getDriverProfileId } from '@/lib/driverAssignment';
import { LoadForm } from './LoadForm';
import { LoadCard } from './LoadCard';
import { ClientLoadRequestCard } from './ClientLoadRequestCard'; 
import { TripManagement } from './TripManagement';
import { TripGroupCard } from './TripGroupCard';
import { DriverAvailability } from './DriverAvailability';
import { PackageOpen, FileInput, Printer, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/context/AppContext';
import { useReactToPrint } from 'react-to-print';
import { SettlementReport } from './SettlementReport';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle2, Sparkles } from 'lucide-react';

export function LoadsPage() {
  const {
    loads, 
    clients, 
    isClientsLoading,
    clientLoadRequests,
    settings,
    expenses,
    loadForm, 
    setLoadForm, 
    editingLoadId,
    handleSaveLoad,
    handleStartEditLoad,
    handleDeleteLoad,
    handleCancelEditLoad,
    updateLoad, 
    generateAgreement,
    generateInvoice,
    approveClientLoadRequest,
    rejectClientLoadRequest,
    isSubmitting: isSubmittingLoad,
    trips,
    addTrip,
    vehicles,
    driverProfiles,
    calculateVehicleCPM,
    viewClientRequestId,
    setViewClientRequestId,
    subscriptionTier,
    setActiveTab
  } = useApp();
  const { toast } = useToast();

  const [innerActiveTab, setInnerActiveTab] = React.useState(editingLoadId ? "createLoad" : "createLoad");

  // Handle cross-component request viewing
  React.useEffect(() => {
    if (viewClientRequestId) {
      setInnerActiveTab('clientRequests');
      
      if (viewClientRequestId !== 'all') {
        // Wait for the tab to render the DOM elements
        setTimeout(() => {
          const el = document.getElementById(`client-request-${viewClientRequestId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add a temporary highlight effect using utility classes
            el.classList.add('ring-4', 'ring-blue-500', 'ring-offset-2', 'rounded-lg', 'transition-all', 'duration-500');
            setTimeout(() => {
              el.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2');
            }, 2000);
          }
        }, 150);
      }
      
      // Clear the trigger so it doesn't fire again unless clicked again
      setViewClientRequestId(null);
    }
  }, [viewClientRequestId, setViewClientRequestId]);

  // ── Auto-create trip link ref ──────────────────────────────────────────────
  // When the user triggers auto-create, we store the new tripId here.
  // A useEffect watches the loads array and links the first unlinked load to
  // the trip, sidestepping the stale-closure problem.
  const pendingTripLink = React.useRef<{ tripId: string; tripName: string; loadCountBefore: number } | null>(null);

  React.useEffect(() => {
    const pending = pendingTripLink.current;
    if (!pending) return;
    if (loads.length <= pending.loadCountBefore) return; // load not yet appended

    // The newly appended load is the last element
    const newLoad = loads[loads.length - 1];
    if (newLoad?.id && !newLoad.tripId) {
      pendingTripLink.current = null; // clear before mutating to avoid loops
      updateLoad(newLoad.id, { tripId: pending.tripId });
      toast({
        title: 'Load created — new multi-stop trip started',
        description: `This load is stop 1 of "${pending.tripName}". Add more loads to it any time using "Add to Existing Trip".`,
      });
    }
  }, [loads, updateLoad, toast]);

  
  const handleDeclineClientRequest = async (requestId: string, reason?: string) => {
    await rejectClientLoadRequest(requestId, reason);
    handleCancelEditLoad();
    setInnerActiveTab('clientRequests');
  };

  const handleLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // -- Validation --
    if (loadForm.assignedTrailerId) {
      const trailer = vehicles.find(v => v.id === loadForm.assignedTrailerId);
      if (trailer) {
        // Enforce max dimensions
        const cargoL = loadForm.cargoLength || 0;
        const cargoW = loadForm.cargoWidth || 0;
        const cargoHRaw = loadForm.cargoHeight || 0;
        const cargoH = cargoHRaw <= 20 ? cargoHRaw * 12 : cargoHRaw;
        const deckH = trailer.deckHeight || 36; // fallback 36 inches

        if (cargoL > 0 && trailer.trailerLength && cargoL > trailer.trailerLength) {
          toast({ variant: 'destructive', title: 'Dimension Error', description: `Cargo length (${cargoL} ft) exceeds trailer length (${trailer.trailerLength} ft).` });
          return;
        }
        if (cargoW > 0 && trailer.trailerWidth && cargoW > trailer.trailerWidth) {
          toast({ variant: 'destructive', title: 'Dimension Error', description: `Cargo width (${cargoW} ft) exceeds trailer width (${trailer.trailerWidth} ft).` });
          return;
        }
        if (cargoH > 0 && (cargoH + deckH) > 162) {
          toast({ variant: 'destructive', title: 'Height Violation', description: `Total height (${((cargoH + deckH) / 12).toFixed(1)} ft / ${cargoH + deckH} in) exceeds 13.5 ft (162 in) legal limit.` });
          return;
        }
      }
    }

    // ── Off-duty driver assignment guard ──────────────────────────────────────
    let resolvedDriverId: string | undefined = undefined;
    if (loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none') {
      const assignedDriver = driverProfiles.find(d => getDriverProfileId(d) === loadForm.assignedDriverId || (loadForm.assignedDriverId && d.name?.toLowerCase() === loadForm.assignedDriverId.toLowerCase()));
      if (assignedDriver) {
        resolvedDriverId = getDriverProfileId(assignedDriver);
        if (isDriverOffDuty(assignedDriver)) {
          toast({
            variant: 'destructive',
            title: 'Assignment Blocked',
            description: `${assignedDriver.name} is currently Off Duty. Cannot assign freight to an off-duty driver.`,
          });
          return;
        }
      }
    } else if (loadForm.assignedTruckId && loadForm.assignedTruckId !== 'none') {
      const driverWithTruck = driverProfiles.find(d => d.assignedTruckId === loadForm.assignedTruckId);
      if (driverWithTruck) {
        resolvedDriverId = getDriverProfileId(driverWithTruck);
      }
    }

    // ── Auto-create trip container ─────────────────────────────────────────────
    // When the user picks "Start New Multi-Stop Trip" (formerly "Auto-Create"), we:
    //   1. Create the new Trip first (get its ID back synchronously)
    //   2. Save the load normally (handleSaveLoad strips 'auto-create' → undefined)
    //   3. Immediately patch the just-saved load's tripId via updateLoad
    if (loadForm.tripId === 'auto-create') {
      const truck   = vehicles.find(v => v.id === loadForm.assignedTruckId  && v.type === 'truck');
      const trailer = vehicles.find(v => v.id === loadForm.assignedTrailerId && v.type === 'trailer');

      const tripName = [
        truck   ? `#${truck.unitNumber} ${truck.name}` : null,
        trailer ? `#${trailer.unitNumber} ${trailer.name}` : null,
      ].filter(Boolean).join(' + ') || 'Auto Trip';

      const tripDateStr = loadForm.pickupDateTime
        ? (loadForm.pickupDateTime.includes('T') ? loadForm.pickupDateTime.split('T')[0] : loadForm.pickupDateTime)
        : new Date().toISOString().split('T')[0];

      // Step 1 — create or reuse the trip container
      const targetTrip = await addTrip({
        name:              `Trip — ${tripName} (${tripDateStr})`,
        date:              tripDateStr,
        loadIds:           [],
        startOdometer:     0,
        status:            'active',
        assignedTruckId:   loadForm.assignedTruckId   || undefined,
        assignedTrailerId: loadForm.assignedTrailerId  || undefined,
        assignedDriverId:  resolvedDriverId || loadForm.assignedDriverId   || undefined,
      });

      // Snapshot the load count BEFORE saving so we can identify the new load afterwards
      const loadCountBefore = loads.length;

      // Store pending link — the useEffect above will fire when loads updates and patch the new load
      pendingTripLink.current = { tripId: targetTrip.id, tripName: targetTrip.name, loadCountBefore };

      // Step 2 — save the load (tripId 'auto-create' is stripped → undefined in AppContext)
      await handleSaveLoad();
      // useEffect handles step 3 (linking the saved load to the trip)
      return;
    }

    // ── Existing trip capacity guard ───────────────────────────────────────────
    if (loadForm.tripId && loadForm.tripId !== 'none') {
      const trip = trips.find(t => t.id === loadForm.tripId);
      if (trip) {
        const tripLoads = loads.filter(l => l.tripId === trip.id && l.id !== editingLoadId && l.status !== 'delivered');
        const effectiveTrailerId = trip.assignedTrailerId || tripLoads[0]?.assignedTrailerId || loadForm.assignedTrailerId;
        const effectiveTrailer = vehicles.find(v => v.id === effectiveTrailerId);
        
        if (effectiveTrailer) {
          const maxWeight = effectiveTrailer.payloadCapacity
            || Math.max(0, (effectiveTrailer.gvwr || 0) - (effectiveTrailer.emptyWeight || 0));

          const usedWeight = tripLoads.reduce((sum, l) => sum + ((l.cargoWeightNum || 0) * (l.cargoQuantity || 1)), 0);
          const newLoadWeight = (loadForm.cargoWeightNum || 0) * (loadForm.cargoQuantity || 1);

          if (maxWeight > 0 && (usedWeight + newLoadWeight) > maxWeight) {
            const excess = (usedWeight + newLoadWeight) - maxWeight;
            toast({
              variant: "destructive",
              title: "Capacity Error",
              description: `Error: Load exceeds available capacity by ${excess.toLocaleString()} lbs.`
            });
            return;
          }
        }
      }
    }

    await handleSaveLoad(); 
  };

  const activeLoads = loads.filter(load => load.status !== 'delivered');
  const completedLoads = loads.filter(load => load.status === 'delivered');

  // Split active loads into multi-stop trips vs. independent loads.
  // A load whose tripId points at a trip that no longer exists is treated as independent.
  const activeTripGroups = React.useMemo(() => {
    const groups: { trip: (typeof trips)[number]; stops: typeof activeLoads }[] = [];
    trips.forEach(trip => {
      const stops = activeLoads.filter(l => l.tripId === trip.id);
      if (stops.length > 0) groups.push({ trip, stops });
    });
    return groups;
  }, [trips, activeLoads]);
  const tripIdsWithStops = new Set(activeTripGroups.map(g => g.trip.id));
  const independentActiveLoads = activeLoads.filter(l => !l.tripId || !tripIdsWithStops.has(l.tripId));
  const isPendingReq = (status: string) => status === 'new' || status === 'in_review' || status === 'pending';
  const newClientRequests = clientLoadRequests.filter(req => isPendingReq(req.status));
  const processedClientRequests = clientLoadRequests.filter(req => !isPendingReq(req.status));

  const getClientForLoad = (load: any): Client | undefined => {
    return clients.find(c => c.id === load.clientId);
  };

  React.useEffect(() => {
    if (editingLoadId) {
      setInnerActiveTab("createLoad");
    }
  }, [editingLoadId]);

  const renderActiveLoadCard = (load: any) => (
    <LoadCard
      key={load.id}
      load={load}
      client={getClientForLoad(load)}
      settings={settings}
      vehicles={vehicles}
      loads={loads}
      driverProfiles={driverProfiles} expenses={expenses}
      onStatusChange={(id, status) => updateLoad(id, { status })}
      onUpdateDelivery={(id, dt) => updateLoad(id, { deliveryDateTime: dt })}
      trips={trips}
      onGenerateAgreement={generateAgreement}
      onGenerateInvoice={generateInvoice}
      onEdit={handleStartEditLoad}
      onDelete={handleDeleteLoad}
      calculateVehicleCPM={calculateVehicleCPM}
      isUpdatingStatus={isSubmittingLoad}
    />
  );

  // Settlement View & Printing Logic
  const componentRef = React.useRef<HTMLDivElement>(null);
  const [settlementLoad, setSettlementLoad] = React.useState<any>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = React.useState(false);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Settlement_Load_${settlementLoad?.loadNumber || settlementLoad?.id}`,
  });

  const handleGenerateSettlement = (load: any) => {
    setSettlementLoad(load);
    setIsSettlementModalOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-headline mb-2">Load Management</h1>
        <p className="text-muted-foreground">Create, track, and manage all your loads, including client requests.</p>
      </div>

      <DriverAvailability />
      
      <Tabs value={innerActiveTab} onValueChange={setInnerActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="createLoad" className="text-xs sm:text-sm py-2 px-1 sm:px-3">{editingLoadId ? 'Edit Load' : 'Create Load'}</TabsTrigger>
          <TabsTrigger value="clientRequests" className="text-xs sm:text-sm py-2 px-1 sm:px-3 flex items-center justify-center gap-1.5">
            Requests ({newClientRequests.length})
            {subscriptionTier === 'starter' && (
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200/80">
                PRO
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tripManagement" className="text-xs sm:text-sm py-2 px-1 sm:px-3">Trips ({trips.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="createLoad">
          <LoadForm 
            loadForm={loadForm}
            setLoadForm={setLoadForm}
            clients={clients}
            trips={trips}
            vehicles={vehicles}
            driverProfiles={driverProfiles}
            loads={loads}
            onSubmit={handleLoadSubmit}
            onCancelEdit={handleCancelEditLoad}
            onDeclineClientRequest={handleDeclineClientRequest}
            isSubmitting={isSubmittingLoad}
            editingLoadId={editingLoadId}
            settings={settings}
            calculateVehicleCPM={calculateVehicleCPM}
            isClientsLoading={isClientsLoading}
            clientLoadRequests={clientLoadRequests}
          />

        </TabsContent>
        <TabsContent value="clientRequests">
          {subscriptionTier === 'starter' ? (
            <Card className="border border-slate-200/90 shadow-md bg-white rounded-2xl overflow-hidden mt-2">
              <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-12 w-12 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-400" />
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-bold px-2.5 py-1">
                    Fleet Pro Feature
                  </Badge>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight">
                  Client Portal &amp; Shipper Load Requests
                </h2>
                <p className="text-slate-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
                  Provide your shippers and freight brokers a self-service digital portal to submit load requests directly into your dispatch queue with 1-click dispatch approvals.
                </p>
              </div>

              <CardContent className="p-6 sm:p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <FileInput className="h-4 w-4 text-blue-600" />
                      Direct Shipper Self-Service
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Shippers submit origins, destinations, weights, dimensions, and target pickup dates directly into your dashboard.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      1-Click Dispatch Conversion
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Convert incoming shipper requests into dispatched loads with a single click, automatically pre-filling all cargo and route data.
                    </p>
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-500 block">Current Plan: <strong className="text-slate-800">Starter ($49/mo)</strong></span>
                    <span className="text-xs text-slate-700">Upgrade to <strong>Fleet Pro ($99/mo)</strong> to unlock the Client Portal, Live Command Center, and up to 3 trucks.</span>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => setActiveTab('billing')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md gap-2 shrink-0"
                  >
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    Upgrade to Fleet Pro ($99/mo)
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          <div className="mt-2 space-y-6">

            {/* ── Pending Requests ── */}
            <div>
              <h2 className="text-lg sm:text-xl font-semibold font-headline mb-1">
                Pending Requests
                {newClientRequests.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5">
                    {newClientRequests.length} new
                  </span>
                )}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Click <strong>Approve &amp; Create Load</strong> to pre-fill the Create Load form with this request's details.
                The request will be removed from this list once processed.
              </p>

              {newClientRequests.length > 0 ? (
                <ScrollArea className="h-[450px] pr-2">
                  <div className="space-y-4 pr-2">
                    {newClientRequests.map(request => (
                      <div id={`client-request-${request.id}`} key={request.id}>
                        <ClientLoadRequestCard
                          request={request}
                          onApprove={(req) => {
                            approveClientLoadRequest(req);
                            setInnerActiveTab("createLoad");
                          }}
                          onReject={rejectClientLoadRequest}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 bg-card rounded-lg border border-dashed text-center">
                  <FileInput className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="font-medium text-muted-foreground">No pending client load requests</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    When clients submit a load request from their portal, it will appear here.
                  </p>
                </div>
              )}
            </div>

            {/* ── Processed Requests ── */}
            {processedClientRequests.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-muted-foreground mb-3">
                  Previously Processed ({processedClientRequests.length})
                </h3>
                <ScrollArea className="h-[320px] pr-2">
                  <div className="space-y-3 pr-2">
                    {processedClientRequests.map(request => (
                      <div id={`client-request-${request.id}`} key={request.id}>
                        <ClientLoadRequestCard
                          request={request}
                          onApprove={approveClientLoadRequest}
                          isProcessed={true}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          )}
        </TabsContent>
        <TabsContent value="tripManagement">
          <div className="mt-4">
            <TripManagement />
          </div>
        </TabsContent>
      </Tabs>

      
      <div className="mt-10">
          <h2 className="text-xl sm:text-2xl font-semibold font-headline mb-1">Active Loads ({activeLoads.length})</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Multi-stop trips are grouped together. Expand a trip to see and manage every stop.
          </p>
        {activeLoads.length > 0 ? (
          <div className="space-y-8">
            {activeTripGroups.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-purple-700">
                  Multi-Stop Trips ({activeTripGroups.length})
                </h3>
                <div className="space-y-4">
                  {activeTripGroups.map(({ trip, stops }) => (
                    <TripGroupCard
                      key={trip.id}
                      trip={trip}
                      stops={stops}
                      vehicles={vehicles}
                      driverProfiles={driverProfiles}
                      renderLoadCard={renderActiveLoadCard}
                    />
                  ))}
                </div>
              </section>
            )}

            {independentActiveLoads.length > 0 && (
              <section className="space-y-3">
                {activeTripGroups.length > 0 && (
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                    Independent Loads ({independentActiveLoads.length})
                  </h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {independentActiveLoads.map(load => (
                    <React.Fragment key={load.id}>{renderActiveLoadCard(load)}</React.Fragment>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-white border border-dashed border-slate-200 rounded-2xl shadow-xs">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <PackageOpen className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-slate-800 text-base">No active loads right now</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Create a new load using the form above or approve incoming client requests to start dispatching.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setInnerActiveTab("createLoad");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="text-xs font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 rounded-lg"
            >
              Go to Create Load
            </Button>
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-xl sm:text-2xl font-semibold font-headline mb-4">Completed Loads ({completedLoads.length})</h2>
        {completedLoads.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {completedLoads.map(load => (
              <LoadCard 
                key={load.id}
                load={load}
                client={getClientForLoad(load)}
                settings={settings}
                vehicles={vehicles}
                loads={loads}
                driverProfiles={driverProfiles} expenses={expenses}
                onStatusChange={(id, status) => updateLoad(id, { status })}
                onUpdateDelivery={(id, dt) => updateLoad(id, { deliveryDateTime: dt })}
                trips={trips}
                onGenerateAgreement={generateAgreement}
                onGenerateInvoice={generateInvoice}
                onGenerateSettlement={handleGenerateSettlement}
                onEdit={handleStartEditLoad}
                onDelete={handleDeleteLoad}
                calculateVehicleCPM={calculateVehicleCPM}
                isUpdatingStatus={isSubmittingLoad}
              />
            ))}
          </div>
        ) : (
           <div className="text-center py-12 px-4 bg-white border border-dashed border-slate-200 rounded-2xl shadow-xs">
            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <PackageOpen className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-slate-700 text-base">No completed loads yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              Delivered loads and verified trips will appear here automatically for historical record-keeping and settlement generation.
            </p>
          </div>
        )}
      </div>

      {/* Interactive Settlement View Modal */}
      <Dialog open={isSettlementModalOpen} onOpenChange={setIsSettlementModalOpen}>
        <DialogContent className="max-w-4xl w-full p-0 max-h-[90vh] flex flex-col bg-white overflow-hidden rounded-2xl shadow-2xl">
          <DialogHeader className="bg-slate-900 text-white p-4 flex flex-row items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <DialogTitle className="text-base font-bold text-white">
                Driver Settlement & Route Expense Ledger — Load #{settlementLoad?.loadNumber || settlementLoad?.id?.substring(0, 8)}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 mr-6">
              <Button
                size="sm"
                onClick={() => handlePrint()}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Save PDF
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
            {settlementLoad && (
              <SettlementReport
                load={settlementLoad}
                driver={driverProfiles.find(d => d.uid === settlementLoad.assignedDriverId)}
                truck={vehicles.find(v => v.id === settlementLoad.assignedTruckId)}
                trailer={vehicles.find(v => v.id === settlementLoad.assignedTrailerId)}
                settings={settings}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden Settlement Report for Printing */}
      <div style={{ display: 'none' }}>
        {settlementLoad && (
          <SettlementReport 
            ref={componentRef}
            load={settlementLoad}
            driver={driverProfiles.find(d => d.uid === settlementLoad.assignedDriverId)}
            truck={vehicles.find(v => v.id === settlementLoad.assignedTruckId)}
            trailer={vehicles.find(v => v.id === settlementLoad.assignedTrailerId)}
            settings={settings}
          />
        )}
      </div>
    </div>
  );
}
