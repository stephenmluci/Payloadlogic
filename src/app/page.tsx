
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
    if (isNaN(date.getTime())) {
      // If isoString is just a date (YYYY-MM-DD), append a default time
      if (isoString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return `${isoString}T09:00`; // Default to 9 AM
      }
      return new Date().toISOString().slice(0, 16); // Fallback if still invalid
    }
    return date.toISOString().slice(0, 16);
  } catch (e) {
    return new Date().toISOString().slice(0, 16); // Fallback on any error
  }
};

const initialLoadFormData: Partial<Load> = {
  clientId: '',
  origin: '',
  destination: '',
  pickupDateTime: toDateTimeLocal(),
  deliveryDateTime: toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()), // Default to 24 hours from now
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

  const fetchUserProfileAndData = useCallback(async (currentUser: FirebaseUser | User) => {
    if (!currentUser) {
      setUserRole(undefined);
      setAppLoading(false);
      return;
    }

    let currentRole: 'admin' | 'client' = 'admin'; // Default role

    // Handle Admin Review Mode specifically
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      currentRole = mockReviewUser.role!;
      setUser(mockReviewUser); // Set the mock user
    } else if (!IS_ADMIN_REVIEW_MODE) { // Normal Firebase user logic
      try {
        const profileRef = doc(db, `users/${currentUser.uid}/profile`);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const userProfile = profileSnap.data() as UserProfile;
          currentRole = userProfile.role;
        } else {
          // If profile doesn't exist, create it with a default role (e.g., admin)
          await setDoc(profileRef, { role: 'admin' });
          currentRole = 'admin'; // Or prompt for role selection
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        toast({ variant: "destructive", title: "Profile Error", description: "Could not fetch user profile." });
        // Potentially sign out user or set a default role to prevent app crash
      }
    }
    
    setUserRole(currentRole);

    // Set the user object - merge FirebaseUser with role
    // Skip this if it's the mock user already set above
    if (!(IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) && !IS_ADMIN_REVIEW_MODE) {
         setUser({ ...(currentUser as FirebaseUser), role: currentRole });
    }


    // If user is client and not in review mode, only client portal logic applies. Stop here.
    if (currentRole === 'client' && !IS_ADMIN_REVIEW_MODE) {
      setAppLoading(false);
      return;
    }
    
    // For Admin Review Mode: Initialize with mock/empty data
    if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
      // Simulate an empty database for the review user
      setLoads([]); 
      setExpenses([]);
      setClients([]);
      const reviewSettings = { ...initialSettings }; // Use a copy of initial settings for review
      setSettings(reviewSettings);
      setSettingsForm(reviewSettings);
      setClientLoadRequests([]); // Start with no client requests in review mode
      setAppLoading(false);
      return;
    }
    
    // For real admin users (not in review mode), fetch all data from Firestore
    if (!IS_ADMIN_REVIEW_MODE) { // This check is technically redundant due to client check above but good for clarity
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

          // Fetch settings
          const settingsRef = doc(db, `users/${currentUser.uid}/settings`, SETTINGS_DOC_ID);
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const settingsData = settingsSnap.data() as Settings;
            // Merge with initialSettings to ensure all fields are present, even if some were not saved
            const completeSettings = { ...initialSettings, ...settingsData };
            setSettings(completeSettings);
            setSettingsForm(completeSettings); // Also set the form with complete settings
          } else {
            // If no settings doc, create one with initialSettings
            await setDoc(settingsRef, initialSettings);
            setSettings(initialSettings);
            setSettingsForm(initialSettings);
          }

          // Fetch client load requests (these are global, not per-user in this structure)
          const clientRequestsSnapshot = await getDocs(collection(db, 'clientLoadRequests'));
          setClientLoadRequests(clientRequestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClientLoadRequest)));

        } catch (error: any) {
          console.error('Error fetching admin data:', error);
          toast({ variant: "destructive", title: "Fetch Error", description: error.message });
        } finally {
          setAppLoading(false);
        }
    }
  }, [toast]); // Added toast as a dependency


  useEffect(() => {
    if (IS_ADMIN_REVIEW_MODE) {
      // For Admin Review Mode, directly use the mock user
      fetchUserProfileAndData(mockReviewUser);
      return; // Skip Firebase auth listener
    }

    // For normal operation, listen to Firebase auth state changes
    const unsubscribe = auth.onAuthStateChanged(authUser => {
      if (authUser) {
        fetchUserProfileAndData(authUser);
      } else {
        // User is signed out
        setUser(null);
        setUserRole(undefined);
        // Clear all data
        setLoads([]);
        setExpenses([]);
        setClients([]);
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
        setClientLoadRequests([]);
        setAppLoading(false);
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [fetchUserProfileAndData]); // fetchUserProfileAndData is memoized with useCallback


  const handleSignUp = async (role: 'admin' | 'client' = 'admin') => {
    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign up is disabled in review mode." });
      return;
    }
    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Create user profile document with role
      const profileRef = doc(db, `users/${userCredential.user.uid}/profile`);
      await setDoc(profileRef, { role });

      // If admin, also initialize settings
      if (role === 'admin') {
        const settingsRef = doc(db, `users/${userCredential.user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, initialSettings);
        setSettings(initialSettings); // Set local state for settings
        setSettingsForm(initialSettings);
      }
      // setUser and fetchUserProfileAndData will be handled by onAuthStateChanged
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
      // Simulate a "refresh" of the review session
      fetchUserProfileAndData(mockReviewUser);
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // setUser and fetchUserProfileAndData will be handled by onAuthStateChanged
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
      setUser(null); // Effectively logs out the mock user
      setUserRole(undefined);
      // To simulate re-login for review, re-trigger fetch with mock user
      setAppLoading(true); // Show loading briefly
      setTimeout(() => {
         fetchUserProfileAndData(mockReviewUser); // Re-initialize review mode
      }, 50); // Small delay to allow state to clear
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return;
    }
    setIsSubmitting(true);
    try {
      await signOut(auth);
      // setUser and data clearing will be handled by onAuthStateChanged
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast({ variant: "destructive", title: "Sign Out Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler to populate form for editing a load
  const handleStartEditLoad = (loadToEdit: Load) => {
    if (!user || user.role !== 'admin') return;
    setLoadForm(loadToEdit);
    setEditingLoadId(loadToEdit.id!);
    setActiveTab('loads'); // Switch to loads tab if not already there
    // Optionally, scroll to the form or ensure the createLoad tab is active within LoadsPage
  };

  // Handler to cancel editing and reset form
  const handleCancelEditLoad = () => {
    setLoadForm(initialLoadFormData);
    setEditingLoadId(null);
  };

  // Combined handler for adding a new load or updating an existing one
  const handleSaveLoad = async (loadDataToSave?: Partial<Load>) => {
    if (!user || user.role !== 'admin') return;
    setIsSubmitting(true);
  
    const dataToUse = loadDataToSave || loadForm; // Use passed data if available, else form state
    const calculatedTotalRate = (dataToUse.distance || 0) * (dataToUse.ratePerMile || 0) + (dataToUse.tarpingFee || 0);
    const calculatedDriveTime = (settings.truckAverageSpeed > 0 && dataToUse.distance && dataToUse.distance > 0) 
        ? dataToUse.distance / settings.truckAverageSpeed 
        : undefined;

    const dataWithCalculations = {
        ...dataToUse,
        totalAgreedRate: calculatedTotalRate,
        estimatedDriveTimeHours: calculatedDriveTime
    };

    if (editingLoadId) { // This is an UPDATE
      if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
        // Review Mode: Update local state
        setLoads(prevLoads => prevLoads.map(l => 
          l.id === editingLoadId 
            ? { ...l, ...dataWithCalculations, id: editingLoadId } as Load 
            : l
        ));
        toast({ title: "Admin Review: Load Updated", description: `Load ${dataToUse.loadNumber || editingLoadId} updated locally (not saved).` });
      } else {
        // Real Mode: Update Firestore
        try {
          const loadRef = doc(db, `users/${user.uid}/loads`, editingLoadId);
          await updateDoc(loadRef, dataWithCalculations);
          setLoads(prevLoads => prevLoads.map(l => 
            l.id === editingLoadId 
              ? { ...l, ...dataWithCalculations, id: editingLoadId } as Load 
              : l
          ));
          toast({ title: "Load Updated", description: `Load ${dataToUse.loadNumber || editingLoadId} has been successfully updated.` });
        } catch (error: any) {
          console.error('Error updating load:', error);
          toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
        }
      }
    } else { // This is an ADD
      // Determine the next load number
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
      }
      const newLoadNumber = formatLoadNumber(nextLoadNumeric);
  
      // Prepare new load data
      const newLoadData: Omit<Load, 'id'> = {
        loadNumber: newLoadNumber,
        clientId: dataWithCalculations.clientId!,
        origin: dataWithCalculations.origin!,
        destination: dataWithCalculations.destination!,
        pickupDateTime: dataWithCalculations.pickupDateTime!,
        deliveryDateTime: dataWithCalculations.deliveryDateTime!,
        ratePerMile: dataWithCalculations.ratePerMile || 0,
        distance: dataWithCalculations.distance || 0,
        totalAgreedRate: dataWithCalculations.totalAgreedRate,
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
  
      if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
        // Review Mode: Add to local state
        const mockNewLoad = { ...newLoadData, id: `mock-load-${Date.now()}` } as Load;
        setLoads(prev => [...prev, mockNewLoad]);
        toast({ title: "Admin Review: Load Added", description: `Load ${newLoadNumber} added to local view (not saved).` });
      } else {
        // Real Mode: Add to Firestore
        try {
          const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), newLoadData);
          setLoads(prev => [...prev, { ...newLoadData, id: docRef.id } as Load]);
          toast({ title: "Load Added", description: `New load ${newLoadNumber} has been successfully created.` });
        } catch (error: any) {
          console.error('Error adding load:', error);
          toast({ variant: "destructive", title: "Error Adding Load", description: error.message });
        }
      }
    }
  
    handleCancelEditLoad(); // Reset form and editing state
    setIsSubmitting(false);
  };
  
  // Generic update function, used for status changes or other partial updates
  const updateLoad = useCallback(async (id: string, updates: Partial<Load>) => {
    if (!user || user.role !== 'admin') return;
    
    let finalUpdates = { ...updates };
    const currentLoad = loads.find(l => l.id === id);

    if (currentLoad) {
        // Recalculate totalAgreedRate if relevant fields change
        if (updates.distance !== undefined || updates.ratePerMile !== undefined || updates.tarpingFee !== undefined) {
            const newDistance = updates.distance !== undefined ? updates.distance : currentLoad.distance;
            const newRatePerMile = updates.ratePerMile !== undefined ? updates.ratePerMile : currentLoad.ratePerMile;
            const newTarpingFee = updates.tarpingFee !== undefined ? updates.tarpingFee : (currentLoad.tarpingFee || 0);
            finalUpdates.totalAgreedRate = (newDistance * newRatePerMile) + newTarpingFee;
        }

        // Recalculate estimatedDriveTimeHours if distance changes (and settings are available)
        if (updates.distance !== undefined && settings.truckAverageSpeed > 0) {
            finalUpdates.estimatedDriveTimeHours = updates.distance / settings.truckAverageSpeed;
        } else if (updates.distance !== undefined) { // If speed is 0 or not set, make drive time undefined
            finalUpdates.estimatedDriveTimeHours = undefined;
        }


        if (updates.expenses && currentLoad.expenses) {
            finalUpdates.expenses = { ...currentLoad.expenses, ...updates.expenses };
        }
    }


    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...finalUpdates } as Load : l));
      let description = "Load details updated locally (not saved).";
      if (updates.status) {
        description = `Load status changed to ${updates.status} (not saved).`;
      } else if (updates.expenses?.calculated) {
        description = "Load expenses calculated and updated locally (not saved)."
      }
      toast({ title: "Admin Review: Load Updated", description });
      return;
    }

    // Real Mode: Update Firestore
    try {
      await updateDoc(doc(db, `users/${user.uid}/loads`, id), finalUpdates);
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...finalUpdates } as Load : l));
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
  }, [user, toast, loads, settings.truckAverageSpeed, settings.truckMpg, settings.defaultFuelCostPerGallon, settings.defCostPerGallon, settings.payrollPercentage]); // Added all settings dependencies for expense calculation

  const handleDeleteLoad = async (loadId: string) => {
    if (!user || user.role !== 'admin') {
      console.warn("Attempted to delete load without admin privileges or user session.");
      return;
    }
  
    if (!window.confirm("Are you sure you want to delete this load? This action cannot be undone.")) {
      return;
    }
  
    setIsSubmitting(true);
    if (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid) {
      setLoads(prevLoads => prevLoads.filter(l => l.id !== loadId));
      toast({ title: "Admin Review: Load Deleted", description: `Load ${loadId} removed from local view (not saved).` });
      setIsSubmitting(false);
      return;
    }
  
    try {
      await deleteDoc(doc(db, `users/${user.uid}/loads`, loadId));
      setLoads(prevLoads => prevLoads.filter(l => l.id !== loadId));
      toast({ title: "Load Deleted", description: "Load has been successfully deleted." });
    } catch (error: any) {
      console.error('Error deleting load:', error);
      toast({ variant: "destructive", title: "Error Deleting Load", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };


  const updateLoadStatus = async (id: string, status: Load['status']) => {
    await updateLoad(id, { status });
  };

  const approveClientLoadRequest = async (request: ClientLoadRequest) => {
    if (!user || user.role !== 'admin') return;
    
    const existingClient = clients.find(c => 
        (c.companyName || "").toLowerCase() === (request.requestedByClientName || "").toLowerCase() ||
        (c.contactName || "").toLowerCase() === (request.requestedByClientName || "").toLowerCase()
    );

    const loadDataFromRequest: Partial<Load> = {
      clientId: existingClient?.id || '', 
      origin: request.origin,
      destination: request.destination,
      pickupDateTime: toDateTimeLocal(request.requestedPickupDate),
      deliveryDateTime: toDateTimeLocal(new Date(new Date(request.requestedPickupDate || Date.now()).getTime() + 24 * 60 * 60 * 1000).toISOString()), 
      ratePerMile: 0, 
      distance: 0, 
      status: 'client-request-approved',
      cargoDescription: request.cargoDescription,
      requiresTarping: false, 
      tarpingFee: 0,      
      originalClientRequestId: request.id,
      requestedByClientName: request.requestedByClientName,
      requestedByAuthUid: request.requestedByClientUid,
      estimatedDriveTimeHours: undefined, // Initialize as undefined
    };
    setLoadForm(loadDataFromRequest); 
    setEditingLoadId(null); 
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

  // Effect to calculate expenses for delivered loads
  useEffect(() => {
    if (user?.role !== 'admin') {
      return;
    }
  
    loads.forEach(load => {
      if (load.status === 'delivered' && !load.expenses.calculated && load.id) {
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        
        const manualFuelExpense = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel');
        const fuelCost = manualFuelExpense 
          ? manualFuelExpense.amount 
          : (load.distance > 0 && settings.truckMpg > 0 && settings.defaultFuelCostPerGallon > 0)
            ? (load.distance / settings.truckMpg) * settings.defaultFuelCostPerGallon
            : 0;

        const manualDefExpense = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def');
        const defCost = manualDefExpense
          ? manualDefExpense.amount
          // Assuming DEF consumption is approx 2.5% of fuel consumption,
          // or roughly 1 gallon of DEF for every 40 gallons of fuel.
          // If truckMpg is fuel MPG, then DEF_MPG = truckMpg / 0.025 = truckMpg * 40 (approx).
          // Or, more simply, DEF is often estimated at 1 gallon per 200-300 miles for Class 8 trucks.
          // Let's use an estimate of 250 miles per gallon of DEF.
          : (load.distance > 0 && settings.defCostPerGallon > 0) 
            ? (load.distance / 250) * settings.defCostPerGallon 
            : 0;

        const payroll = load.totalAgreedRate * (settings.payrollPercentage / 100);
        
        // This is a simplified daily factor. For more accuracy, one might calculate days per load.
        const dailyRecurringFactor = 30; // Assuming recurring expenses are monthly, distribute over 30 days
        const recurring = settings.recurringExpenses.reduce(
          (sum, expense) => sum + (expense.amount / dailyRecurringFactor), 0 // Distribute monthly expense to daily
        );

        updateLoad(load.id, {
          expenses: {
            payroll: parseFloat(payroll.toFixed(2)),
            fuel: parseFloat(fuelCost.toFixed(2)),
            def: parseFloat(defCost.toFixed(2)),
            recurring: parseFloat(recurring.toFixed(2)), //This might need to be multiplied by load duration in days
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
        if (y < margin + size) { 
            page = pdfDoc.addPage([600, 850]);
            y = height - margin;
        }
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
        if (y1 < margin) { 
            page = pdfDoc.addPage([600, 850]);
            y1 = height - margin; 
        }
        page.drawLine({start: {x: x1, y: y1}, end: {x: x2, y: y2}, thickness, color: rgb(0.7,0.7,0.7) });
      }

      // 1. Document Title
      yPos = drawTextLine('Hotshot Trucking Agreement', boldFont, titleFontSize, margin, yPos, rgb(0.1, 0.1, 0.1));
      if (loadData.loadNumber) {
        const tempYPos = yPos;
        yPos = drawTextLine(`Load ID: ${loadData.loadNumber}`, boldFont, subTitleFontSize - 2, width - margin - 100, tempYPos + titleFontSize + 2); 
        yPos = tempYPos; 
      }
      yPos -= lineSpacing / 2;

      // 2. Date of Agreement
      const agreementDate = new Date().toLocaleDateString();
      yPos = drawRegularTextLine(`Date of Agreement: ${agreementDate}`, margin, yPos);
      yPos -= sectionSpacing;

      // 3. Parties
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

      // 4. Load Details
      yPos = drawTextLine('LOAD DETAILS', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      yPos = drawBoldTextLine('Description:', margin, yPos);
      yPos = drawRegularTextLine(loadData.cargoDescription || 'N/A', margin + 10, yPos);
      if(loadData.cargoDimensions){
        yPos = drawBoldTextLine('Dimensions:', margin, yPos);
        yPos = drawRegularTextLine(loadData.cargoDimensions, margin + 10, yPos);
      }
      if(loadData.cargoWeight){
        yPos = drawBoldTextLine('Weight:', margin, yPos);
        yPos = drawRegularTextLine(loadData.cargoWeight, margin + 10, yPos);
      }
      
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

      if (loadData.estimatedDriveTimeHours && loadData.estimatedDriveTimeHours > 0) {
        yPos = drawBoldTextLine('Estimated Drive Time:', margin, yPos);
        yPos = drawRegularTextLine(`${loadData.estimatedDriveTimeHours.toFixed(1)} hours`, margin + 10, yPos);
      }

      yPos -= sectionSpacing;
      drawLine(margin, yPos + (sectionSpacing / 2), width - margin, yPos + (sectionSpacing / 2));

      // 5. Rates & Fees
      yPos = drawTextLine('RATES & FEES', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing * 0.75;
      
      yPos = drawBoldTextLine('Rate per Mile:', margin, yPos);
      yPos = drawRegularTextLine(`$${loadData.ratePerMile.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 10, yPos);
      yPos = drawBoldTextLine('Estimated Distance:', margin, yPos);
      yPos = drawRegularTextLine(`${loadData.distance} miles`, margin + 10, yPos);

      if (loadData.requiresTarping && loadData.tarpingFee && loadData.tarpingFee > 0) {
        yPos = drawBoldTextLine('Tarping Fee:', margin, yPos);
        yPos = drawRegularTextLine(`$${loadData.tarpingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tarping Required)`, margin + 10, yPos);
      } else if (loadData.requiresTarping) {
        yPos = drawBoldTextLine('Tarping:', margin, yPos);
        yPos = drawRegularTextLine('Required (Fee included or N/A)', margin + 10, yPos);
      }


      yPos = drawBoldTextLine('Total Agreed Rate for Service:', margin, yPos);
      yPos = drawRegularTextLine(`$${loadData.totalAgreedRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 10, yPos);

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

      // 7. Signatures
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

      // 8. Concluding Clause
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
        <p className="mt-4 text-muted-foreground">Finalizing session...</p>
      </div>
    );
}

