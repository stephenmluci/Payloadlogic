import React from 'react';
import type { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCircle, Mail, Phone, PackagePlus } from 'lucide-react';

type ClientCardProps = {
  client: Client;
  onCreateLoad: (clientId: string) => void;
};

export function ClientCard({ client, onCreateLoad }: ClientCardProps) {
  const isEmail = client.contact.includes('@');
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center gap-3">
          <UserCircle className="h-10 w-10 text-primary" />
          <div>
            <CardTitle className="text-xl font-headline">{client.name}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center text-sm text-muted-foreground">
          {isEmail ? <Mail className="h-4 w-4 mr-2" /> : <Phone className="h-4 w-4 mr-2" />}
          {client.contact}
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onCreateLoad(client.id!)}
          className="w-full"
        >
          <PackagePlus className="h-4 w-4 mr-2" />
          Create Load for Client
        </Button>
      </CardFooter>
    </Card>
  );
}
