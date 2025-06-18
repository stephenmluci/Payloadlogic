
import React from 'react';
import type { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { User, Phone, Mail, Building, Home } from 'lucide-react';

type ClientFormProps = {
  clientForm: Omit<Client, 'id'>;
  setClientForm: React.Dispatch<React.SetStateAction<Omit<Client, 'id'>>>;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function ClientForm({ clientForm, setClientForm, onSubmit, isSubmitting }: ClientFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setClientForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">Add New Client Company</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <Label htmlFor="companyName">Company Name</Label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="companyName"
                name="companyName"
                value={clientForm.companyName} 
                onChange={handleInputChange} 
                placeholder="e.g., Acme Corp"
                className="pl-10"
                required
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="contactName">Primary Contact Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="contactName"
                name="contactName"
                value={clientForm.contactName} 
                onChange={handleInputChange} 
                placeholder="e.g., Jane Doe"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="contactEmail">Contact Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  value={clientForm.contactEmail} 
                  onChange={handleInputChange} 
                  placeholder="e.g., jane.doe@acme.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  id="contactPhone"
                  name="contactPhone"
                  type="tel"
                  value={clientForm.contactPhone} 
                  onChange={handleInputChange} 
                  placeholder="e.g., (555) 123-4567"
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>
           <div>
              <Label htmlFor="address">Company Address (Optional)</Label>
              <div className="relative">
                <Home className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Textarea
                  id="address"
                  name="address"
                  value={clientForm.address || ''}
                  onChange={handleInputChange}
                  placeholder="e.g., 123 Business Rd, Suite 100, City, State ZIP"
                  className="pl-10"
                  rows={2}
                />
              </div>
            </div>
          
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Adding Client...' : 'Add Client Company'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
