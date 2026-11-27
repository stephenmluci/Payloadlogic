'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useApp } from '@/context/AppContext';
import { isOwnerEmail } from '@/lib/authConfig';
import { formatUsd } from '@/lib/pricing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, Loader2, RefreshCw, ShieldCheck, Timer, UserPlus, Users } from 'lucide-react';
import type { OwnerAccountRow } from '@/app/api/admin/subscriptions/route';

interface OverviewPayload {
  summary: {
    totalAccounts: number;
    activeTrials: number;
    paidSubscriptions: number;
    newSignupsLast30Days: number;
  };
  revenue: {
    totalRevenueCents: number;
    byPlan: { planType: string; count: number; revenueCents: number }[];
  };
  accounts: OwnerAccountRow[];
}

export function OwnerSubscriptionOverview() {
  const { user, isOwnerOrAdmin } = useApp();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canView = Boolean(isOwnerOrAdmin && isOwnerEmail(user?.email));

  const fetchOverview = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Sign in required to load subscription overview.');
        return;
      }
      const res = await fetch('/api/admin/subscriptions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Failed to load subscription overview.');
        return;
      }
      setData(json as OverviewPayload);
    } catch (err: any) {
      setError(err?.message || 'Failed to load subscription overview.');
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (!canView) return null;

  const statusBadge = (status: OwnerAccountRow['status']) => {
    if (status === 'active') {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100">Active</Badge>;
    }
    if (status === 'canceled') {
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100">Canceled</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Expired</Badge>;
  };

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/40 via-white to-white shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-indigo-100">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">
              Owner Subscription &amp; Revenue Overview
            </CardTitle>
          </div>
          <CardDescription className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Private owner-only view of all accounts, 14-day trials, paid plans, and revenue.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchOverview}
          disabled={isLoading}
          className="self-start sm:self-auto bg-white"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {isLoading && !data ? (
          <div className="flex items-center justify-center py-10 text-sm text-slate-500 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            Loading subscription metrics…
          </div>
        ) : data ? (
          <>
            {/* Summary Counts */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Total Accounts</span>
                  <Users className="h-4 w-4 text-slate-400" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-1">{data.summary.totalAccounts}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Active 14-Day Trials</span>
                  <Timer className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-amber-700 mt-1">{data.summary.activeTrials}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Paid Subscriptions</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{data.summary.paidSubscriptions}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>New Sign-Ups (30d)</span>
                  <UserPlus className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-blue-700 mt-1">{data.summary.newSignupsLast30Days}</p>
              </div>
            </div>

            {/* Revenue Summary & By Plan */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                  <DollarSign className="h-4 w-4" />
                  Total Subscription Revenue
                </div>
                <p className="text-3xl font-extrabold text-emerald-900 mt-1">
                  {formatUsd(data.revenue.totalRevenueCents)}
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Across {data.summary.paidSubscriptions} active paid subscription{data.summary.paidSubscriptions === 1 ? '' : 's'}
                </p>
              </div>

              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  Revenue by Plan Type
                </p>
                {data.revenue.byPlan.length === 0 ? (
                  <p className="text-xs text-slate-500">No paid subscriptions recorded yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.revenue.byPlan.map((p) => (
                      <div
                        key={p.planType}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{p.planType}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.count} account{p.count === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="font-bold text-slate-900">{formatUsd(p.revenueCents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Accounts List */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Accounts ({data.accounts.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Email / Company</th>
                      <th className="py-2.5 px-4 font-semibold">Plan Type</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.accounts.map((acct) => (
                      <tr key={acct.uid} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-slate-900">{acct.companyName}</p>
                          {acct.email && acct.email !== acct.companyName && (
                            <p className="text-[11px] text-slate-500">{acct.email}</p>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-700">{acct.planType}</td>
                        <td className="py-2.5 px-4">{statusBadge(acct.status)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                          {acct.amountPaidCents > 0 ? formatUsd(acct.amountPaidCents) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
