
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
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

  const fetchUserProfileAndData = useCallback(async (currentUser: FirebaseUser) => { // Use FirebaseUser here
    if (!currentUser) {
      setUserRole(undefined);
      setAppLoading(false);
      return;
    }

    let currentRole: 'admin' | 'client' = 'admin'; // Default to admin

    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      currentRole = mockReviewUser.role!;
      setUser(mockReviewUser); // Ensure full mock user object is set
    } else {
      try {
        const profileRef = doc(db, `users/${currentUser.uid}/profile`);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userProfile = profileSnap.data() as UserProfile;
          currentRole = userProfile.role;
        } else {
          // If no profile, default to admin or handle as needed
          // For now, let's create a default admin profile if one doesn't exist
          await setDoc(profileRef, { role: 'admin' });
          currentRole = 'admin';
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({ variant: "destructive", title: "Profile Error", description: "Could not fetch user profile." });
        // Keep currentRole as admin or handle error appropriately
      }
    }
    
    setUserRole(currentRole);
    // Augment the FirebaseUser with the role for the app's User state
    setUser({ ...currentUser, role: currentRole });


    if (currentRole === 'client') {
      setAppLoading(false); // Clients don't load admin data
      return;
    }

    // Admin data fetching
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      setLoads([]);
      setExpenses([]);
      setClients([]);
      setSettings(initialSettings);
      setSettingsForm(initialSettings);
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
        setSettings(settingsData);
        setSettingsForm(settingsData);
      } else {
        await setDoc(settingsRef, initialSettings);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }

      // Fetch client load requests (assuming they are in a top-level collection accessible by admin)
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
    const unsubscribe = auth.onAuthStateChanged(authUser => {
      if (authUser) {
        fetchUserProfileAndData(authUser);
      } else {
        setUser(null);
        setUserRole(undefined);
        setAppLoading(false); 
        // Clear admin-specific data
        setLoads([]);
        setExpenses([]);
        setClients([]);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
        setClientLoadRequests([]);
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
      // Create user profile with role
      const profileRef = doc(db, `users/${userCredential.user.uid}/profile`);
      await setDoc(profileRef, { role });

      if (role === 'admin') {
        const settingsRef = doc(db, `users/${userCredential.user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, initialSettings);
        setSettings(initialSettings); // Local state for immediate use if needed
        setSettingsForm(initialSettings);
      }
      setUserRole(role); // Set role immediately
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
      // For review mode, user is already "signed in" as mock.
      // fetchUserProfileAndData should handle setting role and data for mock user.
      toast({ title: "Admin Review Mode", description: "Already in review session." });
      fetchUserProfileAndData(mockReviewUser); // Re-trigger mock data load if needed
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will trigger fetchUserProfileAndData
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
      // In review mode, effectively "sign out" by clearing mock user state
      setUser(null);
      setUserRole(undefined);
      setAppLoading(true); // Show loading briefly before auth page (if review mode was disabled)
      toast({ title: "Admin Review Mode", description: "Exited review session." });
      // To truly exit review mode, IS_ADMIN_REVIEW_MODE would need to be toggled and app reloaded.
      // For now, this just clears the user locally.
      return;
    }
    setIsSubmitting(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will clear user and role
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
      ...(loadDataToAdd || loadForm), // Use provided data or current form state
      expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
    };
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadData);
      setLoads(prev => [...prev, { ...newLoadData, id: docRef.id }]);
      // Reset form only if not using provided data
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
    // Pre-fill load form with client request data
    setLoadForm({
      clientId: '', // Admin needs to select a client company
      origin: request.origin,
      destination: request.destination,
      rate: 0, // Admin needs to set rate
      distance: 0, // Admin might need to calculate/set distance
      status: 'pending', // Initial status for an approved load
      cargoDescription: request.cargoDescription,
      requestedPickupDate: request.requestedPickupDate,
    });
    // Optionally pass request ID to link or use in addLoad
    // For now, admin manually fills remaining and creates a new load.
    // Then, update the client request status.
    try {
        // Create the load (this will use the state from setLoadForm above if admin confirms)
        // This is a placeholder for the actual load creation from the form
        // For now, let's just switch to the loads tab and prefill the form
        setActiveTab('loads'); // Switch to loads tab where the form is
        toast({ title: "Process Client Request", description: "Load form pre-filled. Please complete and save." });

        // Update client request status to 'viewed' or 'processing'
        const requestRef = doc(db, 'clientLoadRequests', request.id!);
        await updateDoc(requestRef, { status: 'viewed' });
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

  const addClient = async () => { // Client here means customer of the trucking company
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
    if (user?.role !== 'admin' || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      return;
    }
    loads.forEach(load => {
      if (load.status === 'delivered' && !load.expenses.calculated && load.id) {
        const payroll = load.rate * (settings.payrollPercentage / 100);
        const recurring = settings.recurringExpenses.reduce(
          (sum, expense) => sum + (expense.amount / 30), 0 // Assuming monthly expenses, daily portion
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
  }, [loads, settings, expenses, user]);

  const generateAgreement = async (loadData: Load) => {
    if (!user || user.role !== 'admin') return;
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
      drawText(`Client: ${client?.name || loadData.requestedByClientName || 'N/A'}`, 50, yPos); yPos -= 30;
      drawText(`Contact: ${client?.contact || 'N/A'}`, 50, yPos); yPos -= 30;
      drawText(`Route: ${loadData.origin} to ${loadData.destination}`, 50, yPos); yPos -= 30;
      drawText(`Distance: ${loadData.distance} miles`, 50, yPos); yPos -= 30;
      drawText(`Rate: $${loadData.rate.toFixed(2)}`, 50, yPos); yPos -= 30;
      if (loadData.cargoDescription) { drawText(`Cargo: ${loadData.cargoDescription}`, 50, yPos); yPos -=30; }
      
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
    { id: 'clients', label: 'Clients', icon: Users }, // Client companies
    { id: 'settings', label: 'Settings', icon: Cog },
  ];

  // Determine effective loading state
  const isLoading = appLoading || (auth.currentUser && userRole === undefined && !IS_ADMIN_REVIEW_MODE);


  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Dash Dispatch Pro...</p>
      </div>
    );
  }

  if (!user && !IS_ADMIN_REVIEW_MODE) { // Not in review mode and no user
    return <AuthPage 
              email={email} 
              setEmail={setEmail} 
              password={password} 
              setPassword={setPassword} 
              handleSignIn={handleSignIn} 
              handleSignUp={handleSignUp} // Pass the modified handleSignUp
            />;
  }
  
  if (user && userRole === 'client') {
    return <ClientPortalPage user={user} onSignOut={handleSignOut} />;
  }
  
  // Render Admin App if user exists and role is admin
  if (user && userRole === 'admin') {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <AppHeader userEmail={user.email} onSignOut={handleSignOut} />
        <AppNav activeTab={activeTab} setActiveTab={setActiveTab} tabs={navTabs} />
        
        <main className="flex-grow container mx-auto py-6 px-4 md:px-0">
          {activeTab === 'dashboard' && <DashboardPage loads={loads} expenses={expenses} />}
          {activeTab === 'loads' && <LoadsPage 
                                        loads={loads} 
                                        clients={clients} // Client companies
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
          {activeTab === 'clients' && <ClientsPage // Client companies
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

  // Fallback if user exists but role is undefined (should be covered by isLoading) or other edge cases
  // This could redirect to login or show an error
  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Finalizing session...</p>
      </div>
    );
}
