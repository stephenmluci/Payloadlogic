
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
  defaultFuelCostPerGallon: 3.80,
  defCostPerGallon: 3.5,
  recurringExpenses: [
    { name: 'Insurance', amount: 1200 },
    { name: 'Truck Payment', amount: 2500 },
  ],
  carrierName: 'Mock Carrier LLC',
  carrierAddress: '123 Test Rd, Review City, ST 54321',
  carrierDotNumber: 'DOT123456',
  carrierMcNumber: 'MC654321',
  carrierContactName: 'Review Contact',
  carrierContactPhone: '(555) 000-1111',
  carrierContactEmail: 'contact@mockcarrier.com',
};

const SETTINGS_DOC_ID = 'userSettings';

export default function DashDispatchProApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null); // Initial state set by useEffect
  const [userRole, setUserRole] = useState<'admin' | 'client' | undefined>(undefined);

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
      setUser(mockReviewUser); // Ensure mock user is fully set
    } else if (!IS_ADMIN_REVIEW_MODE) { // Only fetch profile if not in review mode with mock user
      try {
        const profileRef = doc(db, `users/${currentUser.uid}/profile`);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userProfile = profileSnap.data() as UserProfile;
          currentRole = userProfile.role;
        } else {
          // For a real user, if profile doesn't exist, create it (e.g., defaulting to admin or based on signup)
          // This part might need adjustment based on how non-review users get roles
          await setDoc(profileRef, { role: 'admin' });
          currentRole = 'admin';
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({ variant: "destructive", title: "Profile Error", description: "Could not fetch user profile." });
      }
    }
    
    setUserRole(currentRole);

    if (!(IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) && !IS_ADMIN_REVIEW_MODE) {
         setUser({ ...(currentUser as FirebaseUser), role: currentRole });
    }


    if (currentRole === 'client' && !IS_ADMIN_REVIEW_MODE) { // Client specific data logic if any
      setAppLoading(false);
      return;
    }
    
    // Data fetching for Admin or Review Mode Admin
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      setLoads([]); // Start with empty data for review testing
      setExpenses([]);
      setClients([]);
      const reviewSettings = { ...initialSettings }; // Use a copy of initial settings
      setSettings(reviewSettings);
      setSettingsForm(reviewSettings);
      setClientLoadRequests([]);
      setAppLoading(false);
      return;
    }
    
    // Actual data fetching for logged-in admin (not in review mode)
    if (!IS_ADMIN_REVIEW_MODE) {
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
            const completeSettings = { ...initialSettings, ...settingsData };
            setSettings(completeSettings);
            setSettingsForm(completeSettings);
          } else {
            await setDoc(settingsRef, initialSettings);
            setSettings(initialSettings);
            setSettingsForm(initialSettings);
          }

          // Fetch client load requests (these are global, not user-specific)
          const clientRequestsSnapshot = await getDocs(collection(db, 'clientLoadRequests'));
          setClientLoadRequests(clientRequestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClientLoadRequest)));

        } catch (error: any) {
          console.error('Error fetching admin data:', error);
          toast({ variant: "destructive", title: "Fetch Error", description: error.message });
        } finally {
          setAppLoading(false);
        }
    }
  }, [toast]);


  useEffect(() => {
    if (IS_ADMIN_REVIEW_MODE) {
      fetchUserProfileAndData(mockReviewUser); // Directly use mock user
      return; // Skip Firebase auth listener in review mode
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
  }, [fetchUserProfileAndData]); // fetchUserProfileAndData is memoized


  const handleSignUp = async (role: 'admin' | 'client' = 'admin') => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign up is disabled in review mode." });
      return;
    }
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const profileRef = doc(db, `users/${userCredential.user.uid}/profile`);
      await setDoc(profileRef, { role });

      if (role === 'admin') {
        const settingsRef = doc(db, `users/${userCredential.user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, initialSettings);
        setSettings(initialSettings); // Set for current session
        setSettingsForm(initialSettings);
      }
      // User state will be updated by onAuthStateChanged
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
      fetchUserProfileAndData(mockReviewUser); // Re-initialize review session
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // User state will be updated by onAuthStateChanged
      toast({ title: "Signed In", description: "Welcome back!" });
    } catch (error: any)
     {
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
      setAppLoading(true); // Trigger loading state
      // This will cause useEffect to re-run fetchUserProfileAndData(mockReviewUser)
      // effectively "refreshing" the review session.
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signOut(auth);
      // User state will be cleared by onAuthStateChanged
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
    setIsSubmitting(true);

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      const newLoadData: Load = {
        id: `mock-load-${Date.now()}`, // Mock ID
        ...(loadDataToAdd || loadForm),
        expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
      };
      setLoads(prev => [...prev, newLoadData]);
      if (!loadDataToAdd) { // Reset form if not pre-filled (e.g. from client request)
         setLoadForm({ clientId: '', origin: '', destination: '', rate: 0, distance: 0, status: 'pending', cargoDescription: '', requestedPickupDate: '' });
      }
      toast({ title: "Admin Review: Load Added", description: "Load added to local view (not saved)." });
      setIsSubmitting(false);
      return;
    }

    // Actual Firestore operation
    const newLoadData: Omit<Load, 'id'> = { // For Firestore, don't include ID yet
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
  
  const updateLoad = useCallback(async (id: string, updates: Partial<Load>) => {
    if (!user || user.role !== 'admin') return;

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...updates } : l));
      let description = "Load details updated locally (not saved).";
      if (updates.status) {
        description = `Load status changed to ${updates.status} (not saved).`;
      } else if (updates.expenses?.calculated) {
        description = "Load expenses calculated and updated locally (not saved)."
      }
      toast({ title: "Admin Review: Load Updated", description });
      return;
    }

    // Actual update logic for non-review mode
    try {
      await updateDoc(doc(db, `users/${user.uid}/loads`, id), updates);
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...updates } : l));
      if (updates.status) {
        toast({ title: "Load Updated", description: `Load status changed to ${updates.status}.` });
      } else if (updates.expenses?.calculated) {
        toast({ title: "Load Updated", description: "Load expenses calculated and saved." });
      } else {
         toast({ title: "Load Updated", description: "Load details saved." });
      }
    } catch (error: any) {
      console.error('Error updating load:', error);
      toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
    }
  }, [user, toast, setLoads]);


  const updateLoadStatus = async (id: string, status: Load['status']) => {
    setIsSubmitting(true); // Consider if this is needed if updateLoad handles its own submission state
    await updateLoad(id, { status });
    setIsSubmitting(false);
  };

  const approveClientLoadRequest = async (request: ClientLoadRequest) => {
    if (!user || user.role !== 'admin') return;
    
    // Pre-fill form data for both review and actual mode
    const loadDataFromRequest = {
      clientId: '', // Admin will need to select or create a client company
      origin: request.origin,
      destination: request.destination,
      rate: 0, // Admin to set
      distance: 0, // Admin to set or calculate
      status: 'pending' as Load['status'],
      cargoDescription: request.cargoDescription,
      requestedPickupDate: request.requestedPickupDate,
      originalClientRequestId: request.id,
      requestedByClientName: request.requestedByClientName,
      requestedByAuthUid: request.requestedByClientUid,
    };
    setLoadForm(loadDataFromRequest);
    setActiveTab('loads'); // Switch to loads tab to complete the form

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
      toast({ title: "Admin Review: Client Request Processed", description: "Load form pre-filled locally. Request status updated to 'viewed' (not saved)." });
      return;
    }
    
    // Actual mode: Update Firestore
    try {
        const requestRef = doc(db, 'clientLoadRequests', request.id!);
        await updateDoc(requestRef, { status: 'viewed' }); // Mark as viewed
        setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
        toast({ title: "Process Client Request", description: "Load form pre-filled. Please complete and save. Request marked as viewed." });
    } catch (error: any) {
        console.error("Error processing client request:", error);
        toast({variant: "destructive", title: "Error", description: "Could not update client request status."});
    }
  };


  const addExpense = async () => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      const newExpenseWithId: Expense = {
        ...expenseForm,
        id: `mock-expense-${Date.now()}` // Generate a mock ID
      };
      setExpenses(prev => [...prev, newExpenseWithId]);
      setExpenseForm({ date: new Date().toISOString().split('T')[0], category: '', amount: 0, loadId: '' });
      toast({ title: "Admin Review: Expense Added", description: "Expense added to local view (not saved)." });
      setIsSubmitting(false);
      return;
    }

    // Actual Firestore operation
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
    setIsSubmitting(true);

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      const newClientWithId: Client = {
        ...clientForm,
        id: `mock-client-${Date.now()}` // Generate a mock ID
      };
      setClients(prev => [...prev, newClientWithId]);
      setClientForm({ name: '', contact: '' });
      toast({ title: "Admin Review: Client Added", description: "Client added to local view (not saved)." });
      setIsSubmitting(false);
      return;
    }

    // Actual Firestore operation
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
    setIsSubmitting(true);

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setSettings(settingsForm); // Update local state for review
      setSettingsForm(settingsForm); // Ensure form reflects saved local state
      toast({ title: "Admin Review: Settings Updated", description: "Settings updated locally (not saved)." });
      setIsSubmitting(false);
      return;
    }

    // Actual Firestore operation
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
    // Only run this effect if user is an admin
    if (user?.role !== 'admin') {
      return;
    }
  
    loads.forEach(load => {
      if (load.status === 'delivered' && !load.expenses.calculated && load.id) {
        const payroll = load.rate * (settings.payrollPercentage / 100);
        const recurring = settings.recurringExpenses.reduce(
          (sum, expense) => sum + (expense.amount / 30), 0 // Assuming recurring expenses are monthly, pro-rated daily for load
        );
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        const fuelCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel')?.amount || 0;
        const defCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def')?.amount || (load.distance / 250 * settings.defCostPerGallon); 

        // The updateLoad call will be handled by its own IS_ADMIN_REVIEW_MODE check
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
  }, [loads, settings, expenses, user, updateLoad]); // updateLoad is now a dependency

  const generateAgreement = async (loadData: Load) => {
    if (!user || user.role !== 'admin') return;
    const client = clients.find(c => c.id === loadData.clientId);
    setIsSubmitting(true); // Might want a specific submitting state for PDF generation
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]); 
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

      // Carrier Information Section (from settings state)
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

  const isLoading = appLoading || (user === null && !IS_ADMIN_REVIEW_MODE) || (user !== null && userRole === undefined && !IS_ADMIN_REVIEW_MODE) || (IS_ADMIN_REVIEW_MODE && !user);


  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Dash Dispatch Pro...</p>
      </div>
    );
  }

  if (!user && !IS_ADMIN_REVIEW_MODE) { // Show AuthPage if no user and not in forced review mode
    return <AuthPage
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              handleSignIn={handleSignIn}
              handleSignUp={handleSignUp}
            />;
  }
  
  // At this point, user is either mockReviewUser (if IS_ADMIN_REVIEW_MODE) or an actual authenticated user.
  // userRole should also be set.

  if (user && userRole === 'client') {
    return <ClientPortalPage user={user} onSignOut={handleSignOut} />;
  }

  // User is admin (either mock or real)
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
                                        isSubmittingLoad={isSubmitting} // Consider more granular submitting states
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
  
  // Fallback loading state if conditions above aren't met (e.g., role not yet defined)
  // This can happen briefly during initial load or if logic has an edge case.
  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Finalizing session...</p>
      </div>
    );
}

