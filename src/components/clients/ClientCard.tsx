import React from 'react';
import type { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, User, Mail, Phone, PackagePlus, MapPin, Pin, PinOff, Trash2, Pencil, Package } from 'lucide-react';
import { cn, formatAddress, formatPhoneNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type ClientCardProps = {
  client: Client;
  loadCount?: number;
  activeLoadCount?: number;
  onCreateLoad: (client: Client) => void;
  onTogglePin: () => void;
  onEdit?: (client: Client) => void;
  onDelete: () => void;
};

export function ClientCard({ 
  client, 
  loadCount = 0, 
  activeLoadCount = 0, 
  onCreateLoad, 
  onTogglePin, 
  onEdit, 
  onDelete 
}: ClientCardProps) {

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${client.companyName}"? This action cannot be undone.`)) {
      onDelete();
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(client);
    }
  };

  const formattedPhone = formatPhoneNumber(client.contactPhone);
  const displayAddress = client.address ? formatAddress(client.address, 'full') : null;

  return (
    <Card 
      className={cn(
        "group flex flex-col justify-between rounded-xl border transition-all duration-200 bg-white hover:shadow-md",
        client.isPinned 
          ? "border-amber-200/80 bg-gradient-to-b from-amber-50/20 to-white shadow-xs" 
          : "border-slate-200 hover:border-slate-300"
      )}
    >
      {/* ── Card Header ────────────────────────────────────────────── */}
      <CardHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* Company Identity */}
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs",
              client.isPinned 
                ? "bg-amber-100/80 text-amber-800 border-amber-200" 
                : "bg-blue-50 text-blue-600 border-blue-100"
            )}>
              <Building2 className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CardTitle 
                  className="text-base font-bold text-slate-900 truncate leading-snug" 
                  title={client.companyName}
                >
                  {client.companyName}
                </CardTitle>
                {client.isPinned && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100/70 text-amber-800 border-amber-300 font-semibold gap-0.5">
                    Pinned
                  </Badge>
                )}
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-2 mt-1">
                {loadCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    <Package className="h-3 w-3 text-slate-500" />
                    {loadCount} {loadCount === 1 ? 'load' : 'loads'}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    No loads yet
                  </span>
                )}
                {activeLoadCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {activeLoadCount} in transit
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action icon buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Pin Button */}
            <Button 
              type="button"
              variant="ghost" 
              size="icon" 
              onClick={onTogglePin}
              className={cn(
                "h-8 w-8 rounded-lg transition-colors",
                client.isPinned 
                  ? "text-amber-600 bg-amber-100/60 hover:bg-amber-200/80" 
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              )}
              title={client.isPinned ? "Unpin Shipper" : "Pin Shipper to Top"}
            >
              {client.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>

            {/* Edit Button */}
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleEdit}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Edit Client Information"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Delete Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete Client"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* ── Card Body / Key Contact Details ───────────────────────── */}
      <CardContent className="p-4 pt-1 pb-3 space-y-2.5 text-xs">
        {/* Primary Contact Person */}
        <div className="flex items-center gap-2 bg-slate-50/80 rounded-lg p-2 border border-slate-100">
          <User className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider block">Primary Contact</span>
            <span className="font-semibold text-slate-800 truncate block text-xs">
              {client.contactName || 'No contact named'}
            </span>
          </div>
        </div>

        {/* Contact Info Grid */}
        <div className="space-y-1.5 pl-0.5">
          {/* Phone */}
          <div className="flex items-center text-slate-600">
            <Phone className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
            {client.contactPhone ? (
              <a 
                href={`tel:${client.contactPhone}`} 
                className="hover:text-blue-600 hover:underline font-medium text-slate-700 truncate"
                title={`Call ${client.contactPhone}`}
              >
                {formattedPhone || client.contactPhone}
              </a>
            ) : (
              <span className="text-slate-400 italic">No phone provided</span>
            )}
          </div>

          {/* Email */}
          <div className="flex items-center text-slate-600">
            <Mail className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0" />
            {client.contactEmail ? (
              <a 
                href={`mailto:${client.contactEmail}`} 
                className="hover:text-blue-600 hover:underline font-medium text-slate-700 truncate"
                title={`Email ${client.contactEmail}`}
              >
                {client.contactEmail}
              </a>
            ) : (
              <span className="text-slate-400 italic">No email provided</span>
            )}
          </div>

          {/* Physical / Facility Address */}
          <div className="flex items-start text-slate-600 pt-0.5">
            <MapPin className="h-3.5 w-3.5 mr-2 text-slate-400 shrink-0 mt-0.5" />
            {displayAddress && displayAddress !== 'N/A' ? (
              <span className="text-slate-600 leading-tight line-clamp-2" title={displayAddress}>
                {displayAddress}
              </span>
            ) : (
              <span className="text-slate-400 italic">No address on file</span>
            )}
          </div>
        </div>
      </CardContent>

      {/* ── Card Footer / Prominent Action ──────────────────────────── */}
      <CardFooter className="p-3 bg-slate-50/70 border-t border-slate-100 rounded-b-xl">
        <Button 
          type="button"
          onClick={() => onCreateLoad(client)}
          className={cn(
            "w-full h-9 font-semibold text-xs shadow-2xs flex items-center justify-center gap-1.5 transition-all",
            client.isPinned
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          )}
        >
          <PackagePlus className="h-4 w-4" />
          Create Load for this Client
        </Button>
      </CardFooter>
    </Card>
  );
}
