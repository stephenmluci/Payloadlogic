
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { ClientLoadRequest } from '@/types';
import { ClientLoadRequestForm } from '@/components/client-portal/ClientLoadRequestForm';
import { LogOut, Truck, Loader2 } from 'lucide-react';
import { addHours } from 'date-fns';
import { useApp } from '@/context/AppContext';

const toDateTimeLocalInput = (date: Date): string => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

export default function ClientPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, handleSignOut, isTrialSession } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const getInitialRequestFormState = (): Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'> => {
    const now = new Date();
    const pickupDateTime = toDateTimeLocalInput(now);
    const deliveryDateTime = toDateTimeLocalInput(addHours(now, 24));

    return {
      origin: '',
      destination: '',
      cargoDescription: '',
      requestedPickupDateTime: pickupDateTime,
      requestedDeliveryDateTime: deliveryDateTime,
      requestContactName: user?.displayName || '',
      requestContactEmail: user?.email || '',
      requestContactPhone: '',
    };
  };

  const [requestForm, setRequestForm] = useState(getInitialRequestFormState());

  useEffect(() => {
    if (user) {
       setRequestForm(prev => ({
           ...prev,
           requestContactName: user.displayName || prev.requestContactName || '',
           requestContactEmail: user.email || prev.requestContactEmail || '',
       }));
    }
  }, [user]);

  if (!user || user.role !== 'client') {
    if (typeof window !== 'undefined') router.push('/');
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="ml-2">Verifying access...</p>
        </div>
    );
  }

  const handleSubmitRequest = async () => {
    if (!auth.currentUser) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to submit a request." });
      return;
    }
    if (!requestForm.origin || !requestForm.destination || !requestForm.cargoDescription || 
        !requestForm.requestedPickupDateTime || !requestForm.requestedDeliveryDateTime ||
        !requestForm.requestContactName || !requestForm.requestContactEmail || !requestForm.requestContactPhone) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please fill out all fields, including contact details and date/times." });
      return;
    }

    setIsSubmitting(true);

    if (isTrialSession) {
      toast({ title: "Trial Mode", description: "Load request submitted (not saved in trial mode)." });
      setRequestForm(getInitialRequestFormState());
      setIsSubmitting(false);
      return;
    }
    
    const newRequest: Omit<ClientLoadRequest, 'id'> = {
      ...requestForm,
      requestedPickupDateTime: new Date(requestForm.requestedPickupDateTime).toISOString(),
      requestedDeliveryDateTime: new Date(requestForm.requestedDeliveryDateTime).toISOString(),
      requestedByClientUid: auth.currentUser.uid,
      requestedByClientName: auth.currentUser.displayName || auth.currentUser.email,
      submissionTimestamp: serverTimestamp(),
      status: 'new',
    };

    try {
      await addDoc(collection(db, 'clientLoadRequests'), newRequest);
      toast({ title: "Request Submitted", description: "Your load request has been sent successfully." });
      setRequestForm(getInitialRequestFormState());
    } catch (error: any) {
      console.error("Error submitting load request:", error);
      toast({ variant: "destructive", title: "Submission Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Truck className="h-8 w-8" />
            <h1 className="text-2xl font-bold font-headline">Client Load Request</h1>
          </div>
          {user && (
            <div className="flex items-center space-x-4">
              <span className="text-sm hidden md:inline">Welcome, {user.displayName || user.email} {isTrialSession ? "(Trial Mode)" : ""}</span>
              <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign Out">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-grow container mx-auto py-10 px-4 md:px-6 flex flex-col items-center">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Submit a New Load Request</CardTitle>
            <CardDescription>Fill in the details below and we'll get back to you shortly.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientLoadRequestForm
              requestForm={requestForm}
              setRequestForm={setRequestForm}
              onSubmit={(e) => { e.preventDefault(); handleSubmitRequest();}}
              isSubmitting={isSubmitting}
            />
          </CardContent>
        </Card>
      </main>
      
      <footer className="bg-gray-800 text-gray-300 py-6 mt-auto">
        <div className="container mx-auto text-center px-4 md:px-6">
            <p className="text-sm">&copy; {new Date().getFullYear()} Dash Dispatch Pro - Client Portal</p>
        </div>
      </footer>
    </div>
  );
}
