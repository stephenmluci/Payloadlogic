
'use client';
import React from 'react';
import type { ClientLoadRequest } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarDays, MapPin, Package, Send, User, Mail, Phone } from 'lucide-react';

type ClientLoadRequestFormProps = {
  requestForm: Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'>;
  setRequestForm: React.Dispatch<React.SetStateAction<Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'>>>;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function ClientLoadRequestForm({ requestForm, setRequestForm, onSubmit, isSubmitting }: ClientLoadRequestFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRequestForm(prev => ({ ...prev, [name]: value }));
  };
  
  const currentDateTimeLocal = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);


  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="origin">Origin Address</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="origin"
              name="origin"
              value={requestForm.origin}
              onChange={handleInputChange}
              placeholder="e.g., 123 Main St, Anytown, USA"
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
              value={requestForm.destination}
              onChange={handleInputChange}
              placeholder="e.g., 456 Market Ave, Otherville, USA"
              className="pl-10"
              required
            />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="cargoDescription">Cargo Description</Label>
        <div className="relative">
          <Package className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Textarea
            id="cargoDescription"
            name="cargoDescription"
            value={requestForm.cargoDescription}
            onChange={handleInputChange}
            placeholder="e.g., Pallets of widgets, construction materials"
            className="pl-10 min-h-[100px]"
            required
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="requestedPickupDateTime">Requested Pickup Date & Time</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="requestedPickupDateTime"
              name="requestedPickupDateTime"
              type="datetime-local"
              value={requestForm.requestedPickupDateTime}
              onChange={handleInputChange}
              className="pl-10"
              required
              min={currentDateTimeLocal}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="requestedDeliveryDateTime">Requested Delivery Date & Time</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="requestedDeliveryDateTime"
              name="requestedDeliveryDateTime"
              type="datetime-local"
              value={requestForm.requestedDeliveryDateTime}
              onChange={handleInputChange}
              className="pl-10"
              required
              min={requestForm.requestedPickupDateTime || currentDateTimeLocal} 
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4 mt-4">
        <h3 className="text-md font-medium text-foreground">Contact Information for this Request</h3>
        <div>
          <Label htmlFor="requestContactName">Your Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="requestContactName"
              name="requestContactName"
              value={requestForm.requestContactName}
              onChange={handleInputChange}
              placeholder="Full Name"
              className="pl-10"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="requestContactEmail">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="requestContactEmail"
                name="requestContactEmail"
                type="email"
                value={requestForm.requestContactEmail}
                onChange={handleInputChange}
                placeholder="you@example.com"
                className="pl-10"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="requestContactPhone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="requestContactPhone"
                name="requestContactPhone"
                type="tel"
                value={requestForm.requestContactPhone}
                onChange={handleInputChange}
                placeholder="(555) 123-4567"
                className="pl-10"
                required
              />
            </div>
          </div>
        </div>
      </div>
      
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        <Send className="mr-2 h-4 w-4" />
        {isSubmitting ? 'Submitting Request...' : 'Submit Load Request'}
      </Button>
    </form>
  );
}
