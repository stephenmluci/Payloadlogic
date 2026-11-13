
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { ClientLoadRequest } from '@/types';
import { ClientLoadRequestForm } from '@/components/client-portal/ClientLoadRequestForm';
import { LogOut, Truck, Loader2, CheckCircle2, PlusCircle } from 'lucide-react';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import { addHours } from 'date-fns';
import { useApp } from '@/context/AppContext';

const toDateTimeLocalInput = (date: Date): string => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

type RequestFormState = Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'>;

export default function ClientPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, handleSignOut, isTrialSession } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const getInitialRequestFormState = (): RequestFormState => {
    const now = new Date();
    return {
      clientId: user?.clientId || (user as any)?.assignedClientId || user?.uid || '',
      companyName: user?.companyName || '',
      origin: { street: '', city: '', state: '', zip: '' },
      destination: { street: '', city: '', state: '', zip: '' },
      cargoDescription: '',
      cargoQuantity: 1,
      cargoWeightNum: undefined,
      cargoLength: undefined,
      cargoWidth: undefined,
      cargoHeight: undefined,
      placementMode: 'standard',
      requestedPickupDateTime: toDateTimeLocalInput(now),
      requestedDeliveryDateTime: toDateTimeLocalInput(addHours(now, 24)),
      requestContactName: user?.displayName || '',
      requestContactEmail: user?.email || '',
      requestContactPhone: '',
    };
  };

  const [requestForm, setRequestForm] = useState<RequestFormState>(getInitialRequestFormState());

  // Pre-fill name/email/client info from logged-in user
  useEffect(() => {
    if (user) {
      setRequestForm(prev => ({
        ...prev,
        clientId: prev.clientId || user.clientId || (user as any)?.assignedClientId || user.uid,
        companyName: prev.companyName || user.companyName || '',
        requestContactName: user.displayName || prev.requestContactName || '',
        requestContactEmail: user.email || prev.requestContactEmail || '',
      }));
    }
  }, [user]);

  // Redirect non-client users away
  useEffect(() => {
    if (!user || user.role !== 'client') {
      router.push('/login');
    }
  }, [user, router]);

  if (!user || user.role !== 'client') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Verifying access...</p>
      </div>
    );
  }

  const handleSubmitRequest = async () => {
    if (!auth.currentUser) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to submit a request.' });
      return;
    }

    // Validation — require city + state at minimum for both addresses (street is optional for clients)
    if (!requestForm.origin.city || !requestForm.origin.state) {
      toast({ variant: 'destructive', title: 'Missing Origin', description: 'Please enter at least City and State for the pickup location.' });
      return;
    }
    if (!requestForm.destination.city || !requestForm.destination.state) {
      toast({ variant: 'destructive', title: 'Missing Destination', description: 'Please enter at least City and State for the delivery location.' });
      return;
    }
    if (!requestForm.cargoDescription.trim()) {
      toast({ variant: 'destructive', title: 'Missing Cargo Description', description: 'Please describe what you need transported.' });
      return;
    }
    if (!requestForm.requestContactName.trim() || !requestForm.requestContactEmail.trim() || !requestForm.requestContactPhone.trim()) {
      toast({ variant: 'destructive', title: 'Missing Contact Info', description: 'Please complete your name, email, and phone number.' });
      return;
    }

    setIsSubmitting(true);

    if (isTrialSession) {
      // Simulate success in trial mode
      await new Promise(r => setTimeout(r, 800));
      setSubmitted(true);
      setIsSubmitting(false);
      return;
    }
    
    // Ensure a unique clientId is explicitly saved within the request payload
    const resolvedClientId = 
      requestForm.clientId?.trim() ||
      (user as any)?.clientId ||
      (user as any)?.assignedClientId ||
      auth.currentUser.uid;

    const newRequest: Record<string, any> = {
      ...requestForm,
      clientId: resolvedClientId,
      clientEmail: requestForm.requestContactEmail || auth.currentUser.email || '',
      requestedPickupDateTime: new Date(requestForm.requestedPickupDateTime).toISOString(),
      requestedDeliveryDateTime: new Date(requestForm.requestedDeliveryDateTime).toISOString(),
      requestedByClientUid: auth.currentUser.uid,
      requestedByClientName: auth.currentUser.displayName || auth.currentUser.email,
      submissionTimestamp: serverTimestamp(),
      status: 'new',
    };

    // Remove undefined properties so Firestore addDoc does not reject them
    Object.keys(newRequest).forEach(key => {
      if (newRequest[key] === undefined) {
        delete newRequest[key];
      }
    });

    try {
      await addDoc(collection(db, 'clientLoadRequests'), newRequest as Omit<ClientLoadRequest, 'id'>);
      setSubmitted(true);
    } catch (error: any) {
      console.error('Error submitting load request:', error);
      toast({ variant: 'destructive', title: 'Submission Error', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnother = () => {
    setSubmitted(false);
    setRequestForm(getInitialRequestFormState());
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-[#0c141f] border-b border-white/10 text-white shadow-md sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <PayloadLogicLogo variant="compact" iconSize={32} />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300 ml-1">
              Client Portal
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm hidden sm:inline text-primary-foreground/80">
                {user.displayName || user.email}
                {isTrialSession && <span className="ml-1 text-xs opacity-60">(Trial)</span>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-grow container mx-auto py-10 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          {submitted ? (
            /* ── Success State ── */
            <Card className="shadow-xl border-green-200">
              <CardContent className="flex flex-col items-center text-center py-14 px-8 space-y-5">
                <div className="rounded-full bg-green-100 p-5">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold font-headline text-green-800">Request Submitted!</h2>
                  <p className="text-muted-foreground mt-2 max-w-sm">
                    Your load request has been submitted successfully. Our team will review it and get back to you shortly.
                  </p>
                </div>
                <div className="bg-slate-50 border rounded-lg px-5 py-4 text-sm text-left w-full space-y-1">
                  <p><span className="font-medium">From:</span> {requestForm.origin.city}, {requestForm.origin.state}</p>
                  <p><span className="font-medium">To:</span> {requestForm.destination.city}, {requestForm.destination.state}</p>
                  <p><span className="font-medium">Cargo:</span> {requestForm.cargoDescription}</p>
                </div>
                <Button onClick={handleSubmitAnother} className="mt-2">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Submit Another Request
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* ── Request Form ── */
            <Card className="shadow-xl">
              <CardHeader>
                <CardTitle className="text-2xl font-headline">Submit a Load Request</CardTitle>
                <CardDescription>
                  Fill in the details below and we'll review your request and follow up with a quote.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ClientLoadRequestForm
                  requestForm={requestForm}
                  setRequestForm={setRequestForm}
                  onSubmit={(e) => { e.preventDefault(); handleSubmitRequest(); }}
                  isSubmitting={isSubmitting}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      
      <footer className="border-t bg-white text-muted-foreground py-5 mt-auto">
        <div className="container mx-auto text-center px-4 text-xs">
          &copy; {new Date().getFullYear()} PayloadLogic — Client Portal
        </div>
      </footer>
    </div>
  );
}
