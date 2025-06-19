
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth'; // Renamed to avoid conflict with local User type
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db, auth } from '@/lib/firebase';
import type { User, Load, Expense, Client, Settings, UserProfile, ClientLoadRequest } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { format as formatDate } from 'date-fns';


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
  truckMpg: 6, // Added
  truckAverageSpeed: 60, // Added
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
  loadingFee: 50,
  detentionFeeRate: 75,
  defaultSpecialTerms: "Standard carrier terms apply. Full terms available upon request. Payment due upon delivery unless otherwise agreed in writing. Late payments may incur additional charges. Carrier's liability for cargo loss or damage is limited to $100,000 unless otherwise agreed in writing and specified in Special Terms."
};

const SETTINGS_DOC_ID = 'userSettings';

// Helper to format load number
function formatLoadNumber(num: number): string {
  return `L-${String(num).padStart(4, '0')}`;
}

// Helper to format date-time string for input type="datetime-local"
const toDateTimeLocal = (isoString?: string): string => {
  if (!isoString) return new Date().toISOString().slice(0, 16);
  try {
    const date = new Date(isoString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      // If isoString is just a date (YYYY-MM-DD), append a default time
      if (isoString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return `${isoString}T09:00`;
      }
      return new Date().toISOString().slice(0, 16); // Fallback for invalid date string
    }
    return date.toISOString().slice(0, 16);
  } catch (e) {
    return new Date().toISOString().slice(0, 16); // Fallback for parsing errors
  }
};


