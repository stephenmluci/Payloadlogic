import React from 'react';
import type { Load, Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, DollarSign, Milestone, CircleHelp } from 'lucide-react';

type LoadFormProps = {
  loadForm: Omit<Load, 'id' | 'expenses'>;
  setLoadForm: React.Dispatch<React.SetStateAction<Omit<Load, 'id' | 'expenses'>>>;
  clients: Client[];
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function LoadForm({ loadForm, setLoadForm, clients, onSubmit, isSubmitting }: LoadFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setLoadForm(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setLoadForm(prev => ({ ...prev, [name]: value }));
  };
  
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">Create New Load</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <Label htmlFor="clientId">Client</Label>
            <Select 
              value={loadForm.clientId} 
              onValueChange={(value) => handleSelectChange('clientId', value)}
              name="clientId"
            >
              <SelectTrigger id="clientId">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id!}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="origin">Origin</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="origin"
                  name="origin"
                  value={loadForm.origin} 
                  onChange={handleInputChange} 
                  placeholder="Origin address"
                  className="pl-10" 
                />
              </div>
            </div>
            <div>
              <Label htmlFor="destination">Destination</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="destination"
                  name="destination"
                  value={loadForm.destination} 
                  onChange={handleInputChange} 
                  placeholder="Destination address"
                  className="pl-10"
                />
              </div>
            </div>
          </div>
          
          <Card className="bg-muted/30">
            <CardContent className="p-4 mt-4 h-48 flex items-center justify-center">
              <p className="text-muted-foreground text-center">
                <Milestone className="h-8 w-8 mx-auto mb-2 text-primary" />
                Map visualization would appear here with Mapbox or Google Maps integration.
              </p>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="distance">Distance (miles)</Label>
              <div className="relative">
                <Milestone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="distance"
                  name="distance"
                  type="number"
                  value={loadForm.distance} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 500"
                  className="pl-10" 
                />
              </div>
            </div>
            <div>
              <Label htmlFor="rate">Rate ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="rate"
                  name="rate"
                  type="number"
                  value={loadForm.rate} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 1500"
                  className="pl-10"
                />
              </div>
            </div>
          </div>
          
          <div>
            <Label htmlFor="status">Status</Label>
            <Select 
              value={loadForm.status}
              onValueChange={(value) => handleSelectChange('status', value as Load['status'])}
              name="status"
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Load...' : 'Create Load'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
