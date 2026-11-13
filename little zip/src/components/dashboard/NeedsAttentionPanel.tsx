"use client";

import React from 'react';
import { useApp } from '@/context/AppContext';
import { isDriverOffDuty, type Load } from '@/types';
import { getLoadDisplayId } from '@/lib/displayId';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertTriangle, CheckCircle2, Clock, UserX, Inbox, Timer, ArrowRight, Plus, Users, Settings2, Sparkles, Info,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Drivers with less than this many drive-hours left are flagged. */
const LOW_HOS_HOURS = 3;
/** Max rows shown per category before collapsing into "+N more". */
const ROWS_PER_GROUP = 4;

const PRE_PICKUP_STATUSES = ['pending_approval', 'approved', 'pending', 'client-request-approved'];

const isPast = (iso?: string) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !isNaN(t) && t < Date.now();
};

const prettyStatus = (s?: string) => (s || 'pending').replace(/[-_]/g, ' ');

type Row = {
  key: string;
  title: string;
  detail: string;
  actionLabel: string;
  onClick: () => void;
};

type Group = {
  id: string;
  label: string;
  icon: React.ReactNode;
  tone: string; // tailwind classes for the icon chip
  rows: Row[];
  moreLabel: string;
  onMore: () => void;
};

/**
 * "Needs Attention" — surfaces what the dispatcher should act on right now.
 * Reads straight from existing app state; it does not change any data.
 */
