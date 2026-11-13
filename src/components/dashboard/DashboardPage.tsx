
import React from 'react';
import { Button } from '@/components/ui/button';

import { MetricCard } from './MetricCard';
import { NeedsAttentionPanel } from './NeedsAttentionPanel';
import { SetupCompleteBanner } from './SetupCompleteBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Truck, 
  Receipt, 
  MapPin, 
  Plus, 
  FileText, 
  PieChart as PieChartIcon, 
  Activity,
  ArrowRight,
  Eye,
  Edit,
  Fuel,
  Info,
  AlertTriangle,
  Clock,
  MessageSquare,
  FileCheck,
  Share2,
  Route as RouteIcon,
} from 'lucide-react';
import { ShareLoadPacketModal } from '@/components/loads/ShareLoadPacketModal';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useApp } from '@/context/AppContext';
import { buildUnifiedExpenses } from '@/lib/expenseLedger';
import { cn, formatAddress } from '@/lib/utils';
import { getLoadDisplayId } from '@/lib/displayId';

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';

import { startOfWeek, format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';

import type { Address } from '@/types';



// Helper functions for week keys (re-used from previous version)
const getWeekKey = (dateString?: string): string | null => {
  if (!dateString) return null;
  try {
    const date = parseISO(dateString); 
    return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  } catch (e) {
    return null;
  }
};

const formatWeekDisplay = (weekKey: string): string => {
  try {
    return `Wk of ${format(parseISO(weekKey), 'MMM d')}`;
  } catch (e) {
    return "Invalid Week";
  }
};

export function DashboardPage() {
  const { 
    loads, expenses, trips, settings, clients, vehicles, driverProfiles, getFuelOptimizationProfit, generateAgreement, generateInvoice,
    handleStartEditLoad, setActiveTab, openHelpTopic,
  } = useApp();



  const [selectedLoadId, setSelectedLoadId] = React.useState<string | null>(null);
  const [packetLoad, setPacketLoad] = React.useState<any>(null);
  const selectedLoad = loads.find(l => l.id === selectedLoadId);




  // Unified expense ledger (matches Expense Tracking & Ledger page)
  const unifiedExpenses = React.useMemo(
    () =>
      buildUnifiedExpenses({
        loads,
        expenses,
        vehicles,
        settings,
        driverProfiles,
      }),
    [loads, expenses, vehicles, settings, driverProfiles]
  );

  const totalIncome = loads.reduce((sum, load) => sum + load.totalAgreedRate, 0);
  const totalCalculatedExpenses = unifiedExpenses.reduce(
    (sum, exp) => sum + (exp.amount || 0),
    0
  );

  // Note: netProfit computed here for reference but currentStats.profit is used in the UI
  const netProfit = totalIncome - totalCalculatedExpenses;
  const activeLoadsCount = loads.filter(l => l.status !== 'delivered').length;

  // Monthly Comparison Logic
  const now = new Date();
  const currentMonth = { start: startOfMonth(now), end: endOfMonth(now) };
  const lastMonth = { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };

  const isInRange = (dateStr: string | undefined, range: { start: Date; end: Date }) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d >= range.start && d <= range.end;
  };

  const calculateStatsForRange = (range: { start: Date, end: Date }) => {
    const filteredLoads = loads.filter(l => 
      l.deliveryDateTime && isWithinInterval(parseISO(l.deliveryDateTime), range)
    );
    
    const revenue = filteredLoads.reduce((sum, l) => sum + l.totalAgreedRate, 0);

    const rangeExpenses = unifiedExpenses.filter(e => isInRange(e.date, range));
    const totalExp = parseFloat(
      rangeExpenses.reduce((sum, e) => sum + (e.amount || 0), 0).toFixed(2)
    );
    const usedEstimatedFuel = rangeExpenses.some(
      e => e.source === 'auto_estimated' && e.category === 'Fuel'
    );

    return {
      revenue,
      expenses: totalExp,
      profit: parseFloat((revenue - totalExp).toFixed(2)),
      usedEstimatedFuel,
    };
  };


  const currentStats = calculateStatsForRange(currentMonth);
  const lastStats = calculateStatsForRange(lastMonth);

  const getChangeInfo = (current: number, previous: number) => {
    if (previous === 0 || !previous) return { text: "No last-month data to compare yet", positive: null };
    const change = ((current - previous) / previous) * 100;
    const isPositive = change >= 0;
    return {
      text: `${Math.abs(change).toFixed(1)}% from last month`,
      positive: isPositive
    };
  };

  const revenueChange = getChangeInfo(currentStats.revenue, lastStats.revenue);
  const expenseChange = getChangeInfo(currentStats.expenses, lastStats.expenses);
  const profitChange = getChangeInfo(currentStats.profit, lastStats.profit);


  // --- Chart Data Preparation ---
  // Line Chart: P&L Trends — aggregated from live load data

  let trendData: { name: string; revenue: number; expenses: number; profit: number; weekKey?: string }[];

  const weeklyAccumulator: Record<string, { revenue: number; expenses: number; profit: number }> = {};

  loads.forEach(load => {
    if (load.deliveryDateTime) {
      const weekKey = getWeekKey(load.deliveryDateTime);
      if (weekKey) {
        if (!weeklyAccumulator[weekKey]) weeklyAccumulator[weekKey] = { revenue: 0, expenses: 0, profit: 0 };
        weeklyAccumulator[weekKey].revenue += load.totalAgreedRate;
      }
    }
  });

  unifiedExpenses.forEach(expense => {
    if (expense.date) {
      const weekKey = getWeekKey(expense.date);
      if (weekKey) {
        if (!weeklyAccumulator[weekKey]) weeklyAccumulator[weekKey] = { revenue: 0, expenses: 0, profit: 0 };
        weeklyAccumulator[weekKey].expenses += expense.amount || 0;
      }
    }
  });

  trendData = Object.entries(weeklyAccumulator)
    .map(([weekKey, vals]) => ({
      name:     formatWeekDisplay(weekKey),
      revenue:  vals.revenue,
      expenses: vals.expenses,
      profit:   Math.max(0, vals.revenue - vals.expenses),
      weekKey,
    }))
    .sort((a, b) => a.weekKey!.localeCompare(b.weekKey!));


  // Pie Chart: Expense Breakdown — aggregated from current month's unified ledger expenses
  const categoryTotals: Record<string, number> = {};
  unifiedExpenses
    .filter(exp => isInRange(exp.date, currentMonth))
    .forEach(expense => {
      const cat = expense.category || 'Other';
      categoryTotals[cat] = parseFloat(((categoryTotals[cat] || 0) + (expense.amount || 0)).toFixed(2));
    });
  const pieData: { name: string; value: number }[] = Object.entries(categoryTotals)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#94a3b8'];

  return (

    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500 pb-8 sm:pb-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
        <div>
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-slate-800 flex items-center gap-2.5 sm:gap-3">
            <Activity className="text-blue-600 h-8 w-8 sm:h-10 sm:w-10 bg-blue-50 p-1.5 sm:p-2 rounded-xl shrink-0" />
            <span>Dashboard Overview</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-500 mt-1 leading-relaxed">
            Welcome back! Here's what's happening with your fleet today.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:flex sm:flex-row gap-2.5 sm:gap-3 w-full lg:w-auto pt-1 sm:pt-0">
          <button
            onClick={() => setActiveTab('loads')}
            className="w-full sm:w-auto min-h-[48px] bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white px-5 py-3 rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Plus className="h-5 w-5 shrink-0" />
            <span>Create New Load</span>
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className="w-full sm:w-auto min-h-[48px] bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-700 px-4 py-3 rounded-xl font-semibold border border-slate-200 shadow-xs transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Receipt className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Add Expense</span>
          </button>
          <button
            onClick={() => setActiveTab('loads')}
            className="w-full sm:w-auto min-h-[48px] bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-700 px-4 py-3 rounded-xl font-semibold border border-slate-200 shadow-xs transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <RouteIcon className="h-4 w-4 text-purple-600 shrink-0" />
            <span>View Active Trips</span>
          </button>
        </div>
      </div>

      {/* Fleet setup status — replaces the forced modal once the checklist is complete */}
      <SetupCompleteBanner />

      {/* Today's priorities */}
      <NeedsAttentionPanel />

      {/* Driver Exception & Notes Alert Banner for Dispatcher */}
      {loads.some(l => l.status !== 'delivered' && (l.driverExceptionFlag || l.driverNote)) && (
        <div className="space-y-3">
          {loads
            .filter(l => l.status !== 'delivered' && (l.driverExceptionFlag || l.driverNote))
            .map(load => (
              <div
                key={`alert-${load.id}`}
                className={cn(
                  "p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm",
                  load.driverExceptionFlag
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-blue-50 border-blue-200 text-blue-900"
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn(
                    "p-2 rounded-xl flex-shrink-0 mt-0.5",
                    load.driverExceptionFlag ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                  )}>
                    {load.driverExceptionFlag ? <AlertTriangle className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">
                        Load {getLoadDisplayId(load)}
                      </span>
                      {load.driverExceptionFlag && (
                        <Badge className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wide">
                          ⚠ {load.driverExceptionFlag}
                        </Badge>
                      )}
                      {load.driverPhase && (
                        <Badge variant="outline" className="text-xs font-semibold bg-white">
                          Phase: {load.driverPhase}
                        </Badge>
                      )}
                    </div>
                    {load.driverNote && (
                      <p className="text-sm font-medium mt-1 italic leading-snug">
                        &ldquo;{load.driverNote}&rdquo;
                      </p>
                    )}
                    <p className="text-[11px] opacity-70 mt-0.5">
                      {load.origin?.city}, {load.origin?.state} → {load.destination?.city}, {load.destination?.state}
                      {load.driverNoteUpdatedAt && (
                        <span> · Updated {new Date(load.driverNoteUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white hover:bg-slate-50 text-xs h-8 border-slate-200"
                    onClick={() => setSelectedLoadId(load.id || null)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> View Details
                  </Button>
                  <Button
                    size="sm"
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs h-8"
                    onClick={() => setActiveTab('loads')}
                  >
                    Manage Load
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Stats Grid */}
      {(() => {
        const fuelOptProfit = getFuelOptimizationProfit();
        const totalProfit = currentStats.profit;
        const hasAnyLoads = loads.length > 0;
        const noRevenue = currentStats.revenue === 0;
        const noExpenses = currentStats.expenses === 0;
        const noProfitData = noRevenue && noExpenses && fuelOptProfit === 0;
        return (
          <div className="space-y-3">
            {noProfitData && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 px-4 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs text-slate-600 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Financial Overview Guide:</strong> Metric cards reflect real-time revenue, operating expenses, and net profit. Values display $0 until your first load is delivered and receipts are logged.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openHelpTopic('expenses')}
                  className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 shrink-0 text-xs self-end sm:self-auto"
                >
                  How profit calculates →
                </button>
              </div>
            )}
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="This Month Revenue"
              value={`$${currentStats.revenue.toLocaleString()}`}
              icon={<DollarSign />}
              variant="revenue"
              emphasis
              changeText={revenueChange.text}
              isPositive={revenueChange.positive}
              onClick={() => setActiveTab('loads')}
              actionLabel={noRevenue && !hasAnyLoads ? 'Create a load' : 'View loads'}
              isEmpty={noRevenue}
              emptyHint={
                !hasAnyLoads
                  ? 'Create your first load to start tracking revenue and profit'
                  : activeLoadsCount > 0
                    ? `No loads delivered this month yet · ${activeLoadsCount} in progress`
                    : 'No loads delivered this month yet'
              }
            />
            <MetricCard
              title="This Month Expenses"
              value={`$${currentStats.expenses.toLocaleString()}`}
              icon={<Receipt />}
              variant="expenses"
              changeText={currentStats.usedEstimatedFuel ? 'Includes est. fuel from load miles' : expenseChange.text}
              isPositive={currentStats.usedEstimatedFuel ? null : (expenseChange.positive === null ? null : !expenseChange.positive)}
              onClick={() => setActiveTab('expenses')}
              actionLabel={noExpenses ? 'Log an expense' : 'View expenses'}
              isEmpty={noExpenses}
              emptyHint="No expenses recorded this month. Log fuel, parts or other costs as they happen."
            />
            <MetricCard
              title="This Month Profit"
              value={`$${totalProfit.toLocaleString()}`}
              icon={<TrendingUp />}
              variant="profit"
              emphasis
              valueClassName={totalProfit < 0 ? 'text-red-600' : 'text-emerald-600'}
              changeText={profitChange.text}
              isPositive={profitChange.positive}
              onClick={() => setActiveTab('loads')}
              actionLabel="View loads"
              isEmpty={noProfitData}
              emptyHint="Profit shows up after your first delivered load"
            />
            <MetricCard
              title="Fuel Optimization Profit"
              value={`$${fuelOptProfit.toLocaleString()}`}
              icon={<Fuel className="text-emerald-600" />}
              variant="revenue"
              changeText="From overlapping loads"
              isPositive={true}
              onClick={() => setActiveTab('loads')}
              actionLabel="View trips"
              isEmpty={fuelOptProfit === 0}
              emptyHint="Savings appear when loads overlap on the same route"
            />
          </div>
        </div>
        );
      })()}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        <Card className="lg:col-span-2 rounded-2xl border-none shadow-sm overflow-hidden w-full">
          <CardHeader className="bg-white border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-700">Profit & Loss Trends</CardTitle>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600"></span> Revenue</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Profit</div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 h-[320px] sm:h-[400px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{fill: '#94a3b8', fontSize: 12}}
                  dx={-10}
                  tickFormatter={(val) => `$${val/1000}k`}
                  domain={[0, 'auto']}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`$${value.toLocaleString()}`, ""]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-none shadow-sm w-full">
          <CardHeader className="bg-white border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-700">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 h-[320px] sm:h-[400px] w-full min-w-0 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                   formatter={(value: any) => [`$${value.toLocaleString()}`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-4 mt-4 w-full">
               {pieData.slice(0, 4).map((entry, index) => (
                 <div key={entry.name} className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                   <span className="text-xs text-slate-500 font-medium truncate">{entry.name}</span>
                 </div>
               ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Loads Table */}
      <Card className="rounded-2xl border-none shadow-sm w-full">
        <CardHeader className="bg-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Recent Loads
          </CardTitle>
          <button 
            onClick={() => setActiveTab('loads')}
            className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center gap-1"
          >
            View All <ArrowRight className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto overflow-y-hidden no-scrollbar">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Load ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Trip #</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Route</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Distance</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loads.slice(0, 5).map((load) => (
                  <tr key={load.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-700 text-sm">{getLoadDisplayId(load)}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {load.tripId ? (() => {
                        const trip = trips.find(t => t.id === load.tripId);
                        return (
                          <Badge variant="outline" className="text-[10px] bg-blue-50/50 border-blue-100 text-blue-700">
                            {trip?.tripNumber ?? `#${load.tripId.substring(0, 7)}`}
                          </Badge>
                        );
                      })() : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                      {clients.find(c => c.id === load.clientId)?.companyName || load.requestedByClientName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">

                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-400" />
                        <span className="truncate max-w-[200px]">{formatAddress(load.origin)} → {formatAddress(load.destination)}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-500">{load.distance} miles</td>

                    <td className="px-6 py-4 font-bold text-slate-800">${load.totalAgreedRate.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        {/* Primary status pill */}
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          load.status === 'delivered' ? "bg-teal-700 text-white" :
                          load.status === 'in-transit' ? "bg-emerald-600 text-white" :
                          (load.status === 'loading' || load.status === 'unloading') ? "bg-blue-100 text-blue-800" :
                          load.status === 'waiting' ? "bg-orange-100 text-orange-800" :
                          (load.status === 'on-break' || load.status === 'idle') ? "bg-slate-100 text-slate-700" :
                          load.status === 'client-request-approved' ? "bg-teal-500 text-white" :
                          "bg-yellow-500 text-white" // pending
                        )}>
                          {load.status.replace('-', ' ')}
                        </span>
                        {load.driverExceptionFlag && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[9px] px-1.5 py-0 font-bold uppercase">
                            ⚠ {load.driverExceptionFlag}
                          </Badge>
                        )}
                        {load.driverNote && !load.driverExceptionFlag && (
                          <span className="text-[10px] text-slate-500 italic flex items-center gap-1 max-w-[130px] truncate" title={load.driverNote}>
                            <MessageSquare className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                            &ldquo;{load.driverNote}&rdquo;
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setSelectedLoadId(load.id || null)}
                          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => {
                            handleStartEditLoad(load);
                            setActiveTab('loads');
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {load.signedBolUrl && (
                          <a 
                            href={load.signedBolUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-purple-600 hover:text-purple-800 transition-colors"
                            title="View & Download Signed BOL / POD"
                          >
                            <FileCheck className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => setPacketLoad(load)}
                          className="p-2 text-indigo-500 hover:text-indigo-700 transition-colors"
                          title="Share / Email Load Packet (Invoice + Signed BOL)"
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                        {load.status === 'delivered' && (
                          <button 
                            onClick={() => generateInvoice(load)}
                            className="p-2 text-emerald-400 hover:text-emerald-600 transition-colors"
                            title="Generate Invoice"
                          >
                            <DollarSign className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Load Details Dialog */}
      <Dialog open={!!selectedLoadId} onOpenChange={(open) => !open && setSelectedLoadId(null)}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl">

          <DialogHeader className="p-6 pb-2 border-b border-slate-50">
            <DialogTitle className="text-xl font-headline flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              Load Details: {selectedLoad ? getLoadDisplayId(selectedLoad) : ''}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Full financial breakdown and operational summary.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-4">


            {selectedLoad && (
              <div className="space-y-4 pb-8">

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Trip #</div>
                    <div className="font-semibold text-blue-700 text-xs">
                      {selectedLoad.tripId
                        ? (trips.find(t => t.id === selectedLoad.tripId)?.tripNumber ?? `#${selectedLoad.tripId.substring(0, 7)}`)
                        : 'None'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Route</div>
                    <div className="font-semibold text-slate-700 text-xs">
                      {formatAddress(selectedLoad.origin)} → {formatAddress(selectedLoad.destination)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Duration</div>
                    <div className="font-semibold text-slate-700 text-xs">{selectedLoad.tripDuration || 1} Days</div>
                  </div>
                </div>

                {/* Driver Dispatch Status & Notes */}
                {(selectedLoad.driverExceptionFlag || selectedLoad.driverNote) && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                    {selectedLoad.driverExceptionFlag && (
                      <div className="bg-red-50 border-b border-red-100 px-3.5 py-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span className="font-bold text-red-700 uppercase tracking-wide">
                          {selectedLoad.driverExceptionFlag}
                        </span>
                      </div>
                    )}
                    {selectedLoad.driverNote && (
                      <div className={`px-3.5 py-2.5 flex items-start gap-2 ${selectedLoad.driverExceptionFlag ? 'bg-red-50/50' : 'bg-blue-50/50'}`}>
                        <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${selectedLoad.driverExceptionFlag ? 'text-red-500' : 'text-blue-500'}`} />
                        <div className="min-w-0">
                          <p className={`font-semibold ${selectedLoad.driverExceptionFlag ? 'text-red-800' : 'text-blue-800'}`}>
                            &ldquo;{selectedLoad.driverNote}&rdquo;
                          </p>
                          {selectedLoad.driverNoteUpdatedAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Driver reported: {new Date(selectedLoad.driverNoteUpdatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <DollarSign className="h-3 w-3 text-emerald-600" /> Financial Breakdown
                  </h3>
                  
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        <tr className="border-b border-slate-50">
                          <td className="px-3 py-1.5 text-slate-600">
                            Base Revenue ({(selectedLoad.distance || 0)} mi @ ${selectedLoad.ratePerMile?.toFixed(2)})
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                            ${((selectedLoad.distance || 0) * (selectedLoad.ratePerMile || 0)).toLocaleString()}
                          </td>
                        </tr>
                        {selectedLoad.requiresTarping && (
                          <tr className="border-b border-slate-50">
                            <td className="px-3 py-1.5 text-slate-600">Tarping Fee</td>
                            <td className="px-3 py-1.5 text-right font-medium text-emerald-600">+${(selectedLoad.tarpingFee || 0).toLocaleString()}</td>
                          </tr>
                        )}
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td className="px-3 py-1.5 font-bold text-slate-700">Total Gross Revenue</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">${selectedLoad.totalAgreedRate.toLocaleString()}</td>
                        </tr>
                        
                        {/* Calculated Direct Expenses */}
                        <tr>
                          <td className="px-3 py-1.5 text-slate-600">Fuel & DEF (Est.)</td>
                          <td className="px-3 py-1.5 text-right text-rose-600">
                            -${((selectedLoad.expenses?.fuel || 0) + (selectedLoad.expenses?.def || 0)).toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 text-slate-600">Payroll ({settings.payrollPercentage}%)</td>
                          <td className="px-3 py-1.5 text-right text-rose-600">-${(selectedLoad.expenses?.payroll || 0).toFixed(2)}</td>
                        </tr>

                      {/* Fleet Overhead — shown from stored load.expenses.recurring breakdown */}
                      <tr>
                        <td className="px-3 py-1.5 text-slate-600">Asset & Fleet Overhead (Share)</td>
                        <td className="px-3 py-1.5 text-right text-rose-600">
                          -${(selectedLoad.expenses?.recurring || 0).toFixed(2)}
                        </td>
                      </tr>

                      {/* Final Calculation */}
                      <tr className="bg-blue-50 font-bold border-t border-blue-100">
                        <td className="px-3 py-2 text-blue-800 text-sm">True Net Profit</td>
                        <td className="px-3 py-2 text-right text-blue-800 text-sm">
                          ${(
                            selectedLoad.totalAgreedRate - 
                            (selectedLoad.expenses?.fuel || 0) - 
                            (selectedLoad.expenses?.def || 0) - 
                            (selectedLoad.expenses?.payroll || 0) - 
                            (selectedLoad.expenses?.recurring || 0)
                          ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>

                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>


          <DialogFooter className="p-4 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedLoadId(null)}>Close</Button>
            <Button 
              size="sm"
              onClick={() => {
                if (selectedLoad) {
                  handleStartEditLoad(selectedLoad);
                  setActiveTab('loads');
                  setSelectedLoadId(null);
                }
              }}
            >
              <Edit className="h-3 w-3 mr-2" /> Edit Load
            </Button>
          </DialogFooter>

        </DialogContent>

      </Dialog>

      <ShareLoadPacketModal
        load={packetLoad}
        client={clients.find(c => c.id === packetLoad?.clientId)}
        settings={settings}
        vehicles={vehicles}
        isOpen={Boolean(packetLoad)}
        onClose={() => setPacketLoad(null)}
      />
    </div>
  );
}


