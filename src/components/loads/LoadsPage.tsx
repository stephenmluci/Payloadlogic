
import React from 'react';
import type { Load, Client, ClientLoadRequest } from '@/types';
import { LoadForm } from './LoadForm';
import { LoadCard } from './LoadCard';
import { ClientLoadRequestCard } from './ClientLoadRequestCard'; // New component for client requests
import { PackageOpen, FileInput } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from '@/components/ui/scroll-area';

type LoadsPageProps = {
  loads: Load[];
  clients: Client[]; 
  clientLoadRequests: ClientLoadRequest[];
  loadForm: Omit<Load, 'id' | 'expenses' | 'loadNumber'>;
  setLoadForm: React.Dispatch<React.SetStateAction<Omit<Load, 'id' | 'expenses' | 'loadNumber'>>>;
  addLoad: (loadData?: Omit<Load, 'id' | 'expenses' | 'loadNumber'>) => Promise<void>;
  updateLoadStatus: (id: string, status: Load['status']) => Promise<void>;
  generateAgreement: (load: Load) => Promise<void>;
  approveClientLoadRequest: (request: ClientLoadRequest) => Promise<void>;
  isSubmittingLoad: boolean;
  isUpdatingStatus: boolean;
};

export function LoadsPage({ 
  loads, 
  clients, 
  clientLoadRequests,
  loadForm, 
  setLoadForm, 
  addLoad, 
  updateLoadStatus, 
  generateAgreement,
  approveClientLoadRequest,
  isSubmittingLoad,
  isUpdatingStatus
}: LoadsPageProps) {
  
  const handleLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addLoad(); // Uses current loadForm state
  };

  const activeLoads = loads.filter(load => load.status !== 'delivered');
  const completedLoads = loads.filter(load => load.status === 'delivered');
  const newClientRequests = clientLoadRequests.filter(req => req.status === 'new');
  const processedClientRequests = clientLoadRequests.filter(req => req.status !== 'new');

  // Helper to find client for a load
  const getClientForLoad = (load: Load): Client | undefined => {
    return clients.find(c => c.id === load.clientId);
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline mb-2">Load Management</h1>
        <p className="text-muted-foreground">Create, track, and manage all your loads, including client requests.</p>
      </div>
      
      <Tabs defaultValue="createLoad" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="createLoad">Create/Edit Load</TabsTrigger>
          <TabsTrigger value="clientRequests">Client Requests ({newClientRequests.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="createLoad">
          <LoadForm 
            loadForm={loadForm}
            setLoadForm={setLoadForm}
            clients={clients}
            onSubmit={handleLoadSubmit}
            isSubmitting={isSubmittingLoad}
          />
        </TabsContent>
        <TabsContent value="clientRequests">
          <div className="mt-2">
            <h2 className="text-xl font-semibold font-headline mb-4">New Client Load Requests ({newClientRequests.length})</h2>
            {newClientRequests.length > 0 ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {newClientRequests.map(request => (
                    <ClientLoadRequestCard 
                      key={request.id}
                      request={request}
                      onApprove={approveClientLoadRequest}
                    />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-10 bg-card rounded-lg shadow">
                <FileInput className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No new client load requests.</p>
              </div>
            )}
            {processedClientRequests.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-2">Processed Client Requests ({processedClientRequests.length})</h3>
                 <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-4">
                    {processedClientRequests.map(request => (
                        <ClientLoadRequestCard 
                        key={request.id}
                        request={request}
                        onApprove={approveClientLoadRequest} 
                        isProcessed={true}
                        />
                    ))}
                    </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      <div className="mt-10">
        <h2 className="text-2xl font-semibold font-headline mb-4">Active Loads ({activeLoads.length})</h2>
        {activeLoads.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeLoads.map(load => (
              <LoadCard 
                key={load.id}
                load={load}
                client={getClientForLoad(load)}
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
                client={getClientForLoad(load)}
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
