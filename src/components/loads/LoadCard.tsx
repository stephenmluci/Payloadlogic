
import React from 'react';
import type { Load, Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Milestone, DollarSign, Edit3, FileText, CheckCircle, Clock, Truck, Hash } from 'lucide-react';

type LoadCardProps = {
  load: Load;
  clientName: string;
  onStatusChange: (loadId: string, status: Load['status']) => void;
  onGenerateAgreement: (load: Load) => void;
  isUpdatingStatus?: boolean;
};

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-500', icon: <Clock className="h-4 w-4 mr-1" /> },
  'in-transit': { label: 'In Transit', color: 'bg-blue-500', icon: <Truck className="h-4 w-4 mr-1" /> },
  delivered: { label: 'Delivered', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
  'client-request-approved': { label: 'Req. Approved', color: 'bg-teal-500', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
};

export function LoadCard({ load, clientName, onStatusChange, onGenerateAgreement, isUpdatingStatus }: LoadCardProps) {
  const currentStatus = statusConfig[load.status] || statusConfig.pending;

  const profit = load.rate - (
    load.expenses.payroll + 
    load.expenses.recurring + 
    load.expenses.fuel + 
    load.expenses.def
  );

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <div className="flex justify-between items-start mb-1">
          <CardTitle className="text-xl font-headline flex items-center">
            <MapPin className="h-5 w-5 mr-2 text-primary" />
            {load.origin} → {load.destination}
          </CardTitle>
          {load.loadNumber && (
            <Badge variant="secondary" className="text-xs flex items-center">
              <Hash className="h-3 w-3 mr-1" />
              {load.loadNumber}
            </Badge>
          )}
        </div>
        <div className="flex justify-between items-center">
            <CardDescription>Client: {clientName}</CardDescription>
            <Badge variant="outline" className={`${currentStatus.color} text-white border-none flex items-center`}>
                {currentStatus.icon} {currentStatus.label}
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center text-sm text-muted-foreground">
          <Milestone className="h-4 w-4 mr-2" />
          Distance: {load.distance} miles
        </div>
        <div className="flex items-center text-sm text-muted-foreground">
          <DollarSign className="h-4 w-4 mr-2" />
          Rate: ${load.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        {load.status === 'delivered' && load.expenses.calculated && (
          <>
            <Separator className="my-3" />
            <div className="p-3 bg-muted/50 rounded-md space-y-2">
              <h4 className="font-semibold text-sm mb-1">Expense Breakdown:</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>Payroll:</span> <span className="text-right">${load.expenses.payroll.toFixed(2)}</span>
                <span>Recurring:</span> <span className="text-right">${load.expenses.recurring.toFixed(2)}</span>
                <span>Fuel:</span> <span className="text-right">${load.expenses.fuel.toFixed(2)}</span>
                <span>DEF:</span> <span className="text-right">${load.expenses.def.toFixed(2)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between items-center font-semibold text-sm">
                <span>Profit:</span>
                <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  ${profit.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-4 border-t">
         <Select 
            value={load.status} 
            onValueChange={(value) => onStatusChange(load.id!, value as Load['status'])}
            disabled={isUpdatingStatus}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Change status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in-transit">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="client-request-approved">Request Approved</SelectItem>
            </SelectContent>
          </Select>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onGenerateAgreement(load)}
          className="w-full sm:w-auto"
        >
          <FileText className="h-4 w-4 mr-2" />
          Service Agreement
        </Button>
      </CardFooter>
    </Card>
  );
}
