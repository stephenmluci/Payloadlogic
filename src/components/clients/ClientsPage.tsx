
import React from 'react';
import { ClientForm } from './ClientForm';
import { ClientCard } from './ClientCard';
import { Users2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function ClientsPage() {
  const { 
    clients, 
    clientForm, 
    setClientForm, 
    addClient, 
    setActiveTab,
    setLoadForm,
    isSubmitting: isSubmittingClient,
    setEditingLoadId
  } = useApp();
  
  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addClient();
  };

  const handleCreateLoadForClient = (clientId: string) => {
    setLoadForm(prev => ({ 
      ...prev,
      clientId: clientId,
      // Reset other fields to initial state if needed
    }));
    setEditingLoadId(null);
    setActiveTab('loads');
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline mb-2">Client Management</h1>
        <p className="text-muted-foreground">Keep track of your clients and their contact information.</p>
      </div>
      
      <ClientForm 
        clientForm={clientForm}
        setClientForm={setClientForm}
        onSubmit={handleClientSubmit}
        isSubmitting={isSubmittingClient}
      />
      
      <div className="mt-10">
        <h2 className="text-2xl font-semibold font-headline mb-4">Client List ({clients.length})</h2>
        {clients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clients.map(client => (
              <ClientCard 
                key={client.id}
                client={client}
                onCreateLoad={handleCreateLoadForClient}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-card rounded-lg shadow">
            <Users2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No clients added yet.</p>
            <p className="text-sm text-muted-foreground">Add a new client to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
