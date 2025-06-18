
import React from 'react';
import type { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, UserCircle, Mail, Phone, PackagePlus, Home } from 'lucide-react';

type ClientCardProps = {
  client: Client;
  onCreateLoad: (clientId: string) => void;
};

export function ClientCard({ client, onCreateLoad }: ClientCardProps) {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Building className="h-10 w-10 text-primary" />
          <div>
            <CardTitle className="text-xl font-headline">{client.companyName}</CardTitle>
            <CardDescription>Primary Contact: {client.contactName}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center text-muted-foreground">
          <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
          <span className="truncate" title={client.contactEmail}>{client.contactEmail}</span>
        </div>
        <div className="flex items-center text-muted-foreground">
          <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
          <span>{client.contactPhone}</span>
        </div>
        {client.address && (
           <div className="flex items-start text-muted-foreground">
             <Home className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
             <span className="text-xs">{client.address}</span>
           </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onCreateLoad(client.id!)}
          className="w-full"
        >
          <PackagePlus className="h-4 w-4 mr-2" />
          Create Load for {client.companyName}
        </Button>
      </CardFooter>
    </Card>
  );
}
