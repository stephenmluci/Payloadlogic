'use client';

import React, { useMemo, useState } from 'react';
import type { Client, DriverProfile, Expense, Load, Settings, Trip, Vehicle } from '@/types';
import {
  computeArchiveSummary,
  exportArchivedLoadsToCsv,
  exportArchivedLoadsToPdf,
  filterArchivedLoads,
} from '@/lib/loadArchive';
import { LoadCard } from './LoadCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Archive, ArrowLeft, Download, FileSpreadsheet, FileText, RotateCcw, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CompletedLoadsArchiveProps {
  completedLoads: Load[];
  allLoads: Load[];
  clients: Client[];
  settings: Settings;
  vehicles: Vehicle[];
  driverProfiles: DriverProfile[];
  expenses: Expense[];
  trips: Trip[];
  onStatusChange: (id: string, status: Load['status']) => void;
  onUpdateDelivery: (id: string, dt: string) => void;
  onGenerateAgreement: (load: Load) => void;
  onGenerateInvoice: (load: Load) => void;
  onGenerateSettlement: (load: Load) => void;
  onEdit: (load: Load) => void;
  onDelete: (id: string) => Promise<void>;
  calculateVehicleCPM: (vehicleId: string) => number;
  onBack?: () => void;
}

export function CompletedLoadsArchive({
  completedLoads,
  allLoads,
  clients,
  settings,
  vehicles,
  driverProfiles,
  expenses,
  trips,
  onStatusChange,
  onUpdateDelivery,
  onGenerateAgreement,
  onGenerateInvoice,
  onGenerateSettlement,
  onEdit,
  onDelete,
  calculateVehicleCPM,
  onBack,
}: CompletedLoadsArchiveProps) {
  const { toast } = useToast();
  const [loadQuery, setLoadQuery] = useState('');
  const [clientId, setClientId] = useState('all');
  const [month, setMonth] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleMonthChange = (val: string) => {
    setMonth(val);
    if (val && /^\d{4}-\d{2}$/.test(val)) {
      const [y, m] = val.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      setStartDate(`${val}-01`);
      setEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (month) setMonth('');
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (month) setMonth('');
  };

  const applyLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setMonth('');
    setStartDate(fmt(start));
    setEndDate(fmt(end));
  };

  const applyThisMonth = () => {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    handleMonthChange(m);
  };

  const clearFilters = () => {
    setLoadQuery('');
    setClientId('all');
    setMonth('');
    setStartDate('');
    setEndDate('');
  };

  const filteredLoads = useMemo(
    () =>
      filterArchivedLoads(
        completedLoads,
        { loadQuery, clientId, month, startDate, endDate },
        clients,
      ),
    [completedLoads, loadQuery, clientId, month, startDate, endDate, clients],
  );

  const summary = useMemo(() => computeArchiveSummary(filteredLoads), [filteredLoads]);

  const dateRangeLabel = useMemo(() => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Through ${endDate}`;
    if (month) return `Month ${month}`;
    return 'All Dates';
  }, [startDate, endDate, month]);

  const filenameSuffix = useMemo(() => {
    if (startDate && endDate) return `${startDate}_to_${endDate}`;
    if (month) return month;
    return undefined;
  }, [startDate, endDate, month]);

  const handleExportCsv = () => {
    if (filteredLoads.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Loads to Export',
        description: 'Adjust your filters so at least one completed load is selected.',
      });
      return;
    }
    exportArchivedLoadsToCsv(filteredLoads, clients, filenameSuffix);
    toast({
      title: 'CSV Exported',
      description: `Downloaded ${filteredLoads.length} completed load${filteredLoads.length === 1 ? '' : 's'} (${dateRangeLabel}).`,
    });
  };

  const handleExportPdf = async () => {
    if (filteredLoads.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Loads to Export',
        description: 'Adjust your filters so at least one completed load is selected.',
      });
      return;
    }
    setIsExportingPdf(true);
    try {
      await exportArchivedLoadsToPdf(filteredLoads, clients, dateRangeLabel, filenameSuffix);
      toast({
        title: 'PDF Exported',
        description: `Downloaded PDF report for ${filteredLoads.length} completed load${filteredLoads.length === 1 ? '' : 's'}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'PDF Export Failed',
        description: err?.message || 'Could not generate PDF report.',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl sm:text-2xl font-bold font-headline text-slate-900">
              Completed Loads Archive ({filteredLoads.length} of {completedLoads.length})
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Search, filter, and export historical completed loads for taxes and bookkeeping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onBack && (
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Loads
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredLoads.length === 0}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleExportPdf}
            disabled={filteredLoads.length === 0 || isExportingPdf}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="h-4 w-4 mr-1.5" />
            {isExportingPdf ? 'Generating PDF…' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label htmlFor="archive-search" className="text-xs font-semibold text-slate-600">
                Load ID / Route / Cargo
              </Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="archive-search"
                  value={loadQuery}
                  onChange={(e) => setLoadQuery(e.target.value)}
                  placeholder="Search load # or city..."
                  className="pl-8 bg-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="archive-client" className="text-xs font-semibold text-slate-600">
                Client
              </Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="archive-client" className="bg-white">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id!}>
                      {c.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="archive-month" className="text-xs font-semibold text-slate-600">
                Month
              </Label>
              <Input
                id="archive-month"
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="bg-white"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="archive-start-date" className="text-xs font-semibold text-slate-600">
                From Date
              </Label>
              <Input
                id="archive-start-date"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-white"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="archive-end-date" className="text-xs font-semibold text-slate-600">
                To Date
              </Label>
              <Input
                id="archive-end-date"
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={applyLast7Days}>
                Last 7 Days
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={applyThisMonth}>
                This Month
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-slate-600" onClick={clearFilters}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear Filters
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span>
                Revenue: <strong className="text-slate-900">${summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
              <span>
                Expenses: <strong className="text-slate-900">${summary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
              <span>
                Net: <strong className="text-emerald-700">${summary.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
              <span>
                Miles: <strong className="text-slate-900">{summary.totalLoadedMiles.toLocaleString()}</strong>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {filteredLoads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredLoads.map((load) => (
            <LoadCard
              key={load.id}
              load={load}
              client={clients.find((c) => c.id === load.clientId)}
              settings={settings}
              vehicles={vehicles}
              loads={allLoads}
              driverProfiles={driverProfiles}
              expenses={expenses}
              onStatusChange={onStatusChange}
              onUpdateDelivery={onUpdateDelivery}
              trips={trips}
              onGenerateAgreement={onGenerateAgreement}
              onGenerateInvoice={onGenerateInvoice}
              onGenerateSettlement={onGenerateSettlement}
              onEdit={onEdit}
              onDelete={onDelete}
              calculateVehicleCPM={calculateVehicleCPM}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 px-4 bg-white border border-dashed border-slate-200 rounded-2xl">
          <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <h3 className="font-semibold text-slate-800 text-base">No matching archived loads</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            Try clearing or widening your date range, month, client, or load ID filter.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Reset All Filters
          </Button>
        </div>
      )}
    </div>
  );
}
