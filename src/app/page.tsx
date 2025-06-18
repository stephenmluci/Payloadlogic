
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth'; // Renamed to avoid conflict with local User type
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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
      fetchUserProfileAndData(mockReviewUser); // Directly use mock user and skip Firebase auth listener
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
      setUser(null); // Clear mock user
      setUserRole(undefined);
      setAppLoading(true); // This will trigger the useEffect to call fetchUserProfileAndData(mockReviewUser) again
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

    const dataToUse = loadDataToAdd || loadForm;

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      const newLoadData: Load = {
        id: `mock-load-${Date.now()}`, // Mock ID
        ...dataToUse,
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
    const newLoadDataForFirestore: Omit<Load, 'id'> = { 
      ...dataToUse,
      expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
    };
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadDataForFirestore);
      setLoads(prev => [...prev, { ...newLoadDataForFirestore, id: docRef.id }]);
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
  }, [user, toast]); // setLoads removed as it's stable, only user and toast are external reactive dependencies for the callback itself


  const updateLoadStatus = async (id: string, status: Load['status']) => {
    // setIsSubmitting(true); // updateLoad handles its own internal logic, this might be redundant or could be for specific UI feedback
    await updateLoad(id, { status });
    // setIsSubmitting(false);
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
    setLoadForm(loadDataFromRequest); // Pre-fill the main load form
    setActiveTab('loads'); // Switch to loads tab to complete the form
    // Optional: Scroll or focus to the LoadForm component after tab switch might be a good UX touch.

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      // Update local clientLoadRequests state for review mode
      setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
      toast({ title: "Admin Review: Client Request Processed", description: "Load form pre-filled locally. Request status updated to 'viewed' (not saved)." });
      return;
    }
    
    // Actual mode: Update Firestore
    try {
        const requestRef = doc(db, 'clientLoadRequests', request.id!);
        await updateDoc(requestRef, { status: 'viewed', createdLoadId: `pending-${Date.now()}` }); // Mark as viewed, maybe link to a pending load concept
        setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
        toast({ title: "Process Client Request", description: "Load form pre-filled. Please complete and save the load. Request marked as viewed." });
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
    setIsSubmitting(true); 
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 850]); // Adjusted page height for more content
      const { width, height } = page.getSize();
      
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const fontSize = 10;
      const titleFontSize = 16;
      const subTitleFontSize = 12;
      const smallFontSize = 8;
      const lineSpacing = 15;
      const sectionSpacing = 25;
      const margin = 50;
      let yPos = height - margin;

      const drawTextLine = (text: string, fontToUse: any, size: number, x: number, y: number, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, font: fontToUse, size, color });
        return y - size - (size > 10 ? 5 : 3); // Adjust spacing based on font size
      };
      
      const drawBoldTextLine = (text: string, x: number, y: number) => {
        return drawTextLine(text, boldFont, fontSize, x, y);
      };

      const drawRegularTextLine = (text: string, x: number, y: number) => {
        return drawTextLine(text, font, fontSize, x, y);
      };
      
      const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 0.5) => {
        page.drawLine({start: {x: x1, y: y1}, end: {x: x2, y: y2}, thickness, color: rgb(0.7,0.7,0.7) });
      }

      // 1. Document Title
      yPos = drawTextLine('Hotshot Trucking Agreement', boldFont, titleFontSize, margin, yPos, rgb(0.1, 0.1, 0.1));
      yPos -= lineSpacing / 2;

      // 2. Date of Agreement
      const agreementDate = new Date().toLocaleDateString();
      yPos = drawRegularTextLine(`Date of Agreement: ${agreementDate}`, margin, yPos);
      yPos -= sectionSpacing;

      // 3. Parties
      yPos = drawTextLine('PARTIES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      
      // Carrier Information
      yPos = drawBoldTextLine('Carrier:', margin, yPos);
      yPos = drawRegularTextLine(settings.carrierName || 'N/A', margin + 10, yPos);
      yPos = drawRegularTextLine(settings.carrierAddress || 'N/A', margin + 10, yPos);
      yPos = drawRegularTextLine(`DOT#: ${settings.carrierDotNumber || 'N/A'} | MC#: ${settings.carrierMcNumber || 'N/A'}`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Contact: ${settings.carrierContactName || 'N/A'} (${settings.carrierContactPhone || 'N/A'})`, margin + 10, yPos);
      yPos -= lineSpacing;

      // Customer Information
      yPos = drawBoldTextLine('Customer:', margin, yPos);
      const customerName = client?.name || loadData.requestedByClientName || 'N/A';
      yPos = drawRegularTextLine(customerName, margin + 10, yPos);
      if (client?.contact) {
        yPos = drawRegularTextLine(`Contact: ${client.contact}`, margin + 10, yPos);
      }
      yPos -= sectionSpacing;
      
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));


      // 4. Load Details
      yPos = drawTextLine('LOAD DETAILS', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      yPos = drawBoldTextLine('Description:', margin, yPos);
      yPos = drawRegularTextLine(loadData.cargoDescription || 'N/A', margin + 10, yPos);
      yPos = drawBoldTextLine('Pickup Location:', margin, yPos);
      yPos = drawRegularTextLine(loadData.origin, margin + 10, yPos);
      yPos = drawBoldTextLine('Delivery Location:', margin, yPos);
      yPos = drawRegularTextLine(loadData.destination, margin + 10, yPos);
      if (loadData.requestedPickupDate) {
        yPos = drawBoldTextLine('Requested Pickup Date:', margin, yPos);
        yPos = drawRegularTextLine(new Date(loadData.requestedPickupDate).toLocaleDateString(), margin + 10, yPos);
      }
      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      // 5. Rates & Fees
      yPos = drawTextLine('RATES & FEES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      yPos = drawBoldTextLine('Total Agreed Rate for Service:', margin, yPos);
      yPos = drawRegularTextLine(`$${loadData.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 10, yPos);
      yPos = drawBoldTextLine('Estimated Distance:', margin, yPos);
      yPos = drawRegularTextLine(`${loadData.distance} miles`, margin + 10, yPos);
      
      // Placeholders for additional fees
      yPos = drawBoldTextLine('Loading/Unloading Fee:', margin, yPos);
      yPos = drawRegularTextLine(settings.loadingFee !== undefined ? `$${settings.loadingFee.toFixed(2)}` : "[As agreed / See Special Terms]", margin + 10, yPos);
      yPos = drawBoldTextLine('Detention Fee:', margin, yPos);
      yPos = drawRegularTextLine(settings.detentionFeeRate !== undefined ? `$${settings.detentionFeeRate.toFixed(2)}/hr (e.g., after 2 hours free time)` : "[As agreed / See Special Terms]", margin + 10, yPos);
      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      // 6. Special Terms
      yPos = drawTextLine('SPECIAL TERMS & CONDITIONS', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      const specialTermsText = loadData.specialTerms || settings.defaultSpecialTerms || "Standard carrier terms apply. Full terms available upon request. Payment due upon delivery unless otherwise agreed in writing. Late payments may incur additional charges.";
      // Simple text wrapping logic for special terms:
      const termsLines = [];
      const maxCharsPerLine = 85;
      let currentLine = "";
      specialTermsText.split(' ').forEach(word => {
          if ((currentLine + word).length > maxCharsPerLine) {
              termsLines.push(currentLine.trim());
              currentLine = word + " ";
          } else {
              currentLine += word + " ";
          }
      });
      termsLines.push(currentLine.trim());

      for (const line of termsLines) {
          if (yPos < margin + 100) { // Check if new page is needed for terms
              page.addPage([600, 850]);
              yPos = height - margin;
              yPos = drawTextLine('SPECIAL TERMS & CONDITIONS (Continued)', boldFont, subTitleFontSize, margin, yPos);
              yPos -= lineSpacing * 0.75;
          }
          yPos = drawRegularTextLine(line, margin, yPos);
      }
      yPos -= sectionSpacing;
      

      // Ensure enough space for signatures, otherwise add a new page
      if (yPos < margin + 150) { 
        page.addPage([600, 850]);
        yPos = height - margin;
      }
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));


      // 7. Signatures
      yPos = drawTextLine('SIGNATURES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 2;

      const signatureBoxWidth = (width - (margin * 3)) / 2;
      const signatureBoxHeight = 60;
      const signatureYPos = yPos - signatureBoxHeight;

      // Carrier Signature
      drawRegularTextLine('Carrier Representative:', margin, yPos);
      page.drawRectangle({ x: margin, y: signatureYPos, width: signatureBoxWidth, height: signatureBoxHeight, borderColor: rgb(0,0,0), borderWidth: 1 });
      drawRegularTextLine('Date:', margin, signatureYPos - lineSpacing);
      drawLine(margin + 40, signatureYPos - lineSpacing + 3, margin + signatureBoxWidth, signatureYPos - lineSpacing + 3, 1);


      // Customer Signature
      const customerSigX = margin + signatureBoxWidth + margin;
      drawRegularTextLine('Customer Representative:', customerSigX, yPos);
      page.drawRectangle({ x: customerSigX, y: signatureYPos, width: signatureBoxWidth, height: signatureBoxHeight, borderColor: rgb(0,0,0), borderWidth: 1 });
      drawRegularTextLine('Date:', customerSigX, signatureYPos - lineSpacing);
      drawLine(customerSigX + 40, signatureYPos - lineSpacing + 3, customerSigX + signatureBoxWidth, signatureYPos - lineSpacing + 3, 1);
      
      yPos = signatureYPos - lineSpacing * 2;


      // 8. Concluding Clause
      if (yPos < margin + 50) { 
        page.addPage([600, 850]);
        yPos = height - margin;
      }
      const footerText1 = "This agreement constitutes the entire understanding between the parties named herein.";
      const footerText2 = `Carrier's liability for cargo loss or damage is limited to $100,000 unless otherwise agreed in writing and specified in Special Terms.`;
      yPos = drawTextLine(footerText1, font, smallFontSize, margin, yPos, rgb(0.3,0.3,0.3));
      yPos = drawTextLine(footerText2, font, smallFontSize, margin, yPos, rgb(0.3,0.3,0.3));


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
                                          initialSettings={initialSettings}
                                        />}
        </main>

        <AppFooter />
      </div>
    );
  }
  
  // Fallback loading state if conditions above aren't met (e.g., role not yet defined)
  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Finalizing session...</p>
      </div>
    );
}
