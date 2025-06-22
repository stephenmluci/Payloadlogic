
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth'; // Renamed to avoid conflict with local User type
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db, auth } from '@/lib/firebase';
import type { User, Load, Expense, Client, Settings, UserProfile, ClientLoadRequest } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { format as formatDate, differenceInCalendarDays, parseISO } from 'date-fns';
import { sendNotificationEmail, type SendNotificationEmailInput } from '@/ai/flows/send-notification-email';


// Page Components
import { AuthPage } from '@/components/auth/AuthPage';
import { SubscriptionPage } from '@/components/subscription/SubscriptionPage'; // New
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LoadsPage } from '@/components/loads/LoadsPage';
import { ExpensesPage } from '@/components/expenses/ExpensesPage';
import { ClientsPage } from '@/components/clients/ClientsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import ClientPortalPage from '@/app/client-portal/page';

// Layout Components
import { AppHeader } from '@/components/layout/AppHeader';
import { AppNav } from '@/components/layout/AppNav';
import { AppFooter } from '@/components/layout/AppFooter';

import { LayoutDashboard, Package, DollarSign, Users, Cog, Loader2 } from 'lucide-react';

// Admin review mode flag
const IS_ADMIN_REVIEW_MODE = true; 

type AppDisplayState = 'loading' | 'auth' | 'subscription_choice' | 'admin_dashboard' | 'client_portal';

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
  role: 'admin',
};


const initialSettings: Settings = {
  payrollPercentage: 25,
  defaultFuelCostPerGallon: 3.80,
  defCostPerGallon: 3.5,
  truckMpg: 6,
  truckAverageSpeed: 60,
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
  defaultSpecialTerms: "Standard carrier terms apply. Full terms available upon request. Payment due upon delivery unless otherwise agreed in writing. Late payments may incur additional charges. Carrier's liability for cargo loss or damage is limited to $100,000 unless otherwise agreed in writing and specified in Special Terms.",
  trailerType: 'Flatbed',
  trailerDimensions: '48ft L x 8.5ft W',
  trailerWeightCapacity: '48000 lbs',
  trailerHitchType: 'gooseneck',
  trailerDeckHeight: '34 in',
};

const SETTINGS_DOC_ID = 'userSettings';

function formatLoadNumber(num: number): string {
  return `L-${String(num).padStart(4, '0')}`;
}

const toDateTimeLocalInput = (isoString?: string): string => {
  if (!isoString) return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      if (isoString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const withTime = `${isoString}T09:00:00Z`; // Assume a default time if only date is provided
        const localDateFromDateOnly = new Date(new Date(withTime).getTime() - new Date().getTimezoneOffset() * 60000);
        return localDateFromDateOnly.toISOString().slice(0,16);
      }
      return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  } catch (e) {
    return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
};


const initialLoadFormData: Partial<Load> = {
  clientId: '',
  origin: '',
  destination: '',
  pickupDateTime: toDateTimeLocalInput(),
  deliveryDateTime: toDateTimeLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
  ratePerMile: 0,
  distance: 0,
  status: 'pending',
  cargoDescription: '',
  cargoDimensions: '',
  cargoWeight: '',
  specialTerms: '',
  requiresTarping: false,
  tarpingFee: 0,
  estimatedDriveTimeHours: undefined,
};

