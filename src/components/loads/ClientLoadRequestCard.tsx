
import React from 'react';
import type { ClientLoadRequest } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, CalendarDays, User, PackageCheck, AlertCircle, CheckCircle, Hourglass } from 'lucide-react';
import { format } from 'date-fns';

type ClientLoadRequestCardProps = {
  request: ClientLoadRequest;
  onApprove: (request: ClientLoadRequest) => void;
  isProcessed?: boolean; // To change button text or action for already processed items
};

const statusConfig = {
  new: { label: 'New', color: 'bg-blue-500', icon: <Hourglass className="h-3 w-3 mr-1" /> },
  viewed: { label: 'Viewed', color: 'bg-yellow-500', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
  accepted: { label: 'Accepted', color: 'bg-green-500', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
  rejected: { label: 'Rejected', color: 'bg-red-500', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
};


export function ClientLoadRequestCard({ request, onApprove, isProcessed }: ClientLoadRequestCardProps) {
  const currentStatus = statusConfig[request.status] || { label: request.status, color: 'bg-gray-500', icon: <AlertCircle className="h-3 w-3 mr-1" /> };

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-headline flex items-center">
                <MapPin className="h-5 w-5 mr-2 text-primary" />
                {request.origin} → {request.destination}
            </CardTitle>
            <Badge variant="outline" className={`${currentStatus.color} text-white border-none flex items-center text-xs px-2 py-0.5`}>
                {currentStatus.icon} {currentStatus.label}
            </Badge>
        </div>
        <CardDescription className="text-xs">
          Submitted by: {request.requestedByClientName || 'N/A'} on {request.submissionTimestamp ? format(request.submissionTimestamp.toDate(), 'PPP p') : 'N/A'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center text-muted-foreground">
          <Package className="h-4 w-4 mr-2" />
          Cargo: {request.cargoDescription}
        </div>
        <div className="flex items-center text-muted-foreground">
          <CalendarDays className="h-4 w-4 mr-2" />
          Requested Pickup: {format(new Date(request.requestedPickupDate), 'PPP')}
        </div>
      </CardContent>
      {!isProcessed && request.status === 'new' && (
        <CardFooter className="pt-4 border-t">
          <Button 
            variant="default" 
            size="sm" 
            onClick={() => onApprove(request)}
            className="w-full"
          >
            <PackageCheck className="h-4 w-4 mr-2" />
            Process & Create Load
          </Button>
        </CardFooter>
      )}
       {isProcessed && (
        <CardFooter className="pt-4 border-t text-sm text-muted-foreground">
          This request has been {request.status}. {request.createdLoadId && `(Load ID: ${request.createdLoadId})`}
        </CardFooter>
      )}
    </Card>
  );
}

