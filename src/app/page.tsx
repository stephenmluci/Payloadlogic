
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, DocumentReference, DocumentData } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { PDFDocument, rgb } from 'pdf-lib';
import { db, auth } from '@/lib/firebase';
import type { User, Load, Expense, Client, Settings } from '@/types';
import { useToast } from "@/hooks/use-toast";

// Page Components
import { AuthPage } from '@/components/auth/AuthPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LoadsPage } from '@/components/loads/LoadsPage';
import { ExpensesPage } from '@/components/expenses/ExpensesPage';
import { ClientsPage } from '@/components/clients/ClientsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';

// Layout Components
import { AppHeader } from '@/components/layout/AppHeader';
import { AppNav } from '@/components/layout/AppNav';
import { AppFooter } from '@/components/layout/AppFooter';

import { LayoutDashboard, Package, DollarSign, Users, Cog, Loader2 } from 'lucide-react';

// Admin review mode flag
const IS_ADMIN_REVIEW_MODE = true;

const mockReviewUser = {
  uid: 'admin-reviewer-uid',
  email: 'reviewer@example.com',
  displayName: "Admin Reviewer",
  emailVerified: true,
  isAnonymous: false,
  photoURL: null,
  providerId: 'firebase',
  metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() },
  providerData: [{ providerId: 'password', uid: 'admin-reviewer-uid', displayName: 'Admin Reviewer', email: 'reviewer@example.com', photoURL: null, phoneNumber: null }],
  refreshToken: 'mockToken',
  tenantId: null,
  delete: async () => { console.log("Mock user delete called"); },
  getIdToken: async (_forceRefresh?: boolean) => "mock-id-token",
  getIdTokenResult: async (_forceRefresh?: boolean) => ({
    token: "mock-id-token",
    expirationTime: new Date(Date.now() + 3600 * 1000).toISOString(), 
    authTime: new Date().toISOString(),
    issuedAtTime: new Date().toISOString(),
    signInProvider: null,
    signInSecondFactor: null,
    claims: {},
  }),
  reload: async () => { console.log("Mock user reload called"); },
  toJSON: () => ({ uid: 'admin-reviewer-uid', email: 'reviewer@example.com', displayName: "Admin Reviewer" }),
} as User;


const initialSettings: Settings = {
  payrollPercentage: 25,
  defCostPerGallon: 3.5,
  recurringExpenses: [
    { name: 'Insurance', amount: 1200 },
    { name: 'Truck Payment', amount: 2500 },
  ]
};

const SETTINGS_DOC_ID = 'userSettings'; 

