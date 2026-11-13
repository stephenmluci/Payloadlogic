
import React from 'react';
import type { ClientLoadRequest } from '@/types';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, CalendarDays, User, PackageCheck, AlertCircle, CheckCircle2, Hourglass, Package as CargoIcon, Mail, Phone, XCircle, StickyNote, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatAddress } from '@/lib/utils';


type ClientLoadRequestCardProps = {
  request: ClientLoadRequest;
  onApprove: (request: ClientLoadRequest) => void;
  onReject?: (requestId: string) => void;
  isProcessed?: boolean;
};

const statusConfig: Record<string, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  new:       { label: 'Pending Review', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',    icon: <Hourglass   className="h-3 w-3 mr-1" /> },
  pending:   { label: 'Pending Review', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',    icon: <Hourglass   className="h-3 w-3 mr-1" /> },
  in_review: { label: 'In Review',      badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
  viewed:    { label: 'Viewed',         badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
  accepted:  { label: 'Approved',       badgeClass: 'bg-green-100 text-green-800 border-green-200',  icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
  rejected:  { label: 'Declined',       badgeClass: 'bg-red-100 text-red-800 border-red-200',        icon: <XCircle     className="h-3 w-3 mr-1" /> },
};

const formatDateDisplay = (isoString?: string) => {
  if (!isoString) return 'N/A';
  try { return format(new Date(isoString), 'PPp'); } catch { return 'Invalid Date'; }
};

const formatSubmissionDate = (ts: any): string => {
  if (!ts) return 'N/A';
  if (typeof ts.toDate === 'function') {
    try { return format(ts.toDate(), 'PPP p'); } catch { return 'N/A'; }
  }
  if (typeof ts === 'string') {
    try { return format(new Date(ts), 'PPP p'); } catch { return 'N/A'; }
  }
  return 'N/A';
};


const placementLabels: Record<string, string> = {
  standard: 'Standard (Floor)',
  stacked: 'Stacked (2-High)',
  nested: 'Nested / Compact',
};

export function ClientLoadRequestCard({ request, onApprove, onReject, isProcessed }: ClientLoadRequestCardProps) {
  const { clients } = useApp();
  const sc = statusConfig[request.status] ?? { label: request.status, badgeClass: 'bg-gray-100 text-gray-700 border-gray-200', icon: <AlertCircle className="h-3 w-3 mr-1" /> };

  const reqClientId = String(request.clientId || '').trim();
  const cleanReqId = reqClientId.replace(/^#/, '');

  const matchedClient = React.useMemo(() => {
    if (!reqClientId) return null;
    return clients.find(c => {
      const cId = String(c.id || '').trim();
      const cCleanId = cId.replace(/^#/, '');
      const cClientId = (c as any).clientId ? String((c as any).clientId).trim().replace(/^#/, '') : '';
      return cId === reqClientId || cCleanId === cleanReqId || (cClientId && cClientId === cleanReqId);
    }) || null;
  }, [clients, reqClientId, cleanReqId]);

  // Strictly display matched client company name. Never display email.
  const displayCompanyName = matchedClient?.companyName || (request.companyName && !request.companyName.includes('@') ? request.companyName : '');

  return (
    <Card className={`shadow-md hover:shadow-lg transition-shadow duration-300 ${request.status === 'rejected' ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <CardTitle className="text-base font-headline flex items-center min-w-0">
            <MapPin className="h-4 w-4 mr-2 text-primary shrink-0" />
            <span className="truncate">
              {formatAddress(request.origin, 'short')} → {formatAddress(request.destination, 'short')}
            </span>
          </CardTitle>
          <Badge variant="outline" className={`${sc.badgeClass} flex items-center text-xs px-2 py-0.5 shrink-0`}>
            {sc.icon} {sc.label}
          </Badge>
        </div>
        {displayCompanyName ? (
          <div className="flex items-center text-sm font-semibold text-slate-900 mt-1.5">
            <Building2 className="h-4 w-4 mr-1.5 text-blue-600 shrink-0" />
            <span>{displayCompanyName}</span>
            {request.clientId && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(ID: {request.clientId})</span>
            )}
          </div>
        ) : (
          <div className="flex items-center text-xs text-amber-600 font-medium mt-1.5">
            <AlertCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span>
              {request.clientId ? `Unknown Client Profile (ID: ${request.clientId})` : 'Legacy Request — Missing Client ID'}
            </span>
          </div>
        )}
        <CardDescription className="text-xs mt-1">
          Submitted on {formatSubmissionDate(request.submissionTimestamp)}
          {request.requestContactName && ` by ${request.requestContactName}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {/* Cargo & Freight Specs */}
        <div className="space-y-1.5 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5">
          <div className="flex items-start text-muted-foreground">
            <CargoIcon className="h-4 w-4 mr-2 mt-0.5 shrink-0 text-primary" />
            <div>
              <span className="font-semibold text-foreground">Commodity:</span>{' '}
              <span className="text-foreground">{request.cargoDescription}</span>
            </div>
          </div>

          {(request.cargoWeightNum !== undefined || request.cargoLength !== undefined || request.cargoQuantity !== undefined) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200 text-xs text-slate-700">
              {request.cargoQuantity !== undefined && (
                <div>
                  <span className="text-muted-foreground">Qty: </span>
                  <span className="font-medium text-foreground">{request.cargoQuantity} unit{request.cargoQuantity > 1 ? 's' : ''}</span>
                </div>
              )}
              {request.cargoWeightNum !== undefined && (
                <div>
                  <span className="text-muted-foreground">Weight: </span>
                  <span className="font-medium text-foreground">
                    {((request.cargoWeightNum || 0) * (request.cargoQuantity || 1)).toLocaleString()} lbs
                  </span>
                  {request.cargoQuantity && request.cargoQuantity > 1 && (
                    <span className="text-[10px] text-muted-foreground ml-1">({request.cargoWeightNum.toLocaleString()} ea)</span>
                  )}
                </div>
              )}
              {(request.cargoLength !== undefined || request.cargoWidth !== undefined || request.cargoHeight !== undefined) && (
                <div>
                  <span className="text-muted-foreground">Dims: </span>
                  <span className="font-medium text-foreground">
                    {[
                      request.cargoLength !== undefined ? `${request.cargoLength}L` : '',
                      request.cargoWidth !== undefined ? `${request.cargoWidth}W` : '',
                      request.cargoHeight !== undefined ? `${request.cargoHeight}H` : '',
                    ].filter(Boolean).join(' × ')} ft
                  </span>
                </div>
              )}
              {request.placementMode && (
                <div className="sm:col-span-3 flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5">
                  <span className="font-medium text-slate-600">Placement:</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                    {placementLabels[request.placementMode] || request.placementMode}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-start text-muted-foreground">
            <CalendarDays className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs uppercase tracking-wide">Requested Pickup</p>
              <p>{formatDateDisplay(request.requestedPickupDateTime)}</p>
            </div>
          </div>
          <div className="flex items-start text-muted-foreground">
            <CalendarDays className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs uppercase tracking-wide">Requested Delivery</p>
              <p>{formatDateDisplay(request.requestedDeliveryDateTime)}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(request as any).notes && (
          <div className="flex items-start text-muted-foreground">
            <StickyNote className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
            <div><span className="font-medium text-foreground">Notes:</span>{' '}{(request as any).notes}</div>
          </div>
        )}

        {/* Contact */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Company &amp; Contact</p>
          <div className="space-y-1">
            {displayCompanyName ? (
              <div className="flex items-center text-muted-foreground gap-2">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span className="font-semibold text-foreground">{displayCompanyName}</span>
                {request.clientId && (
                  <span className="text-xs text-muted-foreground">(ID: {request.clientId})</span>
                )}
              </div>
            ) : (
              <div className="flex items-center text-amber-600 gap-2 text-xs">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Client ID: {request.clientId || 'Missing (Legacy Test Request)'}</span>
              </div>
            )}
            {request.requestContactName && (
              <div className="flex items-center text-muted-foreground gap-2">
                <User className="h-3.5 w-3.5 shrink-0" /> {request.requestContactName}
              </div>
            )}
            {request.requestContactEmail && (
              <div className="flex items-center text-muted-foreground gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <a href={`mailto:${request.requestContactEmail}`} className="hover:underline text-blue-600">
                  {request.requestContactEmail}
                </a>
              </div>
            )}
            {request.requestContactPhone && (
              <div className="flex items-center text-muted-foreground gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <a href={`tel:${request.requestContactPhone}`} className="hover:underline">
                  {request.requestContactPhone}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Show linked load if approved */}
        {request.status === 'accepted' && (request as any).createdLoadId && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
            ✅ Load created — ID: {(request as any).createdLoadId}
          </p>
        )}
      </CardContent>

      {/* Action buttons — only for pending (new, pending, or in_review) requests */}
      {!isProcessed && ['new', 'pending', 'in_review'].includes(request.status) && (
        <CardFooter className="pt-3 border-t flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onApprove(request)}
          >
            <PackageCheck className="h-4 w-4 mr-2" />
            {request.status === 'in_review' ? 'Continue Review' : 'Review & Create Load'}
          </Button>
          {onReject && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onReject(request.id!)}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Decline
            </Button>
          )}
        </CardFooter>
      )}

      {/* Processed state footer */}
      {(isProcessed || !['new', 'pending', 'in_review'].includes(request.status)) && !['new', 'pending', 'in_review'].includes(request.status) && (
        <CardFooter className="pt-3 border-t">
          <p className="text-xs text-muted-foreground italic">
            {request.status === 'accepted' ? '✅ Approved — load successfully created from this request.' : ''}
            {request.status === 'rejected' ? '❌ Declined — this request will not be processed.' : ''}
            {request.status === 'viewed' ? 'Viewed by admin.' : ''}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
