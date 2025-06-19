
import React from 'react';
import type { Load, Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, DollarSign, Milestone, Package as CargoIcon, CalendarClock, Edit, Save, XCircle, Ruler, Weight } from 'lucide-react';

type LoadFormProps = {
  loadForm: Partial<Load>; 
  setLoadForm: React.Dispatch<React.SetStateAction<Partial<Load>>>;
  clients: Client[];
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit?: () => void; 
  isSubmitting?: boolean;
  editingLoadId: string | null;
};

export function LoadForm({ loadForm, setLoadForm, clients, onSubmit, onCancelEdit, isSubmitting, editingLoadId }: LoadFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'number' || name === 'distance' || name === 'ratePerMile') {
      setLoadForm(prev => ({ ...prev, [name]: value === '' ? undefined : Number(value) })); 
    } else {
      setLoadForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setLoadForm(prev => ({ ...prev, [name]: value }));
  };
  
  const isEditMode = !!editingLoadId;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline flex items-center gap-2">
            <Edit /> {isEditMode ? 'Edit Load' : 'Create New Load'}
            {isEditMode && loadForm.loadNumber && <span className="text-base font-normal text-muted-foreground">({loadForm.loadNumber})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <Label htmlFor="clientId">Client Company</Label>
            <Select 
              value={loadForm.clientId || ''} 
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
                  value={loadForm.origin || ''} 
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
                  value={loadForm.destination || ''} 
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
                        value={loadForm.pickupDateTime || ''}
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
                        value={loadForm.deliveryDateTime || ''}
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
              <Label htmlFor="cargoDimensions">Cargo Dimensions (e.g., LxWxH)</Label>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="cargoDimensions"
                  name="cargoDimensions"
                  value={loadForm.cargoDimensions || ''} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 10ft L x 8ft W x 6ft H"
                  className="pl-10" 
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cargoWeight">Cargo Weight (e.g., lbs or kg)</Label>
              <div className="relative">
                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="cargoWeight"
                  name="cargoWeight"
                  value={loadForm.cargoWeight || ''} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 5000 lbs"
                  className="pl-10"
                />
              </div>
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
                  value={loadForm.distance || ''} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 500"
                  className="pl-10" 
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ratePerMile">Rate per Mile ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="ratePerMile"
                  name="ratePerMile"
                  type="number"
                  step="0.01"
                  value={loadForm.ratePerMile || ''} 
                  onChange={handleInputChange} 
                  placeholder="e.g., 2.50"
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>
          
          <div>
            <Label htmlFor="status">Status</Label>
            <Select 
              value={loadForm.status || 'pending'}
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
          
          <div className="flex space-x-2">
            <Button type="submit" className="flex-grow" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isEditMode ? 'Update Load' : 'Add Load'}
            </Button>
            {isEditMode && onCancelEdit && (
              <Button type="button" variant="outline" onClick={onCancelEdit} disabled={isSubmitting}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Edit
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