export default function DashDispatchProApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(IS_ADMIN_REVIEW_MODE ? mockReviewUser : null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [appLoading, setAppLoading] = useState(IS_ADMIN_REVIEW_MODE ? false : true); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  
  const [loads, setLoads] = useState<Load[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings);

  const [loadForm, setLoadForm] = useState<Omit<Load, 'id' | 'expenses'>>({
    clientId: '',
    origin: '',
    destination: '',
    rate: 0,
    distance: 0,
    status: 'pending',
  });
  
  const [expenseForm, setExpenseForm] = useState<Omit<Expense, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: 0,
    loadId: '',
  });
  
  const [clientForm, setClientForm] = useState<Omit<Client, 'id'>>({
    name: '',
    contact: '',
  });
  
  const [settingsForm, setSettingsForm] = useState<Settings>(initialSettings);

  const fetchData = useCallback(async (currentUser: User) => {
    if (!currentUser) return;
    
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      setLoads([]);
      setExpenses([]);
      setClients([]);
      setSettings(initialSettings);
      setSettingsForm(initialSettings);
      setAppLoading(false);
      return;
    }
    
    setAppLoading(true);
    try {
      const collectionsToFetch = [
        { name: 'loads', setter: setLoads },
        { name: 'expenses', setter: setExpenses },
        { name: 'clients', setter: setClients },
      ];

      for (const { name, setter } of collectionsToFetch) {
        const snapshot = await getDocs(collection(db, `users/${currentUser.uid}/${name}`));
        setter(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      }
      
      const settingsRef = doc(db, `users/${currentUser.uid}/settings`, SETTINGS_DOC_ID);
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data() as Settings;
        setSettings(settingsData);
        setSettingsForm(settingsData);
      } else {
        await setDoc(settingsRef, initialSettings);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({ variant: "destructive", title: "Fetch Error", description: error.message });
    } finally {
      setAppLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (IS_ADMIN_REVIEW_MODE) {
      setUser(mockReviewUser);
      fetchData(mockReviewUser);
      setAppLoading(false);
      return; 
    }

    const unsubscribe = auth.onAuthStateChanged(authUser => {
      setUser(authUser);
      if (authUser) {
        fetchData(authUser);
      } else {
        setAppLoading(false); 
        setLoads([]);
        setExpenses([]);
        setClients([]);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }
    });
    return () => unsubscribe();
  }, [fetchData]);


  const handleSignUp = async () => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign up is disabled." });
      return;
    }
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const settingsRef = doc(db, `users/${userCredential.user.uid}/settings`, SETTINGS_DOC_ID);
      await setDoc(settingsRef, initialSettings);
      setSettings(initialSettings);
      setSettingsForm(initialSettings);
      toast({ title: "Account Created", description: "Welcome to Dash Dispatch Pro!" });
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast({ variant: "destructive", title: "Sign Up Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign in is disabled." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Signed In", description: "Welcome back!" });
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast({ variant: "destructive", title: "Sign In Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign out is not applicable." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast({ variant: "destructive", title: "Sign Out Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addLoad = async () => {
    if (!user) return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      toast({title: "Admin Review Mode", description: "Adding load is disabled."});
      return;
    }
    setIsSubmitting(true);
    const newLoadData: Load = {
      ...loadForm,
      expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
    };
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadData);
      setLoads(prev => [...prev, { ...newLoadData, id: docRef.id }]);
      setLoadForm({ clientId: '', origin: '', destination: '', rate: 0, distance: 0, status: 'pending' });
      toast({ title: "Load Added", description: "New load has been successfully created." });
    } catch (error: any) {
      console.error('Error adding load:', error);
      toast({ variant: "destructive", title: "Error Adding Load", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateLoad = async (id: string, updates: Partial<Load>) => {
    if (!user) return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid && updates.status) {
       // Allow status updates for visual review, but don't persist
       setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...updates } : l));
       toast({ title: "Review Mode", description: `Load status changed to ${updates.status} (not saved).` });
       return;
    }
     if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      toast({title: "Admin Review Mode", description: "Updating load is disabled."});
      return;
    }
    try {
      await updateDoc(doc(db, `users/${user.uid}/loads`, id), updates);
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...updates } : l));
      if (updates.status) { 
        toast({ title: "Load Updated", description: `Load status changed to ${updates.status}.` });
      }
    } catch (error: any) {
      console.error('Error updating load:', error);
      toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
    }
  };
  
  const updateLoadStatus = async (id: string, status: Load['status']) => {
    setIsSubmitting(true); 
    await updateLoad(id, { status });
    setIsSubmitting(false);
  };


  const addExpense = async () => {
    if (!user) return;
     if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      toast({title: "Admin Review Mode", description: "Adding expense is disabled."});
      return;
    }
    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/expenses`), expenseForm);
      setExpenses(prev => [...prev, { ...expenseForm, id: docRef.id }]);
      setExpenseForm({ date: new Date().toISOString().split('T')[0], category: '', amount: 0, loadId: '' });
      toast({ title: "Expense Added", description: "Expense has been successfully recorded." });
    } catch (error: any) {
      console.error('Error adding expense:', error);
      toast({ variant: "destructive", title: "Error Adding Expense", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addClient = async () => {
    if (!user) return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      toast({title: "Admin Review Mode", description: "Adding client is disabled."});
      return;
    }
    setIsSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/clients`), clientForm);
      setClients(prev => [...prev, { ...clientForm, id: docRef.id }]);
      setClientForm({ name: '', contact: '' });
      toast({ title: "Client Added", description: "New client has been successfully added." });
    } catch (error: any) {
      console.error('Error adding client:', error);
      toast({ variant: "destructive", title: "Error Adding Client", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateSettings = async () => {
    if (!user) return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      // In review mode, update local state for visual feedback but don't persist
      setSettings(settingsForm);
      toast({ title: "Review Mode", description: "Settings updated locally (not saved)." });
      return;
    }
    setIsSubmitting(true);
    try {
      const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
      await updateDoc(settingsRef, settingsForm);
      setSettings(settingsForm);
      toast({ title: "Settings Updated", description: "Your settings have been saved." });
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast({ variant: "destructive", title: "Error Updating Settings", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid) {
      // Skip expense calculation effect in review mode to avoid unintended updates
      // or if you want to test it visually, ensure mock loads have necessary data
      return;
    }
    loads.forEach(load => {
      if (load.status === 'delivered' && !load.expenses.calculated && load.id) {
        const payroll = load.rate * (settings.payrollPercentage / 100);
        const recurring = settings.recurringExpenses.reduce(
          (sum, expense) => sum + (expense.amount / 30), 0
        );
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        const fuelCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel')?.amount || 0;
        const defCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def')?.amount || (load.distance / 250 * settings.defCostPerGallon);

        updateLoad(load.id, {
          expenses: {
            payroll,
            fuel: fuelCost, 
            def: defCost, 
            recurring,
            calculated: true
          }
        });
      }
    });
  }, [loads, settings, expenses, user]); // Added user dependency

  const generateAgreement = async (loadData: Load) => {
    const client = clients.find(c => c.id === loadData.clientId);
    setIsSubmitting(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      const { width, height } = page.getSize();
      const fontSize = 12;
      
      const drawText = (text: string, x: number, y: number, size = fontSize, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, size, color });
      };

      drawText('DASH DISPATCH PRO SERVICE AGREEMENT', 50, height - 50, fontSize + 4);
      
      let yPos = height - 100;
      drawText(`Client: ${client?.name || 'N/A'}`, 50, yPos); yPos -= 30;
      drawText(`Contact: ${client?.contact || 'N/A'}`, 50, yPos); yPos -= 30;
      drawText(`Route: ${loadData.origin} to ${loadData.destination}`, 50, yPos); yPos -= 30;
      drawText(`Distance: ${loadData.distance} miles`, 50, yPos); yPos -= 30;
      drawText(`Rate: $${loadData.rate.toFixed(2)}`, 50, yPos); yPos -= 30;
      
      if (loadData.expenses.calculated) {
        drawText(`Est. Payroll: $${loadData.expenses.payroll.toFixed(2)}`, 50, yPos); yPos -= 30;
        drawText(`Est. Recurring: $${loadData.expenses.recurring.toFixed(2)}`, 50, yPos); yPos -= 30;
        const profit = loadData.rate - (loadData.expenses.payroll + loadData.expenses.recurring + loadData.expenses.fuel + loadData.expenses.def);
        drawText(`Estimated Profit (after all known expenses): $${profit.toFixed(2)}`, 50, yPos); yPos -= 30;
      } else {
        drawText('Expenses not yet fully calculated.', 50, yPos); yPos -= 30;
      }
      
      yPos -= 50;
      drawText('Client Signature:', 50, yPos);
      page.drawLine({ start: { x: 150, y: yPos - 5 }, end: { x: 350, y: yPos - 5 }, thickness: 1, color: rgb(0,0,0) });
      yPos -= 30;
      drawText('Carrier Signature:', 50, yPos);
      page.drawLine({ start: { x: 150, y: yPos - 5 }, end: { x: 350, y: yPos - 5 }, thickness: 1, color: rgb(0,0,0) });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `agreement-${loadData.id || 'new'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast({ title: "Agreement Generated", description: "PDF has been downloaded." });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({ variant: "destructive", title: "PDF Error", description: "Could not generate service agreement." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const navTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'loads', label: 'Loads', icon: Package },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'settings', label: 'Settings', icon: Cog },
  ];

  if (appLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Dash Dispatch Pro...</p>
      </div>
    );
  }

  // Show AuthPage only if not in review mode and user is not logged in
  if (!user && !IS_ADMIN_REVIEW_MODE) {
    return <AuthPage 
              email={email} 
              setEmail={setEmail} 
              password={password} 
              setPassword={setPassword} 
              handleSignIn={handleSignIn} 
              handleSignUp={handleSignUp} 
            />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader userEmail={user ? user.email : ''} onSignOut={handleSignOut} />
      <AppNav activeTab={activeTab} setActiveTab={setActiveTab} tabs={navTabs} />
      
      <main className="flex-grow container mx-auto py-6 px-4 md:px-0">
        {activeTab === 'dashboard' && <DashboardPage loads={loads} expenses={expenses} />}
        {activeTab === 'loads' && <LoadsPage 
                                      loads={loads} 
                                      clients={clients} 
                                      loadForm={loadForm}
                                      setLoadForm={setLoadForm}
                                      addLoad={addLoad}
                                      updateLoadStatus={updateLoadStatus}
                                      generateAgreement={generateAgreement}
                                      isSubmittingLoad={isSubmitting}
                                      isUpdatingStatus={isSubmitting}
                                    />}
        {activeTab === 'expenses' && <ExpensesPage 
                                        expenses={expenses} 
                                        loads={loads}
                                        expenseForm={expenseForm}
                                        setExpenseForm={setExpenseForm}
                                        addExpense={addExpense}
                                        isSubmittingExpense={isSubmitting}
                                      />}
        {activeTab === 'clients' && <ClientsPage 
                                      clients={clients}
                                      clientForm={clientForm}
                                      setClientForm={setClientForm}
                                      addClient={addClient}
                                      setActiveTab={setActiveTab}
                                      setLoadFormClientId={(clientId) => setLoadForm(prev => ({ ...prev, clientId }))}
                                      isSubmittingClient={isSubmitting}
                                     />}
        {activeTab === 'settings' && <SettingsPage 
                                        settingsForm={settingsForm}
                                        setSettingsForm={setSettingsForm}
                                        updateSettings={updateSettings}
                                        isSavingSettings={isSubmitting}
                                      />}
      </main>
      
      <AppFooter />
    </div>
  );
}
