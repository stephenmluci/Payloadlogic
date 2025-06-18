
import React from 'react';
import type { Load, Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, DollarSign, Milestone, CircleHelp, Package as CargoIcon, CalendarClock, Edit } from 'lucide-react';

type LoadFormProps = {
  loadForm: Omit<Load, 'id' | 'expenses' | 'loadNumber'>;
  setLoadForm: React.Dispatch<React.SetStateAction<Omit<Load, 'id' | 'expenses' | 'loadNumber'>>>;
  clients: Client[];
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function LoadForm({ loadForm, setLoadForm, clients, onSubmit, isSubmitting }: LoadFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'number') {
      setLoadForm(prev => ({ ...prev, [name]: value === '' ? 0 : Number(value) }));
    } else {
      setLoadForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setLoadForm(prev => ({ ...prev, [name]: value }));
  };
  
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline flex items-center gap-2">
            <Edit /> Create or Update Load
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <Label htmlFor="clientId">Client Company</Label>
            <Select 
              value={loadForm.clientId} 
              onValueChange={(value) => handleSelectChange('clientId', value)}
              name="clientId"
            >
              <SelectTrigger id="clientId">
                <SelectValue placeholder="Select a client company" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id!}>
                    {client.companyName} ({client.contactName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadForm.originalClientRequestId && (
                <p className="text-xs text-muted-foreground mt-1">
                    Pre-filled from Client Request ID: {loadForm.originalClientRequestId} by {loadForm.requestedByClientName || 'N/A'}
                </p>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="origin">Origin Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="origin"
                  name="origin"
                  value={loadForm.origin} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 123 Loading Dock St, Anytown"
                  className="pl-10" 
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="destination">Destination Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="destination"
                  name="destination"
                  value={loadForm.destination} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 789 Recipient Ave, Otherville"
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <Label htmlFor="pickupDateTime">Pickup Date & Time</Label>
                <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        id="pickupDateTime"
                        name="pickupDateTime"
                        type="datetime-local"
                        value={loadForm.pickupDateTime}
                        onChange={handleInputChange}
                        className="pl-10"
                        required
                    />
                </div>
            </div>
            <div>
                <Label htmlFor="deliveryDateTime">Delivery Date & Time</Label>
                <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        id="deliveryDateTime"
                        name="deliveryDateTime"
                        type="datetime-local"
                        value={loadForm.deliveryDateTime}
                        onChange={handleInputChange}
                        className="pl-10"
                        required
                    />
                </div>
            </div>
          </div>
          
          <div>
            <Label htmlFor="cargoDescription">Cargo Description</Label>
            <div className="relative">
                <CargoIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Textarea
                    id="cargoDescription"
                    name="cargoDescription"
                    value={loadForm.cargoDescription || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., 10 pallets of widgets, construction materials"
                    className="pl-10"
                    rows={3}
                />
            </div>
          </div>
          
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
                  required
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
                  step="0.01"
                  value={loadForm.rate} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 1500.00"
                  className="pl-10"
                  required
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
                <SelectItem value="client-request-approved">Client Request Approved</SelectItem>
                <SelectItem value="in-transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="specialTerms">Special Terms (Optional)</Label>
            <Textarea
                id="specialTerms"
                name="specialTerms"
                value={loadForm.specialTerms || ''}
                onChange={handleInputChange}
                placeholder="Any special instructions or terms for this load..."
                rows={3}
            />
          </div>
          
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Saving Load...' : 'Save Load Details'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
