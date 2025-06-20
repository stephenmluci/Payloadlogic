
import React from 'react';
import type { ClientLoadRequest } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, CalendarDays, User, PackageCheck, AlertCircle, CheckCircle, Hourglass, Package as CargoIcon, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';

type ClientLoadRequestCardProps = {
  request: ClientLoadRequest;
  onApprove: (request: ClientLoadRequest) => void;
  isProcessed?: boolean;
};

const statusConfig = {
  new: { label: 'New', color: 'bg-blue-500', icon: <Hourglass className="h-3 w-3 mr-1" /> },
  viewed: { label: 'Viewed', color: 'bg-yellow-500', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
  accepted: { label: 'Accepted', color: 'bg-green-500', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
  rejected: { label: 'Rejected', color: 'bg-red-500', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
};

const formatDateTimeDisplay = (isoString?: string) => {
  if (!isoString) return 'N/A';
  try {
    return format(new Date(isoString), 'PPpp'); // e.g., Jun 20, 2024, 2:30 PM
  } catch {
    return 'Invalid Date';
  }
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
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start text-muted-foreground">
          <CargoIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Cargo:</span> {request.cargoDescription}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex items-center text-muted-foreground">
            <CalendarDays className="h-4 w-4 mr-2 flex-shrink-0" />
            <div>
                <span className="font-medium">Requested Pickup:</span><br/> {formatDateTimeDisplay(request.requestedPickupDateTime)}
            </div>
            </div>
            <div className="flex items-center text-muted-foreground">
            <CalendarDays className="h-4 w-4 mr-2 flex-shrink-0" />
            <div>
                <span className="font-medium">Requested Delivery:</span><br/> {formatDateTimeDisplay(request.requestedDeliveryDateTime)}
            </div>
            </div>
        </div>
        
        <div className="border-t pt-3 mt-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Request Contact Info</h4>
            <div className="flex items-center text-muted-foreground">
                <User className="h-4 w-4 mr-2 flex-shrink-0" /> {request.requestContactName}
            </div>
            <div className="flex items-center text-muted-foreground">
                <Mail className="h-4 w-4 mr-2 flex-shrink-0" /> {request.requestContactEmail}
            </div>
            <div className="flex items-center text-muted-foreground">
                <Phone className="h-4 w-4 mr-2 flex-shrink-0" /> {request.requestContactPhone}
            </div>
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