export default function DashDispatchProApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
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


  const [loadForm, setLoadForm] = useState<Omit<Load, 'id' | 'expenses' | 'loadNumber' | 'totalAgreedRate'>>({
    clientId: '',
    origin: '',
    destination: '',
    pickupDateTime: toDateTimeLocal(),
    deliveryDateTime: toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()), // Default to next day
    ratePerMile: 0,
    distance: 0,
    status: 'pending',
    cargoDescription: '',
  });

  const [expenseForm, setExpenseForm] = useState<Omit<Expense, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: 0,
    loadId: '',
  });

  const [clientForm, setClientForm] = useState<Omit<Client, 'id'>>({
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
  });

  const [settingsForm, setSettingsForm] = useState<Settings>(initialSettings);

  const fetchUserProfileAndData = useCallback(async (currentUser: FirebaseUser | User) => {
    if (!currentUser) {
      setUserRole(undefined);
      setAppLoading(false);
      return;
    }

    let currentRole: 'admin' | 'client' = 'admin';

    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      currentRole = mockReviewUser.role!;
      setUser(mockReviewUser);
    } else if (!IS_ADMIN_REVIEW_MODE) {
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

    if (!(IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) && !IS_ADMIN_REVIEW_MODE) {
         setUser({ ...(currentUser as FirebaseUser), role: currentRole });
    }


    if (currentRole === 'client' && !IS_ADMIN_REVIEW_MODE) {
      setAppLoading(false);
      return;
    }
    
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      setLoads([]); 
      setExpenses([]);
      setClients([]);
      const reviewSettings = { ...initialSettings };
      setSettings(reviewSettings);
      setSettingsForm(reviewSettings);
      setClientLoadRequests([]);
      setAppLoading(false);
      return;
    }
    
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
      fetchUserProfileAndData(mockReviewUser); // Directly call with mock user for review mode
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
        setAppLoading(false); // Ensure loading is false if no user
      }
    });
    return () => unsubscribe();
  }, [fetchUserProfileAndData]);


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
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }
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
      fetchUserProfileAndData(mockReviewUser); // Re-trigger mock user flow if in review mode
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
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
      setAppLoading(true); 
      setTimeout(() => {
         fetchUserProfileAndData(mockReviewUser);
      }, 50); 
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
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

  const addLoad = async (loadDataToAdd?: Omit<Load, 'id' | 'expenses' | 'loadNumber' | 'totalAgreedRate'>) => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);

    const dataToUse = loadDataToAdd || loadForm;
    const calculatedTotalRate = dataToUse.distance * dataToUse.ratePerMile;
    
    let nextLoadNumeric = 1;
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
        nextLoadNumeric = loads.length + 1;
    } else if (user) {
        const loadsCollectionRef = collection(db, `users/${user.uid}/loads`);
        const q = query(loadsCollectionRef, orderBy('loadNumber', 'desc'), limit(1));
        try {
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const lastLoad = querySnapshot.docs[0].data() as Load;
                if (lastLoad.loadNumber) {
                    const lastNumericPart = parseInt(lastLoad.loadNumber.split('-')[1]);
                    if (!isNaN(lastNumericPart)) {
                        nextLoadNumeric = lastNumericPart + 1;
                    } else {
                        const allLoadsSnapshot = await getDocs(loadsCollectionRef);
                        nextLoadNumeric = allLoadsSnapshot.size + 1;
                    }
                } else {
                    const allLoadsSnapshot = await getDocs(loadsCollectionRef);
                    nextLoadNumeric = allLoadsSnapshot.size + 1;
                }
            } else {
                 const allLoadsSnapshot = await getDocs(loadsCollectionRef);
                 nextLoadNumeric = allLoadsSnapshot.size + 1;
            }
        } catch (e) {
            console.error("Error fetching last load number, falling back to collection size:", e);
            const allLoadsSnapshot = await getDocs(loadsCollectionRef);
            nextLoadNumeric = allLoadsSnapshot.size + 1;
        }
    }
    const newLoadNumber = formatLoadNumber(nextLoadNumeric);


    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      const newLoadData: Load = {
        id: `mock-load-${Date.now()}`,
        loadNumber: newLoadNumber,
        ...dataToUse,
        totalAgreedRate: calculatedTotalRate,
        expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
      };
      setLoads(prev => [...prev, newLoadData]);
      if (!loadDataToAdd) {
         setLoadForm({ clientId: '', origin: '', destination: '', pickupDateTime: toDateTimeLocal(), deliveryDateTime: toDateTimeLocal(new Date(Date.now() + 24*60*60*1000).toISOString()), ratePerMile: 0, distance: 0, status: 'pending', cargoDescription: '' });
      }
      toast({ title: "Admin Review: Load Added", description: `Load ${newLoadNumber} added to local view (not saved).` });
      setIsSubmitting(false);
      return;
    }

    const newLoadDataForFirestore: Omit<Load, 'id'> = { 
      loadNumber: newLoadNumber,
      ...dataToUse,
      totalAgreedRate: calculatedTotalRate,
      expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
    };
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadDataForFirestore);
      setLoads(prev => [...prev, { ...newLoadDataForFirestore, id: docRef.id }]);
      if (!loadDataToAdd) {
        setLoadForm({ clientId: '', origin: '', destination: '', pickupDateTime: toDateTimeLocal(), deliveryDateTime: toDateTimeLocal(new Date(Date.now() + 24*60*60*1000).toISOString()), ratePerMile: 0, distance: 0, status: 'pending', cargoDescription: '' });
      }
      toast({ title: "Load Added", description: `New load ${newLoadNumber} has been successfully created.` });
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
  }, [user, toast]); 


  const updateLoadStatus = async (id: string, status: Load['status']) => {
    await updateLoad(id, { status });
  };

  const approveClientLoadRequest = async (request: ClientLoadRequest) => {
    if (!user || user.role !== 'admin') return;
    
    let prefilledClientId = '';
   
    const loadDataFromRequest: Omit<Load, 'id' | 'expenses' | 'loadNumber' | 'totalAgreedRate'> = {
      clientId: prefilledClientId, 
      origin: request.origin,
      destination: request.destination,
      pickupDateTime: toDateTimeLocal(request.requestedPickupDate),
      deliveryDateTime: toDateTimeLocal(new Date(new Date(request.requestedPickupDate || Date.now()).getTime() + 24 * 60 * 60 * 1000).toISOString()), 
      ratePerMile: 0, 
      distance: 0, 
      status: 'client-request-approved' as Load['status'],
      cargoDescription: request.cargoDescription,
      originalClientRequestId: request.id,
      requestedByClientName: request.requestedByClientName,
      requestedByAuthUid: request.requestedByClientUid,
    };
    setLoadForm(loadDataFromRequest); 
    setActiveTab('loads');

    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
      toast({ title: "Admin Review: Client Request Processed", description: "Load form pre-filled locally. Request status updated to 'viewed' (not saved)." });
      return;
    }
    
    try {
        const requestRef = doc(db, 'clientLoadRequests', request.id!);
        await updateDoc(requestRef, { status: 'viewed' }); 
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
        id: `mock-expense-${Date.now()}`
      };
      setExpenses(prev => [...prev, newExpenseWithId]);
      setExpenseForm({ date: new Date().toISOString().split('T')[0], category: '', amount: 0, loadId: '' });
      toast({ title: "Admin Review: Expense Added", description: "Expense added to local view (not saved)." });
      setIsSubmitting(false);
      return;
    }

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
        id: `mock-client-${Date.now()}`
      };
      setClients(prev => [...prev, newClientWithId]);
      setClientForm({ companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: '' });
      toast({ title: "Admin Review: Client Added", description: "Client added to local view (not saved)." });
      setIsSubmitting(false);
      return;
    }

    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/clients`), clientForm);
      setClients(prev => [...prev, { ...clientForm, id: docRef.id }]);
      setClientForm({ companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: '' });
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
      setSettings(settingsForm);
      toast({ title: "Admin Review: Settings Updated", description: "Settings updated locally (not saved)." });
      setIsSubmitting(false);
      return;
    }

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
    if (user?.role !== 'admin') {
      return;
    }
  
    loads.forEach(load => {
      if (load.status === 'delivered' && !load.expenses.calculated && load.id) {
        const payroll = load.totalAgreedRate * (settings.payrollPercentage / 100);
        const recurring = settings.recurringExpenses.reduce(
          (sum, expense) => sum + (expense.amount / 30), 0 // Simplified: assumes all recurring expenses are monthly
        );
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        const fuelCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel')?.amount || 0;
        const defCost = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def')?.amount || (load.distance / 250 * settings.defCostPerGallon); // Simplified DEF calc

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
  }, [loads, settings, expenses, user, updateLoad]);

  const generateAgreement = async (loadData: Load) => {
    if (!user || user.role !== 'admin') return;
    const client = clients.find(c => c.id === loadData.clientId);
    if (!client) {
        toast({ variant: "destructive", title: "Client Not Found", description: "Cannot generate agreement without client details." });
        return;
    }
    setIsSubmitting(true); 
    try {
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 850]); 
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
        return y - size - (size > 10 ? 5 : 3); 
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

      yPos = drawTextLine('Hotshot Trucking Agreement', boldFont, titleFontSize, margin, yPos, rgb(0.1, 0.1, 0.1));
      if (loadData.loadNumber) {
        yPos = drawTextLine(`Load ID: ${loadData.loadNumber}`, boldFont, subTitleFontSize - 2, width - margin - 100, yPos + titleFontSize + 2); 
      }
      yPos -= lineSpacing / 2;

      const agreementDate = new Date().toLocaleDateString();
      yPos = drawRegularTextLine(`Date of Agreement: ${agreementDate}`, margin, yPos);
      yPos -= sectionSpacing;

      yPos = drawTextLine('PARTIES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      
      yPos = drawBoldTextLine('Carrier:', margin, yPos);
      yPos = drawRegularTextLine(settings.carrierName || 'N/A', margin + 10, yPos);
      yPos = drawRegularTextLine(settings.carrierAddress || 'N/A', margin + 10, yPos);
      yPos = drawRegularTextLine(`DOT#: ${settings.carrierDotNumber || 'N/A'} | MC#: ${settings.carrierMcNumber || 'N/A'}`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Contact: ${settings.carrierContactName || 'N/A'} (${settings.carrierContactPhone || 'N/A'})`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Email: ${settings.carrierContactEmail || 'N/A'}`, margin + 10, yPos);
      yPos -= lineSpacing;

      yPos = drawBoldTextLine('Customer:', margin, yPos);
      yPos = drawRegularTextLine(client.companyName || 'N/A', margin + 10, yPos);
      if (client.address) {
        yPos = drawRegularTextLine(client.address, margin + 10, yPos);
      }
      yPos = drawRegularTextLine(`Contact: ${client.contactName || 'N/A'}`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Phone: ${client.contactPhone || 'N/A'}`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Email: ${client.contactEmail || 'N/A'}`, margin + 10, yPos);
      yPos -= sectionSpacing;
      
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      yPos = drawTextLine('LOAD DETAILS', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      yPos = drawBoldTextLine('Description:', margin, yPos);
      yPos = drawRegularTextLine(loadData.cargoDescription || 'N/A', margin + 10, yPos);
      
      yPos = drawBoldTextLine('Pickup Location:', margin, yPos);
      yPos = drawRegularTextLine(loadData.origin, margin + 10, yPos);
      if (loadData.pickupDateTime) {
        yPos = drawRegularTextLine(`Scheduled Pickup: ${formatDate(new Date(loadData.pickupDateTime), 'PPP p')}`, margin + 10, yPos);
      }

      yPos = drawBoldTextLine('Delivery Location:', margin, yPos);
      yPos = drawRegularTextLine(loadData.destination, margin + 10, yPos);
       if (loadData.deliveryDateTime) {
        yPos = drawRegularTextLine(`Scheduled Delivery: ${formatDate(new Date(loadData.deliveryDateTime), 'PPP p')}`, margin + 10, yPos);
      }
      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      yPos = drawTextLine('RATES & FEES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      
      yPos = drawBoldTextLine('Rate per Mile:', margin, yPos);
      yPos = drawRegularTextLine(`$${loadData.ratePerMile.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 10, yPos);
      yPos = drawBoldTextLine('Estimated Distance:', margin, yPos);
      yPos = drawRegularTextLine(`${loadData.distance} miles`, margin + 10, yPos);
      yPos = drawBoldTextLine('Total Agreed Rate for Service:', margin, yPos);
      yPos = drawRegularTextLine(`$${loadData.totalAgreedRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 10, yPos);

      yPos = drawBoldTextLine('Loading/Unloading Fee:', margin, yPos);
      yPos = drawRegularTextLine(settings.loadingFee !== undefined ? `$${settings.loadingFee.toFixed(2)}` : "[As agreed / See Special Terms]", margin + 10, yPos);
      yPos = drawBoldTextLine('Detention Fee:', margin, yPos);
      yPos = drawRegularTextLine(settings.detentionFeeRate !== undefined ? `$${settings.detentionFeeRate.toFixed(2)}/hr (e.g., after 2 hours free time)` : "[As agreed / See Special Terms]", margin + 10, yPos);
      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      yPos = drawTextLine('SPECIAL TERMS & CONDITIONS', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      const specialTermsText = loadData.specialTerms || settings.defaultSpecialTerms || "Standard carrier terms apply. Full terms available upon request. Payment due upon delivery unless otherwise agreed in writing. Late payments may incur additional charges.";
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
          if (yPos < margin + 100) { 
              page = pdfDoc.addPage([600, 850]);
              yPos = height - margin;
              yPos = drawTextLine('SPECIAL TERMS & CONDITIONS (Continued)', boldFont, subTitleFontSize, margin, yPos);
              yPos -= lineSpacing * 0.75;
          }
          yPos = drawRegularTextLine(line, margin, yPos);
      }
      yPos -= sectionSpacing;
      

      if (yPos < margin + 150) { 
        page = pdfDoc.addPage([600, 850]);
        yPos = height - margin;
      }
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      yPos = drawTextLine('SIGNATURES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 2; 

      const signatureBoxWidth = (width - (margin * 3)) / 2; 
      const signatureBoxHeight = 60;
      const signatureYPos = yPos - signatureBoxHeight;

      drawRegularTextLine('Carrier Representative:', margin, yPos);
      page.drawRectangle({ x: margin, y: signatureYPos, width: signatureBoxWidth, height: signatureBoxHeight, borderColor: rgb(0,0,0), borderWidth: 1 });
      drawRegularTextLine('Date:', margin, signatureYPos - lineSpacing);
      drawLine(margin + 40, signatureYPos - lineSpacing + 3, margin + signatureBoxWidth, signatureYPos - lineSpacing + 3, 1);


      const customerSigX = margin + signatureBoxWidth + margin;
      drawRegularTextLine('Customer Representative:', customerSigX, yPos);
      page.drawRectangle({ x: customerSigX, y: signatureYPos, width: signatureBoxWidth, height: signatureBoxHeight, borderColor: rgb(0,0,0), borderWidth: 1 });
      drawRegularTextLine('Date:', customerSigX, signatureYPos - lineSpacing);
      drawLine(customerSigX + 40, signatureYPos - lineSpacing + 3, customerSigX + signatureBoxWidth, signatureYPos - lineSpacing + 3, 1);
      
      yPos = signatureYPos - lineSpacing * 2; 

      if (yPos < margin + 50) { 
        page = pdfDoc.addPage([600, 850]);
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
      link.download = `agreement-${loadData.loadNumber || loadData.id || 'newLoad'}.pdf`;
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
                                          settings={settings} // Pass settings here
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
  
  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Finalizing session...</p>
      </div>
    );
}

