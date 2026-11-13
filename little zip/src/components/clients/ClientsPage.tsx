import React, { useState, useMemo } from 'react';
import { ClientForm } from './ClientForm';
import { ClientCard } from './ClientCard';
import { 
  Users2, 
  Plus, 
  Search, 
  X, 
  Pin, 
  Building2, 
  Package, 
  ChevronDown, 
  ChevronUp, 
  Edit3, 
  MapPin, 
  User, 
  Mail, 
  Phone,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Client, Address } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { AddressFields } from '../common/AddressFields';
import { sanitizePhoneDigits, handlePhonePaste } from '@/lib/utils';

export function ClientsPage() {
  const { 
    clients, 
    loads,
    clientForm, 
    setClientForm, 
    addClient, 
    updateClient,
    deleteClient,
    setActiveTab,
    setLoadForm,
    isSubmitting: isSubmittingClient,
    setEditingLoadId,
    subscriptionTier
  } = useApp();
  const { toast } = useToast();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned'>('all');
  
  // Add Form collapsible toggle (open by default if no clients exist)
  const [isAddFormOpen, setIsAddFormOpen] = useState(clients.length === 0);

  // Edit Modal state
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editFormData, setEditFormData] = useState<Omit<Client, 'id'>>({
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: { street: '', city: '', state: '', zip: '' }
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter clients by search query and pinned status
  const filteredClients = useMemo(() => {
    let list = clients;

    if (activeFilter === 'pinned') {
      list = list.filter(c => c.isPinned);
    }

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase().trim();
    return list.filter(c => {
      const company = c.companyName?.toLowerCase() || '';
      const contact = c.contactName?.toLowerCase() || '';
      const email = c.contactEmail?.toLowerCase() || '';
      const phone = c.contactPhone || '';
      const city = c.address?.city?.toLowerCase() || '';
      const state = c.address?.state?.toLowerCase() || '';
      return (
        company.includes(query) ||
        contact.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        city.includes(query) ||
        state.includes(query)
      );
    });
  }, [clients, activeFilter, searchQuery]);

  // Split into pinned and non-pinned
  const pinnedClients = useMemo(() => filteredClients.filter(c => c.isPinned), [filteredClients]);
  const otherClients = useMemo(() => filteredClients.filter(c => !c.isPinned), [filteredClients]);

  // Overall stats
  const totalPinned = useMemo(() => clients.filter(c => c.isPinned).length, [clients]);
  const activeLoadsCount = useMemo(() => {
    return loads.filter(l => l.status === 'in-transit' || l.status === 'dispatched' || l.status === 'loading').length;
  }, [loads]);

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addClient();
    // Collapse form if we now have clients
    if (clients.length >= 0) {
      setIsAddFormOpen(false);
    }
  };

  const handleTogglePin = async (client: Client) => {
    if (client.id) {
      await updateClient(client.id, { isPinned: !client.isPinned });
      toast({
        title: client.isPinned ? 'Client Unpinned' : 'Client Pinned',
        description: `${client.companyName} is ${client.isPinned ? 'unpinned' : 'pinned to top'}.`,
      });
    }
  };

  /**
   * Pre-selects client and pre-fills origin facility address when creating a load
   */
  const handleCreateLoadForClient = (client: Client) => {
    if (!client.id) return;

    setLoadForm(prev => ({
      ...prev,
      clientId: client.id,
      origin: {
        street: client.address?.street || '',
        city: client.address?.city || '',
        state: client.address?.state || '',
        zip: client.address?.zip || '',
        companyName: client.companyName || '',
        contactName: client.contactName || '',
        contactPhone: client.contactPhone || '',
      }
    }));

    setEditingLoadId(null);
    setActiveTab('loads');

    toast({
      title: `Starting Load for ${client.companyName}`,
      description: 'Client selected and origin pickup address pre-filled.',
    });
  };

  // Open Edit Modal
  const handleStartEdit = (client: Client) => {
    setEditingClient(client);
    setEditFormData({
      companyName: client.companyName || '',
      contactName: client.contactName || '',
      contactEmail: client.contactEmail || '',
      contactPhone: client.contactPhone || '',
      address: {
        street: client.address?.street || '',
        city: client.address?.city || '',
        state: client.address?.state || '',
        zip: client.address?.zip || '',
      }
    });
  };

  // Save Edit Changes
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient?.id) return;

    setIsUpdating(true);
    try {
      await updateClient(editingClient.id, editFormData);
      toast({
        title: 'Client Updated',
        description: `${editFormData.companyName} details updated successfully.`,
      });
      setEditingClient(null);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Unable to save client changes. Please try again.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleShareClientPortal = () => {
    if (subscriptionTier === 'starter') {
      toast({
        title: 'Fleet Pro Feature',
        description: 'The Client Request Portal is available on Fleet Pro ($99/mo). Upgrade to give shippers and brokers a self-service link to submit loads.',
        action: (
          <Button size="sm" variant="outline" onClick={() => setActiveTab('billing')} className="text-xs">
            Upgrade
          </Button>
        ),
      });
      return;
    }

    const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/client-portal` : '/client-portal';
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(portalUrl).then(() => {
        toast({
          title: 'Client Portal Link Copied',
          description: `Share this URL with shippers to submit load requests directly into your dispatch queue: ${portalUrl}`,
        });
      }).catch(() => {
        window.open('/client-portal', '_blank');
      });
    } else {
      window.open('/client-portal', '_blank');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Page Header & Stats Summary ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-headline text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="h-7 w-7 text-blue-600" />
            Client Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain shipper directories, contact information, and streamline 1-click load assignments.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleShareClientPortal}
            className="border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs h-9 shadow-xs gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5 text-blue-600" />
            Client Portal Link
            {subscriptionTier === 'starter' && (
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200/80">
                PRO
              </span>
            )}
          </Button>
          <Button
            onClick={() => setIsAddFormOpen(prev => !prev)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 shadow-xs gap-1.5"
          >
            {isAddFormOpen ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide Form
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add New Client
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Metric Summary Tiles ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Shippers */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Clients</div>
            <div className="text-xl font-bold text-slate-900">{clients.length}</div>
          </div>
        </div>

        {/* Pinned Shippers */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Pin className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Pinned Shippers</div>
            <div className="text-xl font-bold text-slate-900">{totalPinned}</div>
          </div>
        </div>

        {/* Active Dispatches */}
        <div className="col-span-2 sm:col-span-1 p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Active Dispatches</div>
            <div className="text-xl font-bold text-slate-900">{activeLoadsCount}</div>
          </div>
        </div>
      </div>

      {/* ── Collapsible Add Client Form ─────────────────────────────── */}
      {isAddFormOpen && (
        <div className="transition-all animate-in fade-in duration-200">
          <ClientForm 
            clientForm={clientForm}
            setClientForm={setClientForm}
            onSubmit={handleClientSubmit}
            isSubmitting={isSubmittingClient}
            onCancel={() => setIsAddFormOpen(false)}
          />
        </div>
      )}

      {/* ── Search & Filter Controls ────────────────────────────────── */}
      {clients.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              type="text"
              placeholder="Search by company, contact, phone, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs border-slate-200 focus-visible:ring-blue-500"
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

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <Button
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('all')}
              className={`h-8 text-xs font-semibold ${activeFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            >
              All ({clients.length})
            </Button>
            {totalPinned > 0 && (
              <Button
                variant={activeFilter === 'pinned' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('pinned')}
                className={`h-8 text-xs font-semibold gap-1 ${activeFilter === 'pinned' ? 'bg-amber-600 text-white' : 'text-amber-700 border-amber-200 bg-amber-50/50'}`}
              >
                <Pin className="h-3 w-3" />
                Pinned ({totalPinned})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Client Cards Directory ──────────────────────────────────── */}
      <div className="space-y-8 pt-2">
        {/* Friendly Empty State if NO clients in system */}
        {clients.length === 0 ? (
          <div className="text-center py-12 px-6 bg-white border border-slate-200 rounded-2xl shadow-xs max-w-md mx-auto">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-2xs">
              <Users2 className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1.5">No clients yet</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Add your first client or shipper to start creating loads and streamlining your hotshot dispatch.
            </p>
            {!isAddFormOpen && (
              <Button 
                onClick={() => setIsAddFormOpen(true)} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Your First Client
              </Button>
            )}
          </div>
        ) : filteredClients.length === 0 ? (
          /* Empty search state */
          <div className="text-center py-10 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <Search className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No clients match &ldquo;{searchQuery}&rdquo;</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your keywords or clearing the search filter.</p>
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => { setSearchQuery(''); setActiveFilter('all'); }} 
              className="mt-2 text-xs text-blue-600"
            >
              Clear Search & Filter
            </Button>
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedClients.length > 0 && (
              <div>
                <h2 className="text-base font-bold font-headline text-slate-900 mb-3 flex items-center gap-2">
                  <span className="p-1 bg-amber-100 text-amber-700 rounded-md">
                    <Pin className="h-3.5 w-3.5" />
                  </span>
                  Pinned Shippers ({pinnedClients.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {pinnedClients.map(client => {
                    const clientLoads = loads.filter(l => l.clientId === client.id);
                    const activeCount = clientLoads.filter(l => l.status === 'in-transit' || l.status === 'dispatched' || l.status === 'loading').length;
                    return (
                      <ClientCard 
                        key={client.id}
                        client={client}
                        loadCount={clientLoads.length}
                        activeLoadCount={activeCount}
                        onCreateLoad={handleCreateLoadForClient}
                        onTogglePin={() => handleTogglePin(client)}
                        onEdit={handleStartEdit}
                        onDelete={() => deleteClient(client.id!)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Other / All Clients Section */}
            <div>
              {pinnedClients.length > 0 && (
                <h2 className="text-base font-bold font-headline text-slate-900 mb-3">
                  All Other Clients ({otherClients.length})
                </h2>
              )}
              {otherClients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {otherClients.map(client => {
                    const clientLoads = loads.filter(l => l.clientId === client.id);
                    const activeCount = clientLoads.filter(l => l.status === 'in-transit' || l.status === 'dispatched' || l.status === 'loading').length;
                    return (
                      <ClientCard 
                        key={client.id}
                        client={client}
                        loadCount={clientLoads.length}
                        activeLoadCount={activeCount}
                        onCreateLoad={handleCreateLoadForClient}
                        onTogglePin={() => handleTogglePin(client)}
                        onEdit={handleStartEdit}
                        onDelete={() => deleteClient(client.id!)}
                      />
                    );
                  })}
                </div>
              ) : pinnedClients.length > 0 && (
                <div className="text-xs text-slate-400 italic py-2">
                  All filtered clients are pinned above.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Edit Client Modal Dialog ─────────────────────────────────── */}
      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Edit3 className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Edit Client Information
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Update company info, primary contacts, and origin facility address.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Company Name */}
            <div>
              <Label htmlFor="edit-companyName" className="text-xs font-medium text-slate-700">
                Company Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="edit-companyName"
                  value={editFormData.companyName}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, companyName: e.target.value }))}
                  className="pl-9 h-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Primary Contact Name */}
            <div>
              <Label htmlFor="edit-contactName" className="text-xs font-medium text-slate-700">
                Primary Contact Person <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  id="edit-contactName"
                  value={editFormData.contactName} 
                  onChange={(e) => setEditFormData(prev => ({ ...prev, contactName: e.target.value }))}
                  className="pl-9 h-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <Label htmlFor="edit-contactEmail" className="text-xs font-medium text-slate-700">
                  Contact Email <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="edit-contactEmail"
                    type="email"
                    value={editFormData.contactEmail} 
                    onChange={(e) => setEditFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                    className="pl-9 h-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-contactPhone" className="text-xs font-medium text-slate-700">
                  Contact Phone <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="edit-contactPhone"
                    type="tel"
                    value={editFormData.contactPhone} 
                    onChange={(e) => setEditFormData(prev => ({ ...prev, contactPhone: sanitizePhoneDigits(e.target.value) }))}
                    onPaste={(e) => handlePhonePaste(e, (sanitized) => setEditFormData(prev => ({ ...prev, contactPhone: sanitized })))}
                    maxLength={14}
                    className="pl-9 h-9 text-xs"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="pt-2">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Facility / Pickup Address
              </Label>
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3">
                <AddressFields 
                  label="Edit Address"
                  address={editFormData.address as Address}
                  onChange={(field, value) => setEditFormData(prev => ({
                    ...prev,
                    address: {
                      ...(prev.address as Address || { street: '', city: '', state: '', zip: '' }),
                      [field]: value
                    }
                  }))}
                  hideCompany={true}
                  hideContact={true}
                  enableAutocomplete={true}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingClient(null)}
                disabled={isUpdating}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isUpdating}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