// Helper function to parse dimension strings (e.g., "48ft L x 8.5ft W", "10x8x6", "120in H")
// Returns an object { length: number | null, width: number | null, height: number | null } in feet.
const parseDimensionString = (dimStr: string | undefined): { length: number | null, width: number | null, height: number | null } => {
  if (!dimStr || typeof dimStr !== 'string') return { length: null, width: null, height: null };

  let length: number | null = null;
  let width: number | null = null;
  let height: number | null = null;

  const getValInFeet = (valueStr: string, unitStr: string | undefined): number => {
    const num = parseFloat(valueStr);
    if (unitStr?.toLowerCase() === 'in' || unitStr === '"') return num / 12;
    return num; // Assume feet if 'ft', "'", or no unit specific to L/W/H
  };
  
  // Try to extract L, W, H with units explicitly
  const lMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(ft|'|in|"|)\s*[lL]/i);
  const wMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(ft|'|in|"|)\s*[wW]/i);
  const hMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(ft|'|in|"|)\s*[hH]/i);

  if (lMatch) length = getValInFeet(lMatch[1], lMatch[2]);
  if (wMatch) width = getValInFeet(wMatch[1], wMatch[2]);
  if (hMatch) height = getValInFeet(hMatch[1], hMatch[2]);

  // Fallback for "Number x Number x Number" or "Number x Number" (assuming feet)
  // This is less robust and should only apply if L/W/H specific matches weren't found or weren't all found
  if (length === null || width === null || (dimStr.toLowerCase().includes('x') && height === null)) {
      const parts = dimStr.toLowerCase().split('x').map(part => part.trim());
      const attemptParseSimple = (valStr: string) => {
          // Check if it already contains L,W,H designator from previous regex
          if (/[lwh]/i.test(valStr) && (valStr.includes('ft') || valStr.includes("'") || valStr.includes('in') || valStr.includes('"'))) {
              // It was likely parsed by specific L/W/H regex already, or should be
              return null; 
          }
          const numMatch = valStr.match(/^(\d+(?:\.\d+)?)\s*(ft|'|in|"|)?/i);
          if (numMatch) return getValInFeet(numMatch[1], numMatch[2]);
          return null;
      };
      
      if (parts.length >= 1 && length === null) length = attemptParseSimple(parts[0]) ?? length;
      if (parts.length >= 2 && width === null) width = attemptParseSimple(parts[1]) ?? width;
      if (parts.length >= 3 && height === null) height = attemptParseSimple(parts[2]) ?? height;
  }
   // If still no L/W/H but just numbers (e.g. "10 8 6")
   if (length === null && width === null && height === null && !dimStr.toLowerCase().includes('x') && !/[lwh]/i.test(dimStr.toLowerCase())) {
    const numericParts = dimStr.split(/\s+/).map(p => parseFloat(p)).filter(p => !isNaN(p));
    if (numericParts.length > 0 && length === null) length = numericParts[0]; // Assume feet
    if (numericParts.length > 1 && width === null) width = numericParts[1]; // Assume feet
    if (numericParts.length > 2 && height === null) height = numericParts[2]; // Assume feet
  }


  return { length, width, height };
};

const parseSingleDimensionToFeet = (dimStr: string | undefined): number | null => {
  if (!dimStr || typeof dimStr !== 'string') return null;
  // Regex to capture a number (including decimals) and an optional unit (ft, ', in, ")
  const match = dimStr.trim().match(/^(\d+(?:\.\d+)?)\s*(ft|'|in|"|)/i);
  
  if (match) {
    const num = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase();
    if (unit === 'in' || unit === '"') {
      return num / 12;
    }
    return num; // Assumes feet for 'ft', "'", or no matched unit
  }
  
  // Fallback for unitless number
  const num = parseFloat(dimStr);
  return isNaN(num) ? null : num;
};

const MAX_TOTAL_HEIGHT_FEET = 13.5; // 13 feet 6 inches

const navTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'loads', label: 'Loads', icon: Package },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'settings', label: 'Settings', icon: Cog },
];

export default function DashDispatchProApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  
  const [appDisplayState, setAppDisplayState] = useState<AppDisplayState>('loading');
  const [isTrialSession, setIsTrialSession] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const [loads, setLoads] = useState<Load[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [clientLoadRequests, setClientLoadRequests] = useState<ClientLoadRequest[]>([]);

  const [loadForm, setLoadForm] = useState<Partial<Load>>(initialLoadFormData);
  const [editingLoadId, setEditingLoadId] = useState<string | null>(null);


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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [activeTab]);

  const fetchUserProfileAndData = useCallback(async (currentUser: FirebaseUser | User) => {
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      setUser(mockReviewUser);
      setLoads([]); setExpenses([]); setClients([]); setClientLoadRequests([]);
      const reviewSettings = { ...initialSettings };
      setSettings(reviewSettings); setSettingsForm(reviewSettings);
      setAppDisplayState('admin_dashboard');
      return;
    }
  
    if (isTrialSession) {
      const trialUserProfileRef = doc(db, `users/${currentUser.uid}/profile`);
      const trialProfileSnap = await getDoc(trialUserProfileRef);
      let currentTrialRole: 'admin' | 'client' = 'admin'; 
      if (trialProfileSnap.exists()) {
        currentTrialRole = (trialProfileSnap.data() as UserProfile).role;
      }
      setUser({ ...(currentUser as FirebaseUser), role: currentTrialRole });
      setLoads([]); setExpenses([]); setClients([]); setClientLoadRequests([]);
      setSettings(initialSettings); setSettingsForm(initialSettings);
      setAppDisplayState(currentTrialRole === 'client' ? 'client_portal' : 'admin_dashboard');
      return;
    }
  
    let fetchedRole: 'admin' | 'client' = 'admin'; 
    let shouldGoToSubscriptionChoice = false;
  
    try {
      const profileRef = doc(db, `users/${currentUser.uid}/profile`);
      const profileSnap = await getDoc(profileRef);
  
      if (profileSnap.exists()) {
        const userProfile = profileSnap.data() as UserProfile;
        fetchedRole = userProfile.role;
      } else {
        shouldGoToSubscriptionChoice = true;
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      toast({ variant: "destructive", title: "Profile Error", description: "Could not fetch user profile." });
      setAppDisplayState('auth'); 
      return;
    }
    
    const augmentedUser = { ...(currentUser as FirebaseUser), role: fetchedRole };
    setUser(augmentedUser);

    if (shouldGoToSubscriptionChoice) {
        setAppDisplayState('subscription_choice');
        return;
    }
  
    if (augmentedUser.role === 'client') {
      setAppDisplayState('client_portal');
      return;
    }
  
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
      
      setAppDisplayState('admin_dashboard');
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast({ variant: "destructive", title: "Fetch Error", description: error.message });
      setAppDisplayState('auth'); 
    }
  }, [toast, isTrialSession]); 


  // Effect 1: Handles Firebase auth state changes ONLY
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setAuthUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Effect 2: Reacts to authUser changes to fetch data or reset state
  useEffect(() => {
    const handleLogoutState = () => {
      setUser(null);
      setIsTrialSession(false);
      setLoads([]);
      setExpenses([]);
      setClients([]);
      setClientLoadRequests([]);
      setSettings(initialSettings);
      setSettingsForm(initialSettings);
      setAppDisplayState('auth');
    };

    if (IS_ADMIN_REVIEW_MODE && !isTrialSession && (!user || user.uid !== mockReviewUser.uid)) {
      if (appDisplayState === 'loading' || user?.uid !== mockReviewUser.uid) {
        fetchUserProfileAndData(mockReviewUser);
      }
      return; 
    }
    
    if (authUser) {
      if (!user || user.uid !== authUser.uid || (isTrialSession && !user.isAnonymous)) {
          fetchUserProfileAndData(authUser);
      }
    } else {
      if (user) {
        handleLogoutState();
      } else if (appDisplayState !== 'auth') {
        setAppDisplayState('auth');
      }
    }
  }, [authUser, isTrialSession, fetchUserProfileAndData, user, appDisplayState]);


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

      // No need to call setUser or setAppDisplayState here.
      // The onAuthStateChanged listener will pick up the new user and trigger the data fetching effect.
      toast({ title: "Account Created", description: `Welcome! Please choose your subscription.` });
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast({ variant: "destructive", title: "Sign Up Error", description: error.message });
      setAppDisplayState('auth'); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    if (IS_ADMIN_REVIEW_MODE && !isTrialSession && email === mockReviewUser.email) {
      fetchUserProfileAndData(mockReviewUser); 
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Signed In", description: "Welcome back!" });
      // onAuthStateChanged listener will handle the rest.
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast({ variant: "destructive", title: "Sign In Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleStartTrial = () => {
    if (!authUser) { 
        setAppDisplayState('auth');
        toast({variant: "destructive", title: "Error", description: "User not found for trial."});
        return;
    }
    setIsTrialSession(true); 
    // The useEffect hook will now re-run with isTrialSession=true and handle the state change.
    toast({ title: "Free Trial Started", description: "Enjoy your free trial! Data will not be saved." });
  };


  const handleSignOut = async () => {
    if (IS_ADMIN_REVIEW_MODE && !isTrialSession) {
      setUser(null); 
      setAuthUser(null);
      setAppDisplayState('auth'); 
      toast({ title: "Admin Review Mode", description: "Exited review session." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signOut(auth);
      // onAuthStateChanged listener will handle resetting state.
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast({ variant: "destructive", title: "Sign Out Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditLoad = (loadToEdit: Load) => {
    if (!user || user.role !== 'admin') return;
     const loadWithLocalTimes = {
      ...loadToEdit,
      pickupDateTime: toDateTimeLocalInput(loadToEdit.pickupDateTime),
      deliveryDateTime: toDateTimeLocalInput(loadToEdit.deliveryDateTime),
    };
    setLoadForm(loadWithLocalTimes);
    setEditingLoadId(loadToEdit.id!);
    setActiveTab('loads');
  };

  const handleCancelEditLoad = () => {
    setLoadForm(initialLoadFormData);
    setEditingLoadId(null);
  };

  const handleSaveLoad = async (loadDataToSave?: Partial<Load>) => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);

    const dataToUse = loadDataToSave || loadForm;
    const calculatedTotalRate = (dataToUse.distance || 0) * (dataToUse.ratePerMile || 0) + (dataToUse.tarpingFee || 0);
    const calculatedDriveTime = (settings.truckAverageSpeed > 0 && dataToUse.distance && dataToUse.distance > 0)
        ? dataToUse.distance / settings.truckAverageSpeed
        : undefined;

    const finalPickupDateTime = new Date(dataToUse.pickupDateTime!).toISOString();
    const finalDeliveryDateTime = new Date(dataToUse.deliveryDateTime!).toISOString();

    const dataWithCalculations = {
        ...dataToUse,
        pickupDateTime: finalPickupDateTime,
        deliveryDateTime: finalDeliveryDateTime,
        totalAgreedRate: calculatedTotalRate,
        estimatedDriveTimeHours: calculatedDriveTime
    };

    if (dataWithCalculations.cargoDimensions) {
      const parsedTrailerDims = parseDimensionString(settings.trailerDimensions);
      const parsedCargoDims = parseDimensionString(dataWithCalculations.cargoDimensions);
      const trailerDeckHeightFeet = parseSingleDimensionToFeet(settings.trailerDeckHeight);

      let validationFailed = false;
      const messages: string[] = [];

      if (parsedCargoDims.height !== null && trailerDeckHeightFeet !== null) {
        const totalHeight = parsedCargoDims.height + trailerDeckHeightFeet;
        if (totalHeight > MAX_TOTAL_HEIGHT_FEET) {
          messages.push(`Total height (Deck ${trailerDeckHeightFeet.toFixed(2)}ft + Cargo ${parsedCargoDims.height.toFixed(2)}ft = ${totalHeight.toFixed(2)}ft) exceeds max legal height of ${MAX_TOTAL_HEIGHT_FEET}ft (13'6").`);
          validationFailed = true;
        }
      } else if (parsedCargoDims.height !== null && trailerDeckHeightFeet === null) {
        messages.push(`Trailer Deck Height is not defined in settings; could not validate total height.`);
      }


      if (parsedTrailerDims.length !== null && parsedCargoDims.length !== null && parsedCargoDims.length > parsedTrailerDims.length) {
        messages.push(`Length (${parsedCargoDims.length.toFixed(2)}ft) exceeds trailer length (${parsedTrailerDims.length.toFixed(2)}ft).`);
        validationFailed = true;
      } else if (parsedTrailerDims.length === null && parsedCargoDims.length !== null) {
        messages.push(`Trailer length not defined in settings for full validation.`);
      }

      if (parsedTrailerDims.width !== null && parsedCargoDims.width !== null && parsedCargoDims.width > parsedTrailerDims.width) {
        messages.push(`Width (${parsedCargoDims.width.toFixed(2)}ft) exceeds trailer width (${parsedTrailerDims.width.toFixed(2)}ft).`);
        validationFailed = true;
      } else if (parsedTrailerDims.width === null && parsedCargoDims.width !== null) {
         messages.push(`Trailer width not defined in settings for full validation.`);
      }

      if (validationFailed) {
        toast({
          variant: "destructive",
          title: "Cargo Dimension Error",
          description: "Cargo dimensions are invalid: " + messages.join(" "),
        });
        setIsSubmitting(false);
        return;
      }
    }


    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        let newLoadDataForTrial: Load;
        if (editingLoadId) {
            newLoadDataForTrial = { ...loads.find(l=>l.id===editingLoadId)!, ...dataWithCalculations, id: editingLoadId } as Load;
            setLoads(prevLoads => prevLoads.map(l =>
              l.id === editingLoadId
                ? newLoadDataForTrial
                : l
            ));
            toast({ title: "Trial/Review: Load Updated", description: `Load ${dataToUse.loadNumber || editingLoadId} updated locally.` });
        } else {
            const nextLoadNumeric = loads.length + 1;
            const newLoadNumber = formatLoadNumber(nextLoadNumeric);
            newLoadDataForTrial = {
                loadNumber: newLoadNumber,
                clientId: dataWithCalculations.clientId!,
                origin: dataWithCalculations.origin!,
                destination: dataWithCalculations.destination!,
                pickupDateTime: dataWithCalculations.pickupDateTime!,
                deliveryDateTime: dataWithCalculations.deliveryDateTime!,
                ratePerMile: dataWithCalculations.ratePerMile || 0,
                distance: dataWithCalculations.distance || 0,
                totalAgreedRate: dataWithCalculations.totalAgreedRate!,
                status: dataWithCalculations.status || 'pending',
                cargoDescription: dataWithCalculations.cargoDescription,
                cargoDimensions: dataWithCalculations.cargoDimensions,
                cargoWeight: dataWithCalculations.cargoWeight,
                specialTerms: dataWithCalculations.specialTerms,
                requiresTarping: dataWithCalculations.requiresTarping || false,
                tarpingFee: dataWithCalculations.tarpingFee || 0,
                originalClientRequestId: dataWithCalculations.originalClientRequestId,
                requestedByClientName: dataWithCalculations.requestedByClientName,
                requestedByAuthUid: dataWithCalculations.requestedByClientUid,
                estimatedDriveTimeHours: dataWithCalculations.estimatedDriveTimeHours,
                expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false },
                id: `mock-load-${Date.now()}`
            };
            setLoads(prev => [...prev, newLoadDataForTrial]);
            toast({ title: "Trial/Review: Load Added", description: `Load ${newLoadNumber} added locally.` });
        }
        if (!editingLoadId && newLoadDataForTrial.status === 'client-request-approved' && newLoadDataForTrial.originalClientRequestId) {
            const client = clients.find(c => c.id === newLoadDataForTrial.clientId);
            if (client && client.contactEmail) {
                 console.log(`TRIAL/REVIEW: Would send approval email for load ${newLoadDataForTrial.loadNumber} to ${client.contactEmail}`);
                 toast({ title: "Trial/Review: Client Notification", description: `Simulated approval notification for load ${newLoadDataForTrial.loadNumber}.` });
            }
        }

    } else { 
        let finalSavedLoadData: Load;
        if (editingLoadId) {
            try {
              const loadRef = doc(db, `users/${user.uid}/loads`, editingLoadId);
              await updateDoc(loadRef, dataWithCalculations);
              finalSavedLoadData = { ...loads.find(l=>l.id === editingLoadId)!, ...dataWithCalculations, id: editingLoadId } as Load;
              setLoads(prevLoads => prevLoads.map(l =>
                l.id === editingLoadId
                  ? finalSavedLoadData
                  : l
              ));
              toast({ title: "Load Updated", description: `Load ${dataToUse.loadNumber || editingLoadId} has been successfully updated.` });
            } catch (error: any) {
              console.error('Error updating load:', error);
              toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
              setIsSubmitting(false);
              return;
            }
        } else {
            let nextLoadNumeric = 1;
            const loadsCollectionRef = collection(db, `users/${user.uid}/loads`);
            const q = query(loadsCollectionRef, orderBy('loadNumber', 'desc'), limit(1));
            try {
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const lastLoad = querySnapshot.docs[0].data() as Load;
                    if (lastLoad.loadNumber) {
                        const lastNumericPart = parseInt(lastLoad.loadNumber.split('-')[1]);
                        nextLoadNumeric = isNaN(lastNumericPart) ? (await getDocs(loadsCollectionRef)).size + 1 : lastNumericPart + 1;
                    } else {
                        nextLoadNumeric = (await getDocs(loadsCollectionRef)).size + 1;
                    }
                } else {
                     nextLoadNumeric = (await getDocs(loadsCollectionRef)).size + 1;
                }
            } catch (e) {
                console.error("Error fetching last load number, falling back to collection size:", e);
                nextLoadNumeric = (await getDocs(loadsCollectionRef)).size + 1;
            }
            const newLoadNumber = formatLoadNumber(nextLoadNumeric);
            const newLoadDataForFirestore: Omit<Load, 'id'> = { 
                loadNumber: newLoadNumber,
                clientId: dataWithCalculations.clientId!,
                origin: dataWithCalculations.origin!,
                destination: dataWithCalculations.destination!,
                pickupDateTime: dataWithCalculations.pickupDateTime!,
                deliveryDateTime: dataWithCalculations.deliveryDateTime!,
                ratePerMile: dataWithCalculations.ratePerMile || 0,
                distance: dataWithCalculations.distance || 0,
                totalAgreedRate: dataWithCalculations.totalAgreedRate!,
                status: dataWithCalculations.status || 'pending',
                cargoDescription: dataWithCalculations.cargoDescription,
                cargoDimensions: dataWithCalculations.cargoDimensions,
                cargoWeight: dataWithCalculations.cargoWeight,
                specialTerms: dataWithCalculations.specialTerms,
                requiresTarping: dataWithCalculations.requiresTarping || false,
                tarpingFee: dataWithCalculations.tarpingFee || 0,
                originalClientRequestId: dataWithCalculations.originalClientRequestId,
                requestedByClientName: dataWithCalculations.requestedByClientName,
                requestedByAuthUid: dataWithCalculations.requestedByAuthUid,
                estimatedDriveTimeHours: dataWithCalculations.estimatedDriveTimeHours,
                expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false }
            };
            try {
              const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadDataForFirestore);
              finalSavedLoadData = { ...newLoadDataForFirestore, id: docRef.id } as Load;
              setLoads(prev => [...prev, finalSavedLoadData]);
              toast({ title: "Load Added", description: `New load ${newLoadNumber} has been successfully created.` });

              if (finalSavedLoadData.status === 'client-request-approved' && finalSavedLoadData.originalClientRequestId) {
                const client = clients.find(c => c.id === finalSavedLoadData.clientId);
                if (client && client.contactEmail) {
                    const loadIdentifier = `${finalSavedLoadData.loadNumber || finalSavedLoadData.id} (${finalSavedLoadData.origin} to ${finalSavedLoadData.destination})`;
                    const emailSubject = `Load Request Approved: ${finalSavedLoadData.loadNumber || finalSavedLoadData.id}`;
                    const emailBody = `Dear ${client.contactName || client.companyName},<br><br>Your load request for ${loadIdentifier} has been approved and is now being processed. Your Load ID is ${finalSavedLoadData.loadNumber || finalSavedLoadData.id}.<br><br>Thank you,<br>Dash Dispatch Pro`;
                    try {
                        const notificationInput: SendNotificationEmailInput = { recipientEmail: client.contactEmail, subject: emailSubject, body: emailBody };
                        const notificationResult = await sendNotificationEmail(notificationInput);
                        if (notificationResult.success) {
                            toast({ title: "Client Notification", description: `Simulated approval notification sent for new load ${finalSavedLoadData.loadNumber}.` });
                        } else {
                            toast({ variant: "destructive", title: "Notification Error", description: `Failed to simulate client notification: ${notificationResult.message}` });
                        }
                    } catch (notificationError: any) {
                        console.error("Error sending notification email for new load:", notificationError);
                        toast({ variant: "destructive", title: "Notification System Error", description: "An error occurred trying to send client notification for new load." });
                    }
                } else {
                     console.warn(`Could not send approval notification for new load ${finalSavedLoadData.id}: Client or client email not found.`);
                }
              }

            } catch (error: any) {
              console.error('Error adding load:', error);
              toast({ variant: "destructive", title: "Error Adding Load", description: error.message });
              setIsSubmitting(false);
              return;
            }
        }
    }
    handleCancelEditLoad();
    setIsSubmitting(false);
  };

  const updateLoad = useCallback(async (id: string, updates: Partial<Load>) => {
    if (!user || user.role !== 'admin') return;

    const calculateFinalUpdates = (currentLoad: Load): Partial<Load> => {
        let finalUpdates = { ...updates };
        if (updates.distance !== undefined || updates.ratePerMile !== undefined || updates.tarpingFee !== undefined) {
            const newDistance = updates.distance !== undefined ? updates.distance : currentLoad.distance;
            const newRatePerMile = updates.ratePerMile !== undefined ? updates.ratePerMile : currentLoad.ratePerMile;
            const newTarpingFee = updates.tarpingFee !== undefined ? updates.tarpingFee : (currentLoad.tarpingFee || 0);
            finalUpdates.totalAgreedRate = (newDistance * newRatePerMile) + newTarpingFee;
        }
        if (updates.distance !== undefined && settings.truckAverageSpeed > 0) {
            finalUpdates.estimatedDriveTimeHours = updates.distance / settings.truckAverageSpeed;
        } else if (updates.distance !== undefined) {
            finalUpdates.estimatedDriveTimeHours = undefined;
        }
        if (updates.expenses && currentLoad.expenses) {
            finalUpdates.expenses = { ...currentLoad.expenses, ...updates.expenses };
        }
        return finalUpdates;
    };

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        let originalLoad: Load | undefined;
        setLoads(prevLoads => {
            const newLoads = prevLoads.map(l => {
                if (l.id === id) {
                    originalLoad = l;
                    const finalUpdates = calculateFinalUpdates(l);
                    return { ...l, ...finalUpdates } as Load;
                }
                return l;
            });
            return newLoads;
        });

        if (originalLoad) {
            let description = "Trial/Review: Load details updated locally.";
            if (updates.status && updates.status !== originalLoad.status) {
                description = `Trial/Review: Load status changed to ${updates.status} locally.`;
                const client = clients.find(c => c.id === originalLoad!.clientId);
                if (client && client.contactEmail) {
                    const subject = `Load Update: ${originalLoad.loadNumber || id} - Status: ${updates.status}`;
                    const body = `Dear ${client.contactName || client.companyName},<br><br>The status of your load (${originalLoad.origin} to ${originalLoad.destination}, ID: ${originalLoad.loadNumber || id}) has been updated to: <strong>${updates.status.toUpperCase()}</strong>.<br><br>Thank you,<br>Dash Dispatch Pro`;
                    console.log(`TRIAL/REVIEW: Would send email to ${client.contactEmail} - Subject: ${subject}`);
                    toast({ title: "Trial/Review: Client Notification", description: `Simulated notification for status: ${updates.status}.` });
                }
            }
            else if (updates.expenses?.calculated) description = "Trial/Review: Load expenses calculated locally.";
            toast({ title: "Trial/Review: Load Updated", description });
        }
        return;
    }

    try {
      const loadRef = doc(db, `users/${user.uid}/loads`, id);
      const docSnap = await getDoc(loadRef);
      if (!docSnap.exists()) {
          toast({ variant: "destructive", title: "Error", description: "Load not found for update."});
          return;
      }
      const currentLoad = { id: docSnap.id, ...docSnap.data() } as Load;
      const finalUpdates = calculateFinalUpdates(currentLoad);

      await updateDoc(loadRef, finalUpdates);
      
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...currentLoad, ...finalUpdates } as Load : l));

      let toastMessage = "Load details saved.";
      if (updates.status && updates.status !== currentLoad.status) toastMessage = `Load status changed to ${updates.status}.`;
      else if (updates.expenses?.calculated) toastMessage = "Load expenses calculated and saved.";
      toast({ title: "Load Updated", description: toastMessage });

      if (updates.status && updates.status !== currentLoad.status) {
        const client = clients.find(c => c.id === currentLoad.clientId);
        if (client && client.contactEmail) {
          let emailSubject = '';
          let emailBody = '';
          const loadIdentifier = `${currentLoad.loadNumber || id} (${currentLoad.origin} to ${currentLoad.destination})`;

          switch (updates.status) {
            case 'client-request-approved':
              emailSubject = `Load Update: ${currentLoad.loadNumber || id} - Request Approved`;
              emailBody = `Dear ${client.contactName || client.companyName},<br><br>An update regarding your load request for ${loadIdentifier}: it has been (re)approved. Load ID: ${currentLoad.loadNumber || id}.<br><br>Thank you,<br>Dash Dispatch Pro`;
              break;
            case 'in-transit':
              emailSubject = `Load In Transit: ${currentLoad.loadNumber || id}`;
              emailBody = `Dear ${client.contactName || client.companyName},<br><br>Your load ${loadIdentifier} is now in transit.<br><br>Thank you,<br>Dash Dispatch Pro`;
              break;
            case 'delivered':
              emailSubject = `Load Delivered: ${currentLoad.loadNumber || id}`;
              emailBody = `Dear ${client.contactName || client.companyName},<br><br>Your load ${loadIdentifier} has been successfully delivered.<br><br>Thank you,<br>Dash Dispatch Pro`;
              break;
          }

          if (emailSubject && emailBody) {
            try {
              const notificationInput: SendNotificationEmailInput = {
                recipientEmail: client.contactEmail,
                subject: emailSubject,
                body: emailBody,
              };
              const notificationResult = await sendNotificationEmail(notificationInput);
              if (notificationResult.success) {
                toast({ title: "Client Notification", description: `Simulated notification sent for status: ${updates.status}.` });
              } else {
                toast({ variant: "destructive", title: "Notification Error", description: `Failed to simulate client notification: ${notificationResult.message}` });
              }
            } catch (notificationError: any) {
              console.error("Error sending notification email:", notificationError);
              toast({ variant: "destructive", title: "Notification System Error", description: "An error occurred while trying to send the client notification." });
            }
          }
        } else if (updates.status) { 
            console.warn(`Could not send notification for load ${id} status update: Client or client email not found.`);
        }
      }
    } catch (error: any) {
      console.error('Error updating load:', error);
      toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
    }
  }, [user, toast, settings, isTrialSession, clients]); 

  const handleDeleteLoad = async (loadId: string) => {
    if (!user || user.role !== 'admin') return;
    if (!window.confirm("Are you sure you want to delete this load? This action cannot be undone.")) return;
    setIsSubmitting(true);

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setLoads(prevLoads => prevLoads.filter(l => l.id !== loadId));
        toast({ title: "Trial/Review: Load Deleted", description: `Load ${loadId} removed locally.` });
    } else {
        try {
          await deleteDoc(doc(db, `users/${user.uid}/loads`, loadId));
          setLoads(prevLoads => prevLoads.filter(l => l.id !== loadId));
          toast({ title: "Load Deleted", description: "Load has been successfully deleted." });
        } catch (error: any) {
          console.error('Error deleting load:', error);
          toast({ variant: "destructive", title: "Error Deleting Load", description: error.message });
        }
    }
    setIsSubmitting(false);
  };

  const updateLoadStatus = async (id: string, status: Load['status']) => {
    await updateLoad(id, { status });
  };

  const approveClientLoadRequest = async (request: ClientLoadRequest) => {
    if (!user || user.role !== 'admin') return;
     const existingClient = clients.find(c =>
        (c.companyName || "").toLowerCase() === (request.requestedByClientName || "").toLowerCase() ||
        (c.contactName || "").toLowerCase() === (request.requestContactName || "").toLowerCase() ||
        (c.contactEmail || "").toLowerCase() === (request.requestContactEmail || "").toLowerCase()
    );
    const loadDataFromRequest: Partial<Load> = {
      clientId: existingClient?.id || '', 
      origin: request.origin,
      destination: request.destination,
      pickupDateTime: toDateTimeLocalInput(request.requestedPickupDateTime), 
      deliveryDateTime: toDateTimeLocalInput(request.requestedDeliveryDateTime), 
      ratePerMile: 0, 
      distance: 0, 
      status: 'client-request-approved', 
      cargoDescription: request.cargoDescription,
      requiresTarping: false, 
      tarpingFee: 0, 
      originalClientRequestId: request.id,
      requestedByClientName: request.requestedByClientName,
      requestedByAuthUid: request.requestedByClientUid,
      estimatedDriveTimeHours: undefined, 
    };
    setLoadForm(loadDataFromRequest);
    setEditingLoadId(null); 
    setActiveTab('loads'); 

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
        toast({ title: "Trial/Review: Client Request Processed", description: "Load form pre-filled locally. Request status 'viewed'." });
    } else {
        try {
            const requestRef = doc(db, 'clientLoadRequests', request.id!);
            await updateDoc(requestRef, { status: 'viewed' }); 
            setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'viewed'} : r));
            toast({ title: "Process Client Request", description: "Load form pre-filled. Please complete and save the load." });
        } catch (error: any) {
            console.error("Error processing client request:", error);
            toast({variant: "destructive", title: "Error", description: "Could not update client request status."});
        }
    }
  };

  const addExpense = async () => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        const newExpenseWithId: Expense = { ...expenseForm, id: `mock-expense-${Date.now()}` };
        setExpenses(prev => [...prev, newExpenseWithId]);
        toast({ title: "Trial/Review: Expense Added", description: "Expense added locally." });
    } else {
        try {
          const docRef = await addDoc(collection(db, `users/${user.uid}/expenses`), expenseForm);
          setExpenses(prev => [...prev, { ...expenseForm, id: docRef.id }]);
          toast({ title: "Expense Added", description: "Expense has been successfully recorded." });
        } catch (error: any) {
          console.error('Error adding expense:', error);
          toast({ variant: "destructive", title: "Error Adding Expense", description: error.message });
        }
    }
    setExpenseForm({ date: new Date().toISOString().split('T')[0], category: '', amount: 0, loadId: '' });
    setIsSubmitting(false);
  };

  const addClient = async () => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        const newClientWithId: Client = { ...clientForm, id: `mock-client-${Date.now()}` };
        setClients(prev => [...prev, newClientWithId]);
        toast({ title: "Trial/Review: Client Added", description: "Client added locally." });
    } else {
        try {
          const docRef = await addDoc(collection(db, `users/${user.uid}/clients`), clientForm);
          setClients(prev => [...prev, { ...clientForm, id: docRef.id }]);
          toast({ title: "Client Added", description: "New client has been successfully added." });
        } catch (error: any) {
          console.error('Error adding client:', error);
          toast({ variant: "destructive", title: "Error Adding Client", description: error.message });
        }
    }
    setClientForm({ companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: '' });
    setIsSubmitting(false);
  };

  const updateSettings = async () => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setSettings(settingsForm);
        toast({ title: "Trial/Review: Settings Updated", description: "Settings updated locally." });
    } else {
        try {
          const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
          await updateDoc(settingsRef, settingsForm);
          setSettings(settingsForm);
          toast({ title: "Settings Updated", description: "Your settings have been saved." });
        } catch (error: any) {
          console.error('Error updating settings:', error);
          toast({ variant: "destructive", title: "Error Updating Settings", description: error.message });
        }
    }
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (user?.role !== 'admin') return;

    const allCurrentLoads = [...loads]; 
    loads.forEach(load => {
      if (load.status === 'delivered' && load.id) {
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        const manualFuelExpense = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel');
        const fuelCost = manualFuelExpense ? manualFuelExpense.amount
            : (load.distance > 0 && settings.truckMpg > 0 && settings.defaultFuelCostPerGallon > 0)
            ? (load.distance / settings.truckMpg) * settings.defaultFuelCostPerGallon : 0;
        
        const manualDefExpense = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def');
        const defCost = manualDefExpense ? manualDefExpense.amount
            : (load.distance > 0 && settings.defCostPerGallon > 0) 
            ? (load.distance / 250) * settings.defCostPerGallon : 0; 
        
        const payroll = load.totalAgreedRate * (settings.payrollPercentage / 100);

        const dailyRecurringSum = settings.recurringExpenses.reduce((sum, expense) => sum + (expense.amount / 30), 0);
        
        let durationInDaysForCurrentLoad = 1; 
        try {
            const pickupDate = parseISO(load.pickupDateTime);
            const deliveryDate = parseISO(load.deliveryDateTime);
            if (!isNaN(pickupDate.getTime()) && !isNaN(deliveryDate.getTime()) && deliveryDate >= pickupDate) {
                durationInDaysForCurrentLoad = differenceInCalendarDays(deliveryDate, pickupDate) + 1; 
            }
        } catch (e) { console.warn("Error calculating duration for current load, defaulting to 1 day:", load.id, e); }
        durationInDaysForCurrentLoad = Math.max(1, durationInDaysForCurrentLoad); 

        let idleDaysBeforeThisLoad = 0;
        const previouslyDeliveredLoads = allCurrentLoads.filter(
          l => l.id !== load.id && l.status === 'delivered' && l.deliveryDateTime && parseISO(l.deliveryDateTime) < parseISO(load.pickupDateTime)
        ).sort((a,b) => parseISO(b.deliveryDateTime!).getTime() - parseISO(a.deliveryDateTime!).getTime());


        if (previouslyDeliveredLoads.length > 0) {
          const latestPreviousDeliveryDate = parseISO(previouslyDeliveredLoads[0].deliveryDateTime!);
          const currentLoadPickupDate = parseISO(load.pickupDateTime);
          if (!isNaN(latestPreviousDeliveryDate.getTime()) && !isNaN(currentLoadPickupDate.getTime()) && currentLoadPickupDate > latestPreviousDeliveryDate) {
            idleDaysBeforeThisLoad = differenceInCalendarDays(currentLoadPickupDate, latestPreviousDeliveryDate) -1; 
          }
          idleDaysBeforeThisLoad = Math.max(0, idleDaysBeforeThisLoad); 
        }
        
        const totalDaysToAccountForRecurring = durationInDaysForCurrentLoad + idleDaysBeforeThisLoad;
        const totalRecurringForLoad = dailyRecurringSum * totalDaysToAccountForRecurring;

        const newExpensesPayload = {
          payroll: parseFloat(payroll.toFixed(2)),
          fuel: parseFloat(fuelCost.toFixed(2)),
          def: parseFloat(defCost.toFixed(2)),
          recurring: parseFloat(totalRecurringForLoad.toFixed(2)),
          calculated: true
        };

        const existingExpenses = load.expenses;
        if (
          !existingExpenses.calculated ||
          existingExpenses.payroll !== newExpensesPayload.payroll ||
          existingExpenses.fuel !== newExpensesPayload.fuel ||
          existingExpenses.def !== newExpensesPayload.def ||
          existingExpenses.recurring !== newExpensesPayload.recurring
        ) {
          updateLoad(load.id, { expenses: newExpensesPayload });
        }
      }
    });
  }, [loads, settings, expenses, user, updateLoad, isTrialSession]); 

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
      const fontSize = 10, titleFontSize = 16, subTitleFontSize = 12, smallFontSize = 8, lineSpacing = 15, sectionSpacing = 25, margin = 50;
      let yPos = height - margin;

      const drawTextLine = (text: string, fontToUse: any, size: number, x: number, y: number, color = rgb(0,0,0)) => {
        if (y < margin + size) { 
          page = pdfDoc.addPage([600, 850]);
          y = height - margin; 
        }
        page.drawText(text, { x, y, font: fontToUse, size, color });
        return y - size - (size > 10 ? 5 : 3); 
      };
      const drawBoldTextLine = (text: string, x: number, y: number) => drawTextLine(text, boldFont, fontSize, x, y);
      const drawRegularTextLine = (text: string, x: number, y: number) => drawTextLine(text, font, fontSize, x, y);
      const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 0.5) => {
        if (y1 < margin) { 
           page = pdfDoc.addPage([600, 850]); y1 = height - margin; 
        }
        page.drawLine({start: {x: x1, y: y1}, end: {x: x2, y: y2}, thickness, color: rgb(0.7,0.7,0.7) });
      };

      yPos = drawTextLine('Hotshot Trucking Agreement', boldFont, titleFontSize, margin, yPos, rgb(0.1, 0.1, 0.1));
      if (loadData.loadNumber) {
        const tempYPos = yPos; 
        yPos = drawTextLine(`Load ID: ${loadData.loadNumber}`, boldFont, subTitleFontSize - 2, width - margin - 100, tempYPos + titleFontSize + 2); 
        yPos = tempYPos; 
      }
      yPos -= lineSpacing / 2;
      yPos = drawRegularTextLine(`Date of Agreement: ${new Date().toLocaleDateString()}`, margin, yPos);
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
      if (client.address) yPos = drawRegularTextLine(client.address, margin + 10, yPos);
      yPos = drawRegularTextLine(`Contact: ${client.contactName || 'N/A'}`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Phone: ${client.contactPhone || 'N/A'}`, margin + 10, yPos);
      yPos = drawRegularTextLine(`Email: ${client.contactEmail || 'N/A'}`, margin + 10, yPos);
      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      yPos = drawTextLine('LOAD DETAILS', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      yPos = drawBoldTextLine('Description:', margin, yPos);
      yPos = drawRegularTextLine(loadData.cargoDescription || 'N/A', margin + 10, yPos);
      if(loadData.cargoDimensions) { yPos = drawBoldTextLine('Dimensions:', margin, yPos); yPos = drawRegularTextLine(loadData.cargoDimensions, margin + 10, yPos); }
      if(loadData.cargoWeight) { yPos = drawBoldTextLine('Weight:', margin, yPos); yPos = drawRegularTextLine(loadData.cargoWeight, margin + 10, yPos); }
      yPos = drawBoldTextLine('Pickup Location:', margin, yPos);
      yPos = drawRegularTextLine(loadData.origin, margin + 10, yPos);
      if (loadData.pickupDateTime) yPos = drawRegularTextLine(`Scheduled Pickup: ${formatDate(parseISO(loadData.pickupDateTime), 'PPP p')}`, margin + 10, yPos);
      yPos = drawBoldTextLine('Delivery Location:', margin, yPos);
      yPos = drawRegularTextLine(loadData.destination, margin + 10, yPos);
      if (loadData.deliveryDateTime) yPos = drawRegularTextLine(`Scheduled Delivery: ${formatDate(parseISO(loadData.deliveryDateTime), 'PPP p')}`, margin + 10, yPos);
      if (loadData.estimatedDriveTimeHours && loadData.estimatedDriveTimeHours > 0) { yPos = drawBoldTextLine('Estimated Drive Time:', margin, yPos); yPos = drawRegularTextLine(`${loadData.estimatedDriveTimeHours.toFixed(1)} hours`, margin + 10, yPos); }
      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      yPos = drawTextLine('RATES & FEES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      yPos = drawBoldTextLine('Rate per Mile:', margin, yPos);
      yPos = drawRegularTextLine(`$${loadData.ratePerMile.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 10, yPos);
      yPos = drawBoldTextLine('Estimated Distance:', margin, yPos);
      yPos = drawRegularTextLine(`${loadData.distance} miles`, margin + 10, yPos);
      if (loadData.requiresTarping && loadData.tarpingFee && loadData.tarpingFee > 0) { yPos = drawBoldTextLine('Tarping Fee:', margin, yPos); yPos = drawRegularTextLine(`$${loadData.tarpingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tarping Required)`, margin + 10, yPos); }
      else if (loadData.requiresTarping) { yPos = drawBoldTextLine('Tarping:', margin, yPos); yPos = drawRegularTextLine('Required (Fee included or N/A)', margin + 10, yPos); }
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
      const specialTermsText = loadData.specialTerms || settings.defaultSpecialTerms || "Standard carrier terms apply...";
      const termsLines = []; const maxCharsPerLine = 85; 
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
              page = pdfDoc.addPage([600, 850]); yPos = height - margin;
              yPos = drawTextLine('SPECIAL TERMS & CONDITIONS (Continued)', boldFont, subTitleFontSize, margin, yPos);
              yPos -= lineSpacing * 0.75;
          }
          yPos = drawRegularTextLine(line, margin, yPos);
      }
      yPos -= sectionSpacing;
      
      if (yPos < margin + 150) { 
           page = pdfDoc.addPage([600, 850]); yPos = height - margin;
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
           page = pdfDoc.addPage([600, 850]); yPos = height - margin;
       }
      const footerText1 = "This agreement constitutes the entire understanding between the parties named herein.";
      const footerText2 = `Carrier's liability for cargo loss or damage is limited to $100,000 unless otherwise agreed...`; 
      yPos = drawTextLine(footerText1, font, smallFontSize, margin, yPos, rgb(0.3,0.3,0.3));
      yPos = drawTextLine(footerText2, font, smallFontSize, margin, yPos, rgb(0.3,0.3,0.3));


      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `agreement-${loadData.loadNumber || loadData.id || 'newLoad'}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
      toast({ title: "Agreement Generated", description: "PDF has been downloaded." });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({ variant: "destructive", title: "PDF Error", description: "Could not generate service agreement." });
    } finally { setIsSubmitting(false); }
  };

  if (appDisplayState === 'loading' || (IS_ADMIN_REVIEW_MODE && !user && !isTrialSession)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Dash Dispatch Pro...</p>
      </div>
    );
  }

  if (appDisplayState === 'auth') {
    return <AuthPage
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              handleSignIn={handleSignIn}
              handleSignUp={handleSignUp}
            />;
  }
  
  if (appDisplayState === 'subscription_choice' && user) {
      return <SubscriptionPage 
                userDisplayName={user.displayName || user.email || "New User"}
                onStartTrial={handleStartTrial} 
             />;
  }

  if (appDisplayState === 'client_portal' && user && user.role === 'client') {
    return <ClientPortalPage user={user} onSignOut={handleSignOut} isTrialSession={isTrialSession} />;
  }

  if (appDisplayState === 'admin_dashboard' && user && user.role === 'admin') {
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
                                        settings={settings}
                                        loadForm={loadForm}
                                        setLoadForm={setLoadForm}
                                        editingLoadId={editingLoadId}
                                        onSaveLoad={handleSaveLoad}
                                        onEditLoad={handleStartEditLoad}
                                        onDeleteLoad={handleDeleteLoad}
                                        onCancelEditLoad={handleCancelEditLoad}
                                        updateLoadStatus={updateLoadStatus}
                                        generateAgreement={generateAgreement}
                                        approveClientLoadRequest={approveClientLoadRequest}
                                        isSubmittingLoad={isSubmitting}
                                        isUpdatingStatus={isSubmitting} 
                                      />}
          {activeTab === 'expenses' && <ExpensesPage
                                          expenses={expenses}
                                          loads={loads}
                                          settings={settings}
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
                                        setLoadFormClientId={(clientId) => {
                                          setLoadForm(prev => ({ ...initialLoadFormData, clientId }));
                                          setEditingLoadId(null);
                                        }}
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
        <p className="mt-4 text-muted-foreground">Initializing...</p>
      </div>
    );
}