export function NeedsAttentionPanel() {
  const {
    loads, trips, clients, driverProfiles, clientLoadRequests, isFinancialProfileComplete,
    setActiveTab, handleStartEditLoad, setViewClientRequestId, openFleetFinancialSetup,
  } = useApp();

  const activeLoads = loads.filter(l => l.status !== 'delivered');

  const editLoad = (load: Load) => { handleStartEditLoad(load); setActiveTab('loads'); };
  const loadName = (l: Load) => `Load ${getLoadDisplayId(l)}`;
  const route = (l: Load) =>
    `${l.origin?.city || '—'}${l.origin?.state ? `, ${l.origin.state}` : ''} → ${l.destination?.city || '—'}${l.destination?.state ? `, ${l.destination.state}` : ''}`;

  // 1. Loads whose scheduled pickup/delivery has passed but whose status hasn't moved
  const needsStatus = activeLoads.flatMap<Row>(l => {
    if (isPast(l.deliveryDateTime)) {
      return [{
        key: `status-${l.id}`,
        title: loadName(l),
        detail: `Delivery time has passed — still “${prettyStatus(l.status)}”. ${route(l)}`,
        actionLabel: 'Update status',
        onClick: () => editLoad(l),
      }];
    }
    if (PRE_PICKUP_STATUSES.includes(l.status as string) && isPast(l.pickupDateTime)) {
      return [{
        key: `status-${l.id}`,
        title: loadName(l),
        detail: `Pickup time has passed — still “${prettyStatus(l.status)}”. ${route(l)}`,
        actionLabel: 'Update status',
        onClick: () => editLoad(l),
      }];
    }
    return [];
  });

  // 2. Active loads with nobody assigned (a trip-level driver counts as assigned)
  const unassigned = activeLoads
    .filter(l => {
      const direct = l.assignedDriverId && l.assignedDriverId !== 'none';
      const viaTrip = l.tripId ? trips.find(t => t.id === l.tripId)?.assignedDriverId : undefined;
      return !direct && !viaTrip;
    })
    .map<Row>(l => ({
      key: `unassigned-${l.id}`,
      title: loadName(l),
      detail: `No driver assigned. ${route(l)}`,
      actionLabel: 'Assign driver',
      onClick: () => editLoad(l),
    }));

  // 3. Client requests waiting on a decision
  const pendingRequests = clientLoadRequests.filter(r => ['new', 'in_review', 'pending'].includes(r.status as string));
  const openRequests = () => { setViewClientRequestId('all'); setActiveTab('loads'); };
  const requestRows: Row[] = pendingRequests.length > 0 ? [{
    key: 'requests',
    title: `${pendingRequests.length} pending client request${pendingRequests.length === 1 ? '' : 's'}`,
    detail: pendingRequests.some(r => r.status === 'new') ? 'New requests are waiting for you to review and approve.' : 'Requests are in review and need a decision.',
    actionLabel: 'Review requests',
    onClick: openRequests,
  }] : [];

  // 4. Drivers close to their drive-time limit (only when HOS data is available)
  const lowHos = driverProfiles
    .filter(d => !isDriverOffDuty(d) && typeof d.estimatedHosRemaining === 'number' && d.estimatedHosRemaining < LOW_HOS_HOURS)
    .map<Row>(d => ({
      key: `hos-${d.uid}`,
      title: d.name,
      detail: `${Math.max(0, d.estimatedHosRemaining as number).toFixed(1)} hrs of drive time left — plan a rest or handoff.`,
      actionLabel: 'View driver',
      onClick: () => setActiveTab('operations'),
    }));

  const groups: Group[] = [
    { id: 'status', label: 'Needs a status update', icon: <Clock className="h-4 w-4" />, tone: 'bg-amber-100 text-amber-700', rows: needsStatus, moreLabel: 'See all loads', onMore: () => setActiveTab('loads') },
    { id: 'unassigned', label: 'Unassigned loads', icon: <UserX className="h-4 w-4" />, tone: 'bg-red-100 text-red-700', rows: unassigned, moreLabel: 'See all loads', onMore: () => setActiveTab('loads') },
    { id: 'requests', label: 'Client requests', icon: <Inbox className="h-4 w-4" />, tone: 'bg-blue-100 text-blue-700', rows: requestRows, moreLabel: 'Open requests', onMore: openRequests },
    { id: 'hos', label: 'Low hours of service', icon: <Timer className="h-4 w-4" />, tone: 'bg-purple-100 text-purple-700', rows: lowHos, moreLabel: 'Open Command Center', onMore: () => setActiveTab('operations') },
  ].filter(g => g.rows.length > 0);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  // ── Nothing to do ─────────────────────────────────────────────────────────────
  if (total === 0) {
    // Brand-new account: guide toward the first useful action instead of a hollow "all clear"
    if (loads.length === 0) {
      return (
        <Card className="rounded-2xl border-none bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-600"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Welcome — let’s get your first load on the books</h2>
              <p className="text-sm text-slate-500">Your dashboard fills in as you work. Here’s the quickest way to get going:</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button type="button" onClick={() => setActiveTab('loads')} className="rounded-xl border border-blue-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-400 hover:shadow-md">
              <Plus className="mb-2 h-5 w-5 text-blue-600" />
              <p className="text-sm font-bold text-slate-800">Create your first load</p>
              <p className="text-xs text-slate-500">Start tracking revenue and profit.</p>
            </button>
            <button type="button" onClick={() => setActiveTab('clients')} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
              <Users className="mb-2 h-5 w-5 text-slate-600" />
              <p className="text-sm font-bold text-slate-800">{clients.length > 0 ? 'Review your clients' : 'Add a client'}</p>
              <p className="text-xs text-slate-500">So loads can be assigned to them.</p>
            </button>
            {!isFinancialProfileComplete && (
              <button type="button" onClick={openFleetFinancialSetup} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
                <Settings2 className="mb-2 h-5 w-5 text-emerald-600" />
                <p className="text-sm font-bold text-slate-800">Finish fleet setup</p>
                <p className="text-xs text-slate-500">Unlocks accurate rate projections.</p>
              </button>
            )}
          </div>
        </Card>
      );
    }

    return (
      <Card className="flex items-center gap-4 rounded-2xl border-none bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm sm:p-6">
        <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">You’re all caught up</h2>
          <p className="text-sm text-slate-500">No overdue statuses, unassigned loads, pending requests or low-HOS drivers right now.</p>
        </div>
      </Card>
    );
  }

  // ── Items to act on ───────────────────────────────────────────────────────────
  return (
    <Card className="overflow-hidden rounded-2xl border-none shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-700 shrink-0"><AlertTriangle className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-bold text-slate-800">Needs Attention</h2>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="What does Needs Attention mean?"
                    className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition-colors"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3.5 text-xs space-y-2 bg-white border border-slate-200 shadow-md rounded-xl" align="start">
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-blue-600" />
                    What tracks here?
                  </p>
                  <p className="text-slate-600 leading-snug">
                    Real-time operational watchdog. Automatically surfaces unassigned loads, client load requests waiting for approval, overdue pickup/delivery windows, and low driver HOS hours.
                  </p>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    When all loads and drivers are on schedule, this panel automatically clears.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-slate-500">Today’s priorities, most urgent first.</p>
          </div>
        </div>
        <Badge className="bg-amber-500 text-white hover:bg-amber-500">{total} {total === 1 ? 'item' : 'items'}</Badge>
      </div>

      <div className="divide-y divide-slate-100 bg-white">
        {groups.map(g => {
          const shown = g.rows.slice(0, ROWS_PER_GROUP);
          const extra = g.rows.length - shown.length;
          return (
            <section key={g.id} className="px-5 py-3 sm:px-6">
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-lg p-1.5 ${g.tone}`}>{g.icon}</span>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{g.label}</h3>
                <span className="text-xs font-semibold text-slate-400">({g.rows.length})</span>
              </div>
              <ul className="space-y-1">
                {shown.map(r => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={r.onClick}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{r.title}</span>
                        <span className="block truncate text-xs text-slate-500">{r.detail}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">
                        {r.actionLabel} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {extra > 0 && (
                <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-3 text-xs text-blue-600" onClick={g.onMore}>
                  +{extra} more · {g.moreLabel}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}
