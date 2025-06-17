
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth'; // Renamed to avoid conflict with local User type
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { PDFDocument, rgb } from 'pdf-lib';
import { db, auth } from '@/lib/firebase';
import type { User, Load, Expense, Client, Settings, UserProfile, ClientLoadRequest } from '@/types';
import { useToast } from "@/hooks/use-toast";

// Page Components
import { AuthPage } from '@/components/auth/AuthPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LoadsPage } from '@/components/loads/LoadsPage';
import { ExpensesPage } from '@/components/expenses/ExpensesPage';
import { ClientsPage } from '@/components/clients/ClientsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import ClientPortalPage from '@/app/client-portal/page'; // Import ClientPortalPage

// Layout Components
import { AppHeader } from '@/components/layout/AppHeader';
import { AppNav } from '@/components/layout/AppNav';
import { AppFooter } from '@/components/layout/AppFooter';

import { LayoutDashboard, Package, DollarSign, Users, Cog, Loader2 } from 'lucide-react';

// Admin review mode flag
const IS_ADMIN_REVIEW_MODE = true;

const mockReviewUser: User = {
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
  role: 'admin', // Assign role for mock user
};


const initialSettings: Settings = {
  payrollPercentage: 25,
  defaultFuelCostPerGallon: 3.80, // Added default value
  defCostPerGallon: 3.5,
  recurringExpenses: [
    { name: 'Insurance', amount: 1200 },
    { name: 'Truck Payment', amount: 2500 },
  ],
  carrierName: '',
  carrierAddress: '',
  carrierDotNumber: '',
  carrierMcNumber: '',
  carrierContactName: '',
  carrierContactPhone: '',
  carrierContactEmail: '',
};

const SETTINGS_DOC_ID = 'userSettings';

