'use client';

import React, { useState, useMemo } from 'react';
import type { Load } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import {
  Receipt,
  FileSearch,
  ExternalLink,
  Fuel,
  User,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  Truck,
  Search,
  X,
  Filter,
  ArrowUpDown,
  PlusCircle,
  Link2
} from 'lucide-react';
import { formatAddress } from '@/lib/utils';
import type { UnifiedExpenseItem } from '@/lib/expenseLedger';

export type { UnifiedExpenseItem };

interface AdminExpenseDashboardProps {
  expenses: UnifiedExpenseItem[];
  loads: Load[];
  isLoading?: boolean;
  onAddExpenseClick?: () => void;
}

type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export function AdminExpenseDashboard({ 
  expenses, 
  loads, 
  isLoading,
  onAddExpenseClick 
}: AdminExpenseDashboardProps) {
  const [selectedReceipt, setSelectedReceipt] = useState<UnifiedExpenseItem | null>(null);
  
  // Search, filter, and sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loadFilter, setLoadFilter] = useState<'all' | 'linked' | 'overhead'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');

  // KPI Calculations
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const currentMonthExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const d = new Date(exp.date);
      return !isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [expenses, currentYear, currentMonth]);

  const currentMonthTotal = useMemo(() => {
    return currentMonthExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [currentMonthExpenses]);

  const allTimeTotal = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  }, [expenses]);

  const receiptCount = useMemo(() => {
    return expenses.filter(exp => Boolean(exp.receiptUrl)).length;
  }, [expenses]);

  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Unique categories for the filter dropdown
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set).sort();
  }, [expenses]);

  // Filtered & Sorted Expenses List
  const filteredExpenses = useMemo(() => {
    let result = [...expenses];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(exp => {
        const cat = exp.category?.toLowerCase() || '';
        const driver = exp.driverName?.toLowerCase() || '';
        const notes = exp.notes?.toLowerCase() || '';
        const loadNum = exp.loadNumber?.toLowerCase() || '';
        return cat.includes(q) || driver.includes(q) || notes.includes(q) || loadNum.includes(q);
      });
    }

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter(exp => exp.category?.toLowerCase() === selectedCategory.toLowerCase());
    }

    // Load association filter
    if (loadFilter === 'linked') {
      result = result.filter(exp => Boolean(exp.loadId));
    } else if (loadFilter === 'overhead') {
      result = result.filter(exp => !exp.loadId);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === 'date-asc') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === 'amount-desc') {
        return (b.amount || 0) - (a.amount || 0);
      }
      if (sortBy === 'amount-asc') {
        return (a.amount || 0) - (b.amount || 0);
      }
      return 0;
    });

    return result;
  }, [expenses, searchQuery, selectedCategory, loadFilter, sortBy]);

  const getCategoryBadgeClass = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes('fuel')) return 'bg-amber-50 text-amber-800 border-amber-300';
    if (c === 'def') return 'bg-blue-50 text-blue-800 border-blue-300';
    if (c.includes('maint') || c.includes('repair') || c.includes('part')) return 'bg-red-50 text-red-800 border-red-300';
    if (c.includes('payroll')) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    if (c.includes('toll')) return 'bg-purple-50 text-purple-800 border-purple-300';
    if (c.includes('scale')) return 'bg-indigo-50 text-indigo-800 border-indigo-300';
    if (c.includes('tire')) return 'bg-rose-50 text-rose-800 border-rose-300';
    return 'bg-slate-100 text-slate-800 border-slate-300';
  };

  return (
    <div className="space-y-6">
      {/* ── Monthly Summary & Financial KPI Cards ─────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Current Month Total Card */}
        <Card className="border border-slate-200/80 bg-white shadow-2xs rounded-xl overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {monthName}
                </p>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                  ${currentMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-lg border border-amber-500/20 shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-bold text-slate-900">{currentMonthExpenses.length}</span> recorded this month
            </div>
          </CardContent>
        </Card>

        {/* Uploaded Receipts Card */}
        <Card className="border border-slate-200/80 bg-white shadow-2xs rounded-xl overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Receipt Photos
                </p>
                <h3 className="text-xl sm:text-2xl font-extrabold text-emerald-900 mt-1">
                  {receiptCount}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-500/20 shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              Verified for tax records
            </div>
          </CardContent>
        </Card>

        {/* All-Time Logged Total Card */}
        <Card className="border border-slate-200/80 bg-white shadow-2xs rounded-xl overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  All-Time Total
                </p>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                  ${allTimeTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-500/20 shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-bold text-slate-900">{expenses.length}</span> total entries
            </div>
          </CardContent>
        </Card>

        {/* Linked to Loads Card */}
        <Card className="border border-slate-200/80 bg-white shadow-2xs rounded-xl overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Linked to Loads
                </p>
                <h3 className="text-xl sm:text-2xl font-extrabold text-purple-950 mt-1">
                  {linkedToLoadsCount}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-lg border border-purple-500/20 shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-purple-700 font-medium">
              Direct load deductions
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search, Filters & Sorting Bar ─────────────────────────────── */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search category, notes, load #, or driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs border-slate-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Controls: Category, Load Link & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-9 text-xs w-[140px] border-slate-200 bg-white">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Load Association Filter */}
            <Select value={loadFilter} onValueChange={(v: any) => setLoadFilter(v)}>
              <SelectTrigger className="h-9 text-xs w-[145px] border-slate-200 bg-white">
                <SelectValue placeholder="All Expenses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Records</SelectItem>
                <SelectItem value="linked">Linked to Loads</SelectItem>
                <SelectItem value="overhead">General Overhead</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-9 text-xs w-[145px] border-slate-200 bg-white">
                <ArrowUpDown className="h-3 w-3 mr-1 text-slate-400" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Newest First</SelectItem>
                <SelectItem value="date-asc">Oldest First</SelectItem>
                <SelectItem value="amount-desc">Highest Amount</SelectItem>
                <SelectItem value="amount-asc">Lowest Amount</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset Filters shortcut */}
            {(searchQuery || selectedCategory !== 'all' || loadFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setLoadFilter('all');
                }}
                className="h-9 text-xs text-blue-600 hover:text-blue-800 px-2"
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Expense History / List Card ─────────────────────────── */}
      <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
                Expense Ledger & History
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Detailed record of all operating costs, fuel receipts, and load deductions.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 border-slate-200 bg-slate-50 text-slate-700">
            {filteredExpenses.length} {filteredExpenses.length === 1 ? 'Record' : 'Records'}
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          {expenses.length === 0 ? (
            /* Friendly Empty State when NO expenses recorded in system */
            <div className="text-center py-14 px-4 bg-slate-50/50">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
                <Receipt className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No expenses recorded yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Log your first fleet operating expense, driver settlement, or fuel purchase to track costs and load profitability.
              </p>
              {onAddExpenseClick && (
                <Button 
                  onClick={onAddExpenseClick}
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 shadow-xs gap-1.5"
                >
                  <PlusCircle className="h-4 w-4" />
                  Log Your First Expense
                </Button>
              )}
            </div>
          ) : filteredExpenses.length === 0 ? (
            /* Search / Filter Empty State */
            <div className="text-center py-10 px-4 bg-slate-50/60 border-t border-slate-100">
              <FileSearch className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No expenses match your filters</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Try searching for a different keyword or resetting your category filters.
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setLoadFilter('all');
                }}
                className="mt-2 text-xs text-blue-600"
              >
                Clear All Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                  <TableRow>
                    {/* Date */}
                    <TableHead className="w-[110px] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Date
                    </TableHead>
                    {/* Category */}
                    <TableHead className="w-[150px] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Category
                    </TableHead>
                    {/* Amount */}
                    <TableHead className="w-[120px] text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Amount
                    </TableHead>
                    {/* Linked Load */}
                    <TableHead className="min-w-[200px] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Linked Load
                    </TableHead>
                    {/* Notes / Description */}
                    <TableHead className="min-w-[200px] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Notes / Details
                    </TableHead>
                    {/* Source / Driver */}
                    <TableHead className="w-[130px] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Source
                    </TableHead>
                    {/* Receipt */}
                    <TableHead className="w-[110px] text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Receipt
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => {
                    const expenseDate = new Date(expense.date);
                    const formattedDate = !isNaN(expenseDate.getTime())
                      ? expenseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'N/A';

                    // Associated load info
                    const associatedLoad = expense.loadId ? loads.find(l => l.id === expense.loadId) : null;
                    const loadLabel = associatedLoad
                      ? (associatedLoad.loadNumber ? `Load #${associatedLoad.loadNumber}` : `Load #${associatedLoad.id?.slice(0, 6)}`)
                      : expense.loadNumber ? `Load #${expense.loadNumber}` : null;

                    return (
                      <TableRow key={expense.id} className="hover:bg-slate-50/70 transition-colors border-b border-slate-100">
                        {/* 1. Date */}
                        <TableCell className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formattedDate}</span>
                          </div>
                        </TableCell>

                        {/* 2. Category */}
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge
                              variant="outline"
                              className={`font-semibold text-[11px] px-2 py-0.5 rounded-md border ${getCategoryBadgeClass(expense.category)}`}
                            >
                              {expense.category}
                            </Badge>
                            {expense.gallonsPurchased !== undefined && expense.gallonsPurchased > 0 && (
                              <span className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                                <Fuel className="w-3 h-3 text-amber-600" />
                                {expense.gallonsPurchased.toFixed(2)} gal (IFTA)
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 3. Amount */}
                        <TableCell className="text-right text-xs font-extrabold text-slate-900 whitespace-nowrap">
                          ${(expense.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>

                        {/* 4. Linked Load */}
                        <TableCell className="text-xs">
                          {loadLabel ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md text-[11px]">
                                <Truck className="w-3 h-3" />
                                {loadLabel}
                              </span>
                              {associatedLoad && associatedLoad.origin?.city && (
                                <p className="text-[10px] text-slate-500 truncate max-w-[220px]">
                                  {associatedLoad.origin.city}, {associatedLoad.origin.state} → {associatedLoad.destination.city}, {associatedLoad.destination.state}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                              General Fleet Overhead
                            </span>
                          )}
                        </TableCell>

                        {/* 5. Notes / Details */}
                        <TableCell className="text-xs text-slate-600 max-w-xs">
                          <p className="line-clamp-2 text-slate-700 font-medium">
                            {expense.notes || <span className="text-slate-400 italic">No notes</span>}
                          </p>
                        </TableCell>

                        {/* 6. Source / Driver */}
                        <TableCell className="text-xs text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[9px] shrink-0 border border-slate-200">
                              <User className="w-2.5 h-2.5" />
                            </div>
                            <span className="truncate text-[11px] font-medium" title={expense.driverName}>
                              {expense.driverName || 'Fleet Admin'}
                            </span>
                          </div>
                        </TableCell>

                        {/* 7. Receipt */}
                        <TableCell className="text-center whitespace-nowrap">
                          {expense.receiptUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedReceipt(expense)}
                              className="h-7 px-2 text-[11px] font-semibold rounded-lg border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900 shadow-2xs flex items-center gap-1 mx-auto"
                            >
                              <Receipt className="w-3 h-3 text-amber-600" />
                              <span>Receipt</span>
                            </Button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              None
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Receipt Viewer Modal ─────────────────────────────────────── */}
      {selectedReceipt && (
        <ReceiptViewerModal
          isOpen={Boolean(selectedReceipt)}
          onClose={() => setSelectedReceipt(null)}
          receiptUrl={selectedReceipt.receiptUrl || null}
          expenseTitle={`${selectedReceipt.category} Expense`}
          category={selectedReceipt.category}
          amount={selectedReceipt.amount}
          driverName={selectedReceipt.driverName}
          date={selectedReceipt.date}
        />
      )}
    </div>
  );
}
