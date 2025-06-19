
import React from 'react';
import type { Load, Client, Settings } from '@/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Milestone, DollarSign, FileText, CheckCircle, Clock, Truck as TruckIcon, Hash, CalendarClock, UserCircle, Pencil, Trash2, Ruler, Weight, Box, ShieldCheck, ShieldX, Timer, Phone, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { format as formatDate } from 'date-fns';

type LoadCardProps = {
  load: Load;
  client: Client | undefined;
  settings: Settings; // Added settings
  onStatusChange: (loadId: string, status: Load['status']) => void;
  onGenerateAgreement: (load: Load) => void;
  onEdit: (load: Load) => void;
  onDelete: (loadId: string) => Promise<void>;
  isUpdatingStatus?: boolean;
  isDeleting?: boolean;
};

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-500', icon: <Clock className="h-4 w-4 mr-1" /> },
  'in-transit': { label: 'In Transit', color: 'bg-blue-500', icon: <TruckIcon className="h-4 w-4 mr-1" /> },
  delivered: { label: 'Delivered', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
  'client-request-approved': { label: 'Req. Approved', color: 'bg-teal-500', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
};

const formatDateTimeDisplay = (isoString: string | undefined) => {
  if (!isoString) return 'N/A';
  try {
    return formatDate(new Date(isoString), 'PPpp');
  } catch {
    return 'Invalid Date';
  }
};


export function LoadCard({ load, client, settings, onStatusChange, onGenerateAgreement, onEdit, onDelete, isUpdatingStatus, isDeleting }: LoadCardProps) {
  const currentStatus = statusConfig[load.status] || statusConfig.pending;

  const actualProfit = load.totalAgreedRate - (
    load.expenses.payroll +
    load.expenses.recurring +
    load.expenses.fuel +
    load.expenses.def
  );

  const clientDisplayInfo = client
    ? `${client.companyName} (Contact: ${client.contactName})`
    : load.requestedByClientName || 'Unknown Client';

  // Calculate Projected Profit
  let projectedProfit: number | null = null;
  let projectedPayroll = 0;
  let projectedFuelCost = 0;
  let projectedDefCost = 0;
  let projectedRecurringDaily = 0;

  if (load.status !== 'delivered' || !load.expenses.calculated) {
    projectedPayroll = load.totalAgreedRate * (settings.payrollPercentage / 100);
    
    projectedFuelCost = (load.distance > 0 && settings.truckMpg > 0 && settings.defaultFuelCostPerGallon > 0)
      ? (load.distance / settings.truckMpg) * settings.defaultFuelCostPerGallon
      : 0;
    
    projectedDefCost = (load.distance > 0 && settings.defCostPerGallon > 0)
      ? (load.distance / 250) * settings.defCostPerGallon 
      : 0;
    
    projectedRecurringDaily = settings.recurringExpenses.reduce(
      (sum, expense) => sum + (expense.amount / 30), 0
    );
    
    const totalProjectedExpenses = projectedPayroll + projectedFuelCost + projectedDefCost + projectedRecurringDaily;
    projectedProfit = load.totalAgreedRate - totalProjectedExpenses;
  }


  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col">
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
            <CardDescription className="text-sm space-y-0.5">
                <div className="flex items-center">
                    <UserCircle className="h-4 w-4 mr-1 text-muted-foreground" /> {clientDisplayInfo}
                </div>
                {client && client.contactPhone && (
                    <div className="flex items-center text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 mr-1" /> {client.contactPhone}
                    </div>
                )}
            </CardDescription>
            <Badge variant="outline" className={`${currentStatus.color} text-white border-none flex items-center`}>
                {currentStatus.icon} {currentStatus.label}
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm flex-grow">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center text-muted-foreground">
              <CalendarClock className="h-4 w-4 mr-2" />
              Pickup: {formatDateTimeDisplay(load.pickupDateTime)}
            </div>
            <div className="flex items-center text-muted-foreground">
              <CalendarClock className="h-4 w-4 mr-2" />
              Delivery: {formatDateTimeDisplay(load.deliveryDateTime)}
            </div>
            <div className="flex items-center text-muted-foreground">
              <Milestone className="h-4 w-4 mr-2" />
              Distance: {load.distance} miles
            </div>
            <div className="flex items-center text-muted-foreground">
              <DollarSign className="h-4 w-4 mr-2" />
              Rate/Mile: ${load.ratePerMile.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
             {(load.tarpingFee && load.tarpingFee > 0) && (
              <div className="flex items-center text-muted-foreground">
                <DollarSign className="h-4 w-4 mr-2" />
                Tarping Fee: ${load.tarpingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
            {load.estimatedDriveTimeHours !== undefined && load.estimatedDriveTimeHours > 0 && (
              <div className="flex items-center text-muted-foreground">
                <Timer className="h-4 w-4 mr-2" />
                Est. Drive: {load.estimatedDriveTimeHours.toFixed(1)} hours
              </div>
            )}
            <div className="flex items-center font-semibold col-span-full sm:col-span-1">
              <DollarSign className="h-4 w-4 mr-2 text-primary" />
              Total Agreed: ${load.totalAgreedRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
        </div>

         { (load.cargoDescription || load.cargoDimensions || load.cargoWeight || load.requiresTarping !== undefined) && <Separator className="my-2" /> }

        {load.cargoDescription && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center"><Box className="h-3 w-3 mr-1.5"/>Cargo Description:</h4>
                <p className="text-xs ml-4">{load.cargoDescription}</p>
            </div>
        )}
        {load.cargoDimensions && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center"><Ruler className="h-3 w-3 mr-1.5"/>Cargo Dimensions:</h4>
                <p className="text-xs ml-4">{load.cargoDimensions}</p>
            </div>
        )}
        {load.cargoWeight && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center"><Weight className="h-3 w-3 mr-1.5"/>Cargo Weight:</h4>
                <p className="text-xs ml-4">{load.cargoWeight}</p>
            </div>
        )}
        {load.requiresTarping !== undefined && (
             <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center">
                  {load.requiresTarping ? <ShieldCheck className="h-3 w-3 mr-1.5 text-green-600"/> : <ShieldX className="h-3 w-3 mr-1.5 text-red-600"/>}
                  Tarping Required:
                </h4>
                <p className="text-xs ml-4">{load.requiresTarping ? 'Yes' : 'No'}</p>
            </div>
        )}

        {(projectedProfit !== null) && (
          <>
            <Separator className="my-3" />
            <div className="p-3 bg-blue-500/10 rounded-md space-y-2">
              <h4 className="font-semibold text-sm mb-1 flex items-center">
                <Info className="h-4 w-4 mr-1.5 text-blue-700" /> Projected Financials:
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>Est. Payroll:</span> <span className="text-right">${projectedPayroll.toFixed(2)}</span>
                <span>Est. Fuel:</span> <span className="text-right">${projectedFuelCost.toFixed(2)}</span>
                <span>Est. DEF:</span> <span className="text-right">${projectedDefCost.toFixed(2)}</span>
                <span>Est. Recurring:</span> <span className="text-right">${projectedRecurringDaily.toFixed(2)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between items-center font-semibold text-sm">
                <span>Projected Profit:</span>
                <span className={`flex items-center ${projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {projectedProfit >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                  ${projectedProfit.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground italic mt-1">Estimates based on current settings. Actuals calculated upon delivery.</p>
            </div>
          </>
        )}


        {load.status === 'delivered' && load.expenses.calculated && (
          <>
            <Separator className="my-3" />
            <div className="p-3 bg-muted/50 rounded-md space-y-2">
              <h4 className="font-semibold text-sm mb-1">Actual Expense Breakdown:</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>Payroll:</span> <span className="text-right">${load.expenses.payroll.toFixed(2)}</span>
                <span>Recurring:</span> <span className="text-right">${load.expenses.recurring.toFixed(2)}</span>
                <span>Fuel:</span> <span className="text-right">${load.expenses.fuel.toFixed(2)}</span>
                <span>DEF:</span> <span className="text-right">${load.expenses.def.toFixed(2)}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between items-center font-semibold text-sm">
                <span>Actual Profit:</span>
                <span className={actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  ${actualProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
        {load.specialTerms && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground mt-2">Special Terms:</h4>
                <p className="text-xs italic">{load.specialTerms}</p>
            </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-4 border-t mt-auto">
        <div className="flex gap-2 w-full sm:w-auto">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(load)}
                className="flex-1 sm:flex-none"
                disabled={isUpdatingStatus || isDeleting}
            >
                <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(load.id!)}
                className="flex-1 sm:flex-none"
                disabled={isUpdatingStatus}
            >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-col sm:flex-row mt-2 sm:mt-0">
            <Select
                value={load.status}
                onValueChange={(value) => onStatusChange(load.id!, value as Load['status'])}
                disabled={isUpdatingStatus || isDeleting}
            >
                <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="client-request-approved">Request Approved</SelectItem>
                <SelectItem value="in-transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
            </Select>
            <Button
                variant="outline"
                size="sm"
                onClick={() => onGenerateAgreement(load)}
                className="w-full sm:w-auto"
                disabled={!client || isUpdatingStatus || isDeleting}
            >
                <FileText className="h-4 w-4 mr-2" /> Agreement
            </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

