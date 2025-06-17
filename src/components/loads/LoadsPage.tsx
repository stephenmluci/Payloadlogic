import React from 'react';
import type { Load, Client } from '@/types';
import { LoadForm } from './LoadForm';
import { LoadCard } from './LoadCard';
import { PackageOpen } from 'lucide-react';

type LoadsPageProps = {
  loads: Load[];
  clients: Client[];
  loadForm: Omit<Load, 'id' | 'expenses'>;
  setLoadForm: React.Dispatch<React.SetStateAction<Omit<Load, 'id' | 'expenses'>>>;
  addLoad: () => Promise<void>;
  updateLoadStatus: (id: string, status: Load['status']) => Promise<void>;
  generateAgreement: (load: Load) => Promise<void>;
  isSubmittingLoad: boolean;
  isUpdatingStatus: boolean;
};

export function LoadsPage({ 
  loads, 
  clients, 
  loadForm, 
  setLoadForm, 
  addLoad, 
  updateLoadStatus, 
  generateAgreement,
  isSubmittingLoad,
  isUpdatingStatus
}: LoadsPageProps) {
  
  const handleLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addLoad();
  };

  const activeLoads = loads.filter(load => load.status !== 'delivered');
  const completedLoads = loads.filter(load => load.status === 'delivered');

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline mb-2">Load Management</h1>
        <p className="text-muted-foreground">Create, track, and manage all your loads.</p>
      </div>
      
      <LoadForm 
        loadForm={loadForm}
        setLoadForm={setLoadForm}
        clients={clients}
        onSubmit={handleLoadSubmit}
        isSubmitting={isSubmittingLoad}
      />
      
      <div className="mt-10">
        <h2 className="text-2xl font-semibold font-headline mb-4">Active Loads ({activeLoads.length})</h2>
        {activeLoads.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeLoads.map(load => (
              <LoadCard 
                key={load.id}
                load={load}
                clientName={clients.find(c => c.id === load.clientId)?.name || 'Unknown Client'}
                onStatusChange={updateLoadStatus}
                onGenerateAgreement={generateAgreement}
                isUpdatingStatus={isUpdatingStatus}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-card rounded-lg shadow">
            <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No active loads at the moment.</p>
            <p className="text-sm text-muted-foreground">Create a new load to get started!</p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-2xl font-semibold font-headline mb-4">Completed Loads ({completedLoads.length})</h2>
        {completedLoads.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {completedLoads.map(load => (
              <LoadCard 
                key={load.id}
                load={load}
                clientName={clients.find(c => c.id === load.clientId)?.name || 'Unknown Client'}
                onStatusChange={updateLoadStatus}
                onGenerateAgreement={generateAgreement}
                isUpdatingStatus={isUpdatingStatus}
              />
            ))}
          </div>
        ) : (
           <div className="text-center py-10 bg-card rounded-lg shadow">
            <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No completed loads yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
