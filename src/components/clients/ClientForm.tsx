import React from 'react';
import type { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Phone } from 'lucide-react';

type ClientFormProps = {
  clientForm: Omit<Client, 'id'>;
  setClientForm: React.Dispatch<React.SetStateAction<Omit<Client, 'id'>>>;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function ClientForm({ clientForm, setClientForm, onSubmit, isSubmitting }: ClientFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setClientForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">Add New Client</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name">Client Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="name"
                name="name"
                value={clientForm.name} 
                onChange={handleInputChange} 
                placeholder="e.g., Acme Corp"
                className="pl-10"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="contact">Contact Information</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="contact"
                name="contact"
                value={clientForm.contact} 
                onChange={handleInputChange} 
                placeholder="Email or phone number"
                className="pl-10"
              />
            </div>
          </div>
          
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Adding Client...' : 'Add Client'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