export default function DashDispatchProApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(IS_ADMIN_REVIEW_MODE ? mockReviewUser : null);
  const [userRole, setUserRole] = useState<'admin' | 'client' | undefined>(IS_ADMIN_REVIEW_MODE ? mockReviewUser.role : undefined);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [appLoading, setAppLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const [loads, setLoads] = useState<Load[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [clientLoadRequests, setClientLoadRequests] = useState<ClientLoadRequest[]>([]);


  const [loadForm, setLoadForm] = useState<Omit<Load, 'id' | 'expenses'>>({
    clientId: '',
    origin: '',
    destination: '',
    rate: 0,
    distance: 0,
    status: 'pending',
    cargoDescription: '',
    requestedPickupDate: '',
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

  const fetchUserProfileAndData = useCallback(async (currentUser: FirebaseUser | User) => {
    if (!currentUser) {
      setUserRole(undefined);
      setAppLoading(false);
      return;
    }

    let currentRole: 'admin' | 'client' = 'admin'; // Default to admin

    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      currentRole = mockReviewUser.role!;
      setUser(mockReviewUser);
    } else {
      try {
        const profileRef = doc(db, `users/${currentUser.uid}/profile`);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userProfile = profileSnap.data() as UserProfile;
          currentRole = userProfile.role;
        } else {
          await setDoc(profileRef, { role: 'admin' });
          currentRole = 'admin';
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({ variant: "destructive", title: "Profile Error", description: "Could not fetch user profile." });
      }
    }

    setUserRole(currentRole);

    if (!(IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid)) {
        setUser({ ...(currentUser as FirebaseUser), role: currentRole });
    }


    if (currentRole === 'client') {
      setAppLoading(false);
      return;
    }

    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      setLoads([]);
      setExpenses([]);
      setClients([]);
      // For review mode, initialize settings (including new carrier fields)
      const reviewSettings = { ...initialSettings };
      setSettings(reviewSettings);
      setSettingsForm(reviewSettings);
      setClientLoadRequests([]);
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
        // Ensure all settings fields are present, merging with initialSettings for safety
        const completeSettings = { ...initialSettings, ...settingsData };
        setSettings(completeSettings);
        setSettingsForm(completeSettings);
      } else {
        await setDoc(settingsRef, initialSettings);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }

      const clientRequestsSnapshot = await getDocs(collection(db, 'clientLoadRequests'));
      setClientLoadRequests(clientRequestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClientLoadRequest)));


    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast({ variant: "destructive", title: "Fetch Error", description: error.message });
    } finally {
      setAppLoading(false);
    }
  }, [toast]);


  useEffect(() => {
    if (IS_ADMIN_REVIEW_MODE) {
      fetchUserProfileAndData(mockReviewUser);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(authUser => {
      if (authUser) {
        fetchUserProfileAndData(authUser);
      } else {
        setUser(null);
        setUserRole(undefined);
        setLoads([]);
        setExpenses([]);
        setClients([]);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
        setClientLoadRequests([]);
        setAppLoading(false);
      }
    });
    return () => unsubscribe();
  }, [fetchUserProfileAndData]);



  const handleSignUp = async (role: 'admin' | 'client' = 'admin') => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign up is disabled." });
      return;
    }
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const profileRef = doc(db, `users/${userCredential.user.uid}/profile`);
      await setDoc(profileRef, { role });

      if (role === 'admin') {
        const settingsRef = doc(db, `users/${userCredential.user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, initialSettings); // Save initial settings for new admin
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }
      setUserRole(role);
      toast({ title: "Account Created", description: `Welcome! You are registered as ${role}.` });
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast({ variant: "destructive", title: "Sign Up Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Already in review session." });
      fetchUserProfileAndData(mockReviewUser);
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
      setUser(null);
      setUserRole(undefined);
      setAppLoading(true);
      toast({ title: "Admin Review Mode", description: "Exited review session." });
      // To re-enter review mode immediately, you might need to manually trigger AuthPage or similar
      // For now, it will show loading and then likely the AuthPage if loading finishes.
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

  const addLoad = async (loadDataToAdd?: Omit<Load, 'id' | 'expenses'>) => {
    if (!user || user.role !== 'admin') return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      toast({title: "Admin Review Mode", description: "Adding load is disabled."});
      return;
    }
    setIsSubmitting(true);
    const newLoadData: Load = {
      ...(loadDataToAdd || loadForm),
      expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
    };
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadData);
      setLoads(prev => [...prev, { ...newLoadData, id: docRef.id }]);
      if (!loadDataToAdd) {
         setLoadForm({ clientId: '', origin: '', destination: '', rate: 0, distance: 0, status: 'pending', cargoDescription: '', requestedPickupDate: '' });
      }
      toast({ title: "Load Added", description: "New load has been successfully created." });
    } catch (error: any) {
      console.error('Error adding load:', error);
      toast({ variant: "destructive", title: "Error Adding Load", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateLoad = async (id: string, updates: Partial<Load>) => {
    if (!user || user.role !== 'admin') return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid && updates.status) {
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

  const approveClientLoadRequest = async (request: ClientLoadRequest) => {
    if (!user || user.role !== 'admin') return;
    setLoadForm({
      clientId: '', // Admin will need to select or create a client company from their list
      origin: request.origin,
      destination: request.destination,
      rate: 0, // Admin to set
      distance: 0, // Admin to set or calculate
      status: 'pending', // Initial status
      cargoDescription: request.cargoDescription,
      requestedPickupDate: request.requestedPickupDate,
      originalClientRequestId: request.id,
      requestedByClientName: request.requestedByClientName,
      requestedByAuthUid: request.requestedByClientUid,
    });
    try {
        setActiveTab('loads');
        toast({ title: "Process Client Request", description: "Load form pre-filled. Please complete and save." });

        const requestRef = doc(db, 'clientLoadRequests', request.id!);
        await updateDoc(requestRef, { status: 'viewed' }); // Mark as viewed
        setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
    } catch (error: any) {
        console.error("Error processing client request:", error);
        toast({variant: "destructive", title: "Error", description: "Could not process client request."});
    }
  };


  const addExpense = async () => {
    if (!user || user.role !== 'admin') return;
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
    if (!user || user.role !== 'admin') return;
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
    if (!user || user.role !== 'admin') return;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setSettings(settingsForm); // Update local state for review
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
    if (user?.role !== 'admin' || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      return;
    }
    // Only run this effect if user is an admin and not in review mode (for actual calculations)
    // Or, if you want calculations to show in review mode based on mock data, remove the review mode check from the condition
    loads.forEach(load => {
      if (load.status === 'delivered' && !load.expenses.calculated && load.id) {
        const payroll = load.rate * (settings.payrollPercentage / 100);
        const recurring = settings.recurringExpenses.reduce(
          (sum, expense) => sum + (expense.amount / 30), 0 // Assuming recurring expenses are monthly
        );
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        const fuelCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel')?.amount || 0;
        const defCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def')?.amount || (load.distance / 250 * settings.defCostPerGallon); // Example: 250 miles per gallon of DEF

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
  }, [loads, settings, expenses, user]); // Removed `updateLoad` from deps as it's stable if wrapped in useCallback or defined outside

  const generateAgreement = async (loadData: Load) => {
    if (!user || user.role !== 'admin') return;
    const client = clients.find(c => c.id === loadData.clientId);
    setIsSubmitting(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]); // Standard US Letter size roughly in points
      const { width, height } = page.getSize();
      const fontSize = 10;
      const titleFontSize = 14;
      const smallFontSize = 8;
      const margin = 50;

      const drawText = (text: string, x: number, y: number, size = fontSize, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, size, color });
      };

      // Header
      drawText('DASH DISPATCH PRO - SERVICE AGREEMENT', margin, height - margin, titleFontSize, rgb(0.1, 0.1, 0.1));
      let yPos = height - margin - 30;

      // Carrier Information Section
      drawText('CARRIER INFORMATION:', margin, yPos, fontSize, rgb(0.3, 0.3, 0.3)); yPos -= 15;
      drawText(`Name: ${settings.carrierName || 'N/A'}`, margin, yPos); yPos -= 15;
      drawText(`Address: ${settings.carrierAddress || 'N/A'}`, margin, yPos); yPos -= 15;
      drawText(`DOT #: ${settings.carrierDotNumber || 'N/A'} | MC #: ${settings.carrierMcNumber || 'N/A'}`, margin, yPos); yPos -= 15;
      drawText(`Contact: ${settings.carrierContactName || 'N/A'}`, margin, yPos); yPos -= 15;
      drawText(`Phone: ${settings.carrierContactPhone || 'N/A'} | Email: ${settings.carrierContactEmail || 'N/A'}`, margin, yPos); yPos -= 25;


      // Client & Load Details Section
      drawText('CLIENT & LOAD DETAILS:', margin, yPos, fontSize, rgb(0.3, 0.3, 0.3)); yPos -= 15;
      drawText(`Client: ${client?.name || loadData.requestedByClientName || 'N/A'}`, margin, yPos); yPos -= 15;
      drawText(`Contact: ${client?.contact || 'N/A'}`, margin, yPos); yPos -= 15;
      drawText(`Route: ${loadData.origin} to ${loadData.destination}`, margin, yPos); yPos -= 15;
      drawText(`Distance: ${loadData.distance} miles`, margin, yPos); yPos -= 15;
      drawText(`Rate: $${loadData.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos); yPos -= 15;
      if (loadData.cargoDescription) { drawText(`Cargo: ${loadData.cargoDescription}`, margin, yPos); yPos -=15; }
      if (loadData.requestedPickupDate) { drawText(`Requested Pickup: ${new Date(loadData.requestedPickupDate).toLocaleDateString()}`, margin, yPos); yPos -= 25;}


      // Financials (if calculated)
      if (loadData.status === 'delivered' && loadData.expenses.calculated) {
        drawText('FINANCIAL SUMMARY (ESTIMATED):', margin, yPos, fontSize, rgb(0.3, 0.3, 0.3)); yPos -= 15;
        drawText(`Est. Payroll: $${loadData.expenses.payroll.toFixed(2)}`, margin, yPos); yPos -= 15;
        drawText(`Est. Fuel: $${loadData.expenses.fuel.toFixed(2)}`, margin, yPos); yPos -= 15;
        drawText(`Est. DEF: $${loadData.expenses.def.toFixed(2)}`, margin, yPos); yPos -= 15;
        drawText(`Est. Recurring (Pro-rated for load): $${loadData.expenses.recurring.toFixed(2)}`, margin, yPos); yPos -= 15;
        const totalLoadExpenses = loadData.expenses.payroll + loadData.expenses.fuel + loadData.expenses.def + loadData.expenses.recurring;
        drawText(`Total Est. Expenses: $${totalLoadExpenses.toFixed(2)}`, margin, yPos); yPos -= 15;
        const profit = loadData.rate - totalLoadExpenses;
        drawText(`Estimated Profit: $${profit.toFixed(2)}`, margin, yPos, fontSize, profit >=0 ? rgb(0, 0.5, 0) : rgb(0.5,0,0)); yPos -= 25;
      } else {
        drawText('Financial summary will be available upon load delivery and expense calculation.', margin, yPos, smallFontSize, rgb(0.5,0.5,0.5)); yPos -= 25;
      }

      // Terms placeholder
      drawText('Terms & Conditions: Standard terms apply. Full T&C available upon request or at [YourWebsite.com/terms].', margin, yPos, smallFontSize, rgb(0.5,0.5,0.5)); yPos -= 20;


      // Signatures
      yPos = margin + 60; // Position signatures near bottom
      drawText('Client Signature:', margin, yPos);
      page.drawLine({ start: { x: margin + 100, y: yPos - 5 }, end: { x: margin + 300, y: yPos - 5 }, thickness: 1, color: rgb(0,0,0) });
      yPos -= 30;
      drawText('Carrier Signature:', margin, yPos);
      page.drawLine({ start: { x: margin + 100, y: yPos - 5 }, end: { x: margin + 300, y: yPos - 5 }, thickness: 1, color: rgb(0,0,0) });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `agreement-${loadData.id || 'newLoad'}-${loadData.origin}-to-${loadData.destination}.pdf`;
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

  const isLoading = appLoading || (auth.currentUser && userRole === undefined && !IS_ADMIN_REVIEW_MODE);


  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Dash Dispatch Pro...</p>
      </div>
    );
  }

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

  if (user && userRole === 'client') {
    return <ClientPortalPage user={user} onSignOut={handleSignOut} />;
  }

  if (user && userRole === 'admin') {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <AppHeader userEmail={user.email} onSignOut={handleSignOut} />
        <AppNav activeTab={activeTab} setActiveTab={setActiveTab} tabs={navTabs} />

        <main className="flex-grow container mx-auto py-6 px-4 md:px-0">
          {activeTab === 'dashboard' && <DashboardPage loads={loads} expenses={expenses} />}
          {activeTab === 'loads' && <LoadsPage
                                        loads={loads}
                                        clients={clients}
                                        clientLoadRequests={clientLoadRequests}
                                        loadForm={loadForm}
                                        setLoadForm={setLoadForm}
                                        addLoad={addLoad}
                                        updateLoadStatus={updateLoadStatus}
                                        generateAgreement={generateAgreement}
                                        approveClientLoadRequest={approveClientLoadRequest}
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

  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Finalizing session...</p>
      </div>
    );
}
