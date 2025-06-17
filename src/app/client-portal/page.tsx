
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; // For potential redirects
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { User, ClientLoadRequest } from '@/types';
import { ClientLoadRequestForm } from '@/components/client-portal/ClientLoadRequestForm';
import { LogOut, Truck, Loader2 } from 'lucide-react';

type ClientPortalPageProps = {
  user: User | null; // User object passed from main app
  onSignOut: () => Promise<void>;
};

export default function ClientPortalPage({ user, onSignOut }: ClientPortalPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestForm, setRequestForm] = useState<Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'>>({
    origin: '',
    destination: '',
    cargoDescription: '',
    requestedPickupDate: new Date().toISOString().split('T')[0], // Default to today
  });

  if (!user || user.role !== 'client') {
    // This page should only be accessible if user is a client.
    // Redirect or show error if accessed directly without proper role.
    // In a real app, Next.js middleware or route protection would handle this.
    // For now, if user prop isn't a client, show loading or redirect.
    if (typeof window !== 'undefined') router.push('/'); // Redirect to home if not client
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
    if (!requestForm.origin || !requestForm.destination || !requestForm.cargoDescription || !requestForm.requestedPickupDate) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please fill out all fields." });
      return;
    }

    setIsSubmitting(true);
    const newRequest: Omit<ClientLoadRequest, 'id'> = {
      ...requestForm,
      requestedByClientUid: auth.currentUser.uid,
      requestedByClientName: auth.currentUser.displayName || auth.currentUser.email,
      submissionTimestamp: serverTimestamp(),
      status: 'new',
    };

    try {
      await addDoc(collection(db, 'clientLoadRequests'), newRequest);
      toast({ title: "Request Submitted", description: "Your load request has been sent successfully." });
      setRequestForm({ origin: '', destination: '', cargoDescription: '', requestedPickupDate: new Date().toISOString().split('T')[0] }); // Reset form
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
              <span className="text-sm hidden md:inline">Welcome, {user.displayName || user.email}</span>
              <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign Out">
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
              onSubmit={handleSubmitRequest}
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

