'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import {
  User,
  Phone,
  Mail,
  ShieldCheck,
  Calendar,
  HeartHandshake,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  FileText,
  Lock,
  Upload,
  Camera,
  Trash2,
  Award,
  CreditCard,
  Eye,
} from 'lucide-react';

const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const ENDORSEMENT_OPTIONS: { id: string; label: string; badge: string; desc: string }[] = [
  { id: 'Tanker (N)', label: 'Tanker', badge: 'N', desc: 'Liquid / bulk gas tanks' },
  { id: 'Hazmat (H)', label: 'Hazmat', badge: 'H', desc: 'Hazardous materials' },
  { id: 'Doubles/Triples (T)', label: 'Doubles / Triples', badge: 'T', desc: 'Double or triple trailers' },
  { id: 'Tanker + Hazmat (X)', label: 'Tanker + Hazmat', badge: 'X', desc: 'Combined N + H endorsement' },
  { id: 'Passenger (P)', label: 'Passenger', badge: 'P', desc: 'Passenger transport' },
  { id: 'TWIC Card', label: 'TWIC Card', badge: 'TWIC', desc: 'Port / secure facility access' },
  { id: 'Air Brakes', label: 'Air Brakes', badge: 'AIR', desc: 'No air brake restriction' },
  { id: 'Oversize / Overweight', label: 'Oversize / Permitted Loads', badge: 'OS/OW', desc: 'Wide / heavy haul experience' },
];

interface VerificationData {
  token: string;
  companyName: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  cdlStatus: 'Class A CDL' | 'Non-CDL';
  cdlNumber: string;
  licenseIssuingState?: string;
  cdlExpirationDate: string;
  medicalCardExpirationDate: string;
  endorsements?: string[];
  additionalEndorsements?: string;
  licenseFrontUrl?: string;
  licenseFrontName?: string;
  licenseBackUrl?: string;
  licenseBackName?: string;
  medicalCardUrl?: string;
  medicalCardName?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  homeAddress: string;
  homeCity: string;
  homeState: string;
  homeZip: string;
  driverNotes: string;
  expiresAt: string;
}

type DocFieldKey = 'licenseFront' | 'licenseBack' | 'medicalCard';

/**
 * Compresses an uploaded image file to a clean JPEG Data URL (max 1100px, quality 0.76)
 * so all 3 driver compliance photos fit comfortably inside the Firestore DriverProfile document.
 */
async function processUploadedDocument(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ dataUrl: string; name: string }> {
  onProgress(15);

  if (file.type === 'application/pdf') {
    if (file.size > 450 * 1024) {
      throw new Error('PDF file must be under 450 KB (or take a photo of the document instead).');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(Math.min(90, Math.round((ev.loaded / ev.total) * 85) + 10));
        }
      };
      reader.onload = () => {
        onProgress(100);
        resolve({ dataUrl: String(reader.result || ''), name: file.name });
      };
      reader.onerror = () => reject(new Error('Could not read PDF file.'));
      reader.readAsDataURL(file);
    });
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image photo (JPG, PNG, HEIC, WEBP) or PDF copy.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.min(60, Math.round((ev.loaded / ev.total) * 50) + 10));
      }
    };
    reader.onload = () => {
      onProgress(70);
      const img = new window.Image();
      img.onload = () => {
        try {
          const maxDim = 1100;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            onProgress(100);
            resolve({ dataUrl: String(reader.result || ''), name: file.name });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          onProgress(90);
          const compressed = canvas.toDataURL('image/jpeg', 0.76);
          onProgress(100);
          resolve({ dataUrl: compressed, name: file.name });
        } catch {
          onProgress(100);
          resolve({ dataUrl: String(reader.result || ''), name: file.name });
        }
      };
      img.onerror = () => reject(new Error('Could not process image file.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function DriverOnboardingPage() {
  const params = useParams();
  const token = params?.token as string;

  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<'not_found' | 'expired' | 'used' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [companyName, setCompanyName] = useState('PayloadLogic');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cdlStatus: 'Non-CDL' as 'Class A CDL' | 'Non-CDL',
    cdlNumber: '',
    licenseIssuingState: '',
    cdlExpirationDate: '',
    medicalCardExpirationDate: '',
    endorsements: [] as string[],
    additionalEndorsements: '',
    licenseFrontUrl: '',
    licenseFrontName: '',
    licenseBackUrl: '',
    licenseBackName: '',
    medicalCardUrl: '',
    medicalCardName: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    homeAddress: '',
    homeCity: '',
    homeState: '',
    homeZip: '',
    driverNotes: '',
  });

  // Upload progress and errors per document slot
  const [uploadProgress, setUploadProgress] = useState<Record<DocFieldKey, number>>({
    licenseFront: 0,
    licenseBack: 0,
    medicalCard: 0,
  });
  const [uploadErrors, setUploadErrors] = useState<Record<DocFieldKey, string>>({
    licenseFront: '',
    licenseBack: '',
    medicalCard: '',
  });
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdDriverAccount, setCreatedDriverAccount] = useState<{
    driverUid: string;
    loginEmail: string;
    tempPassword: string;
    driverPortalUrl: string;
    loginUrl: string;
    emailSent?: boolean;
    smsShareUrl?: string | null;
  } | null>(null);
  const [copiedCredentialField, setCopiedCredentialField] = useState<string>('');

  // 1. Verify token on mount
  useEffect(() => {
    if (!token) {
      setErrorStatus('not_found');
      setErrorMessage('No onboarding token provided.');
      setIsLoading(false);
      return;
    }

    async function verifyToken() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/driver-onboarding/verify?token=${encodeURIComponent(token)}`);
        const result = await res.json();

        if (result.companyName) {
          setCompanyName(result.companyName);
        }

        if (!result.valid) {
          setErrorStatus(result.error || 'error');
          setErrorMessage(result.message || 'This link has expired or is invalid.');
          return;
        }

        const d: VerificationData = result.data;
        if (d.companyName) setCompanyName(d.companyName);

        setFormData((prev) => ({
          ...prev,
          name: d.driverName || prev.name,
          email: d.driverEmail || prev.email,
          phone: d.driverPhone || prev.phone,
          cdlStatus: d.cdlStatus || 'Non-CDL',
          cdlNumber: d.cdlNumber || '',
          licenseIssuingState: d.licenseIssuingState || '',
          cdlExpirationDate: d.cdlExpirationDate || '',
          medicalCardExpirationDate: d.medicalCardExpirationDate || '',
          endorsements: Array.isArray(d.endorsements) ? d.endorsements : [],
          additionalEndorsements: d.additionalEndorsements || '',
          licenseFrontUrl: d.licenseFrontUrl || '',
          licenseFrontName: d.licenseFrontName || '',
          licenseBackUrl: d.licenseBackUrl || '',
          licenseBackName: d.licenseBackName || '',
          medicalCardUrl: d.medicalCardUrl || '',
          medicalCardName: d.medicalCardName || '',
          emergencyContactName: d.emergencyContactName || '',
          emergencyContactPhone: d.emergencyContactPhone || '',
          emergencyContactRelationship: d.emergencyContactRelationship || '',
          homeAddress: d.homeAddress || '',
          homeCity: d.homeCity || '',
          homeState: d.homeState || '',
          homeZip: d.homeZip || '',
          driverNotes: d.driverNotes || '',
        }));
      } catch (err: any) {
        console.error('Error verifying token:', err);
        setErrorStatus('error');
        setErrorMessage('Unable to verify onboarding link. Please check your internet connection.');
      } finally {
        setIsLoading(false);
      }
    }

    verifyToken();
  }, [token]);

  const toggleEndorsement = (id: string) => {
    setFormData((prev) => {
      const exists = prev.endorsements.includes(id);
      return {
        ...prev,
        endorsements: exists ? prev.endorsements.filter((e) => e !== id) : [...prev.endorsements, id],
      };
    });
  };

  const handleFileChange = async (slot: DocFieldKey, file: File | null) => {
    if (!file) return;
    setUploadErrors((prev) => ({ ...prev, [slot]: '' }));
    setUploadProgress((prev) => ({ ...prev, [slot]: 10 }));

    try {
      const { dataUrl, name } = await processUploadedDocument(file, (pct) => {
        setUploadProgress((prev) => ({ ...prev, [slot]: pct }));
      });

      if (slot === 'licenseFront') {
        setFormData((prev) => ({ ...prev, licenseFrontUrl: dataUrl, licenseFrontName: name }));
      } else if (slot === 'licenseBack') {
        setFormData((prev) => ({ ...prev, licenseBackUrl: dataUrl, licenseBackName: name }));
      } else if (slot === 'medicalCard') {
        setFormData((prev) => ({ ...prev, medicalCardUrl: dataUrl, medicalCardName: name }));
      }
    } catch (err: any) {
      setUploadErrors((prev) => ({
        ...prev,
        [slot]: err?.message || 'Could not process selected file.',
      }));
      setUploadProgress((prev) => ({ ...prev, [slot]: 0 }));
    }
  };

  const handleRemoveFile = (slot: DocFieldKey) => {
    setUploadProgress((prev) => ({ ...prev, [slot]: 0 }));
    setUploadErrors((prev) => ({ ...prev, [slot]: '' }));
    if (slot === 'licenseFront') {
      setFormData((prev) => ({ ...prev, licenseFrontUrl: '', licenseFrontName: '' }));
    } else if (slot === 'licenseBack') {
      setFormData((prev) => ({ ...prev, licenseBackUrl: '', licenseBackName: '' }));
    } else if (slot === 'medicalCard') {
      setFormData((prev) => ({ ...prev, medicalCardUrl: '', medicalCardName: '' }));
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!formData.name.trim()) {
      setSubmitError('Full name is required.');
      return;
    }

    if (!formData.phone.trim()) {
      setSubmitError('Phone number is required so dispatch can reach you.');
      return;
    }

    if (!formData.licenseIssuingState.trim()) {
      setSubmitError('License Issuing State is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/driver-onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          driverData: formData,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit driver profile.');
      }

      if (result.driverAccount) {
        setCreatedDriverAccount(result.driverAccount);
      }

      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Submit error:', err);
      setSubmitError(err.message || 'Something went wrong while saving your profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const documentSlots: {
    key: DocFieldKey;
    label: string;
    subtitle: string;
    url: string;
    fileName: string;
  }[] = [
    {
      key: 'licenseFront',
      label: 'Driver’s License — Front Photo',
      subtitle: 'Clear photo of the front of your license showing name, number & expiration',
      url: formData.licenseFrontUrl,
      fileName: formData.licenseFrontName,
    },
    {
      key: 'licenseBack',
      label: 'Driver’s License — Back Photo',
      subtitle: 'Clear photo of the back of your license showing class, restrictions & endorsements',
      url: formData.licenseBackUrl,
      fileName: formData.licenseBackName,
    },
    {
      key: 'medicalCard',
      label: 'Medical Card Photo / Copy',
      subtitle: 'Photo or PDF copy of your DOT Medical Examiner’s Certificate (MEC)',
      url: formData.medicalCardUrl,
      fileName: formData.medicalCardName,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-4 sm:p-6 md:p-10 font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Top Header Branding */}
      <div className="w-full max-w-2xl mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <PayloadLogicLogo className="h-8 w-auto text-amber-400" />
          <span className="text-xl font-bold tracking-tight text-white font-headline">PayloadLogic</span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
          <Lock className="w-3.5 h-3.5 text-emerald-400" /> Secure Driver Self-Onboarding
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-2xl">
        {/* State 1: Loading */}
        {isLoading && (
          <Card className="bg-slate-900/90 border-slate-800 text-slate-200 shadow-2xl p-8 sm:p-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-amber-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-1">Verifying Onboarding Link...</h2>
            <p className="text-sm text-slate-400">Loading your profile invitation details.</p>
          </Card>
        )}

        {/* State 2: Error / Expired / Already Used */}
        {!isLoading && errorStatus && (
          <Card className="bg-slate-900/95 border-slate-800 text-slate-100 shadow-2xl overflow-hidden">
            <div className={`p-6 sm:p-8 text-center ${errorStatus === 'used' ? 'bg-blue-950/40 border-b border-blue-900/50' : 'bg-red-950/40 border-b border-red-900/50'}`}>
              <div className="inline-flex p-3 rounded-full mb-3 bg-slate-900 border border-slate-800 shadow-inner">
                {errorStatus === 'used' ? (
                  <CheckCircle2 className="h-8 w-8 text-blue-400" />
                ) : errorStatus === 'expired' ? (
                  <Clock className="h-8 w-8 text-amber-400" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                )}
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {errorStatus === 'used'
                  ? 'Profile Already Completed'
                  : errorStatus === 'expired'
                  ? 'This Link Has Expired'
                  : 'Invalid Onboarding Link'}
              </h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <CardContent className="p-6 text-center text-xs text-slate-400 space-y-3">
              <p>
                Company: <strong className="text-white">{companyName}</strong>
              </p>
              <p>
                If you believe this is an error or need to update your submitted information, please contact your dispatcher or fleet manager directly.
              </p>
            </CardContent>
          </Card>
        )}

        {/* State 3: Success Confirmation */}
        {!isLoading && !errorStatus && isSuccess && (
          <Card className="bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-2xl overflow-hidden">
            <div className="p-8 sm:p-10 text-center bg-emerald-950/30 border-b border-emerald-500/30">
              <div className="inline-flex p-4 rounded-full mb-4 bg-emerald-900/50 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-950/50">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Profile Completed Successfully!</h2>
              <p className="text-sm text-emerald-200/90 max-w-md mx-auto leading-relaxed">
                Thank you, <strong className="text-white">{formData.name}</strong>! Your driver profile and compliance documents have been securely saved and transmitted to <strong className="text-white">{companyName}</strong>.
              </p>
            </div>
            <CardContent className="p-6 sm:p-8 space-y-4">
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Driver Name:</span>
                  <span className="font-semibold text-white">{formData.name}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-semibold text-white">{formData.phone}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Licensing Class:</span>
                  <span className="font-semibold text-amber-300">{formData.cdlStatus}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">License Number &amp; State:</span>
                  <span className="font-semibold text-white">
                    {formData.cdlNumber || '—'} ({formData.licenseIssuingState})
                  </span>
                </div>
                {(formData.endorsements.length > 0 || formData.additionalEndorsements) && (
                  <div className="flex justify-between items-start gap-4 text-slate-300">
                    <span className="text-slate-400 shrink-0">Endorsements:</span>
                    <span className="font-semibold text-emerald-300 text-right">
                      {[...formData.endorsements, formData.additionalEndorsements].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Uploaded Documents:</span>
                  <span className="font-semibold text-white">
                    {[
                      formData.licenseFrontUrl && 'License Front',
                      formData.licenseBackUrl && 'License Back',
                      formData.medicalCardUrl && 'Medical Card',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'None attached'}
                  </span>
                </div>
                {formData.emergencyContactName && (
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">Emergency Contact:</span>
                    <span className="font-semibold text-white">{formData.emergencyContactName} ({formData.emergencyContactPhone || '—'})</span>
                  </div>
                )}
              </div>

              {createdDriverAccount && (
                <div className="rounded-xl bg-amber-950/30 border border-amber-500/40 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                        <Lock className="w-3.5 h-3.5" /> Limited Driver View Account Created
                      </span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        Your Driver View Login &amp; Direct Access Link
                      </h3>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Use your restricted Driver View to view your profile, accept or decline assigned loads, and update load phases and notes.
                        {formData.email
                          ? ` We also sent these credentials to ${formData.email}.`
                          : ''}
                      </p>
                    </div>
                  </div>

                  {/* Direct 1-Tap Magic Link Button */}
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <a
                      href={createdDriverAccount.driverPortalUrl}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm px-4 py-3 shadow-lg transition-colors text-center"
                    >
                      Open My Driver View Now →
                    </a>
                    {createdDriverAccount.smsShareUrl && (
                      <a
                        href={createdDriverAccount.smsShareUrl}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-semibold text-xs px-4 py-3 transition-colors text-center"
                      >
                        Text Credentials to My Phone
                      </a>
                    )}
                  </div>

                  {/* Credentials Box */}
                  <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-3.5 space-y-2.5 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-2">
                      <span className="text-slate-400">Direct Magic Link:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-amber-300 font-mono text-[11px] break-all">
                          {createdDriverAccount.driverPortalUrl}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(createdDriverAccount.driverPortalUrl);
                            setCopiedCredentialField('link');
                            setTimeout(() => setCopiedCredentialField(''), 2000);
                          }}
                          className="shrink-0 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold"
                        >
                          {copiedCredentialField === 'link' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Login Email:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-white font-mono font-semibold">
                          {createdDriverAccount.loginEmail}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(createdDriverAccount.loginEmail);
                            setCopiedCredentialField('email');
                            setTimeout(() => setCopiedCredentialField(''), 2000);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold"
                        >
                          {copiedCredentialField === 'email' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Temporary Password:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-emerald-300 font-mono font-bold">
                          {createdDriverAccount.tempPassword}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(createdDriverAccount.tempPassword);
                            setCopiedCredentialField('password');
                            setTimeout(() => setCopiedCredentialField(''), 2000);
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold"
                        >
                          {copiedCredentialField === 'password' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-center text-xs text-slate-400">
                Bookmark your Driver View link above or sign in anytime at{' '}
                <a href="/login" className="text-amber-400 underline hover:text-amber-300">
                  /login
                </a>
                .
              </p>
            </CardContent>
          </Card>
        )}

        {/* State 4: Active Form */}
        {!isLoading && !errorStatus && !isSuccess && (
          <form onSubmit={handleSubmit}>
            <Card className="bg-slate-900 border-slate-800 text-slate-100 shadow-2xl overflow-hidden">
              {/* Card Banner */}
              <CardHeader className="bg-slate-900/90 border-b border-slate-800 p-6 sm:p-8">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Invitation from {companyName}
                  </span>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-white">
                    Driver Profile Self-Onboarding
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-xs sm:text-sm">
                    Please review and complete your information below. No login or password required. This single-use link is valid for 7 days.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-6 sm:p-8 space-y-8">
                {submitError && (
                  <div className="p-4 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Section 1: Personal & Contact */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-sm font-bold text-white">
                    <User className="h-4 w-4 text-amber-400" />
                    <span>1. Personal &amp; Contact Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="driver-name" className="text-xs text-slate-300 font-semibold">
                        Full Legal Name <span className="text-amber-400">*</span>
                      </Label>
                      <Input
                        id="driver-name"
                        type="text"
                        required
                        placeholder="e.g. Johnathan Doe"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="driver-phone" className="text-xs text-slate-300 font-semibold">
                        Phone Number (Mobile) <span className="text-amber-400">*</span>
                      </Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="driver-phone"
                          type="tel"
                          required
                          placeholder="(555) 000-0000"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="pl-9 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="driver-email" className="text-xs text-slate-300 font-semibold">
                        Email Address
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                          id="driver-email"
                          type="email"
                          placeholder="driver@example.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="pl-9 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Commercial Licensing & DOT Compliance */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-sm font-bold text-white">
                    <ShieldCheck className="h-4 w-4 text-amber-400" />
                    <span>2. Commercial Licensing &amp; DOT Compliance</span>
                  </div>

                  {/* CDL Class Selector */}
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-300 font-semibold">
                      Driver License Classification
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cdlStatus: 'Non-CDL' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          formData.cdlStatus === 'Non-CDL'
                            ? 'bg-amber-400/10 border-amber-400 text-white shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-sm text-white">Non-CDL</div>
                        <div className="text-[11px] text-slate-400">Hotshot &le; 26,000 lbs GCWR</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cdlStatus: 'Class A CDL' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          formData.cdlStatus === 'Class A CDL'
                            ? 'bg-blue-500/15 border-blue-400 text-white shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-sm text-white">Class A CDL</div>
                        <div className="text-[11px] text-slate-400">Combination &gt; 26,000 lbs</div>
                      </button>
                    </div>
                  </div>

                  {/* License Number + License Issuing State + Expirations */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="license-number" className="text-xs text-slate-300 font-semibold">
                        License Number
                      </Label>
                      <Input
                        id="license-number"
                        type="text"
                        placeholder="e.g. D12345678 (CDL or Non-CDL)"
                        value={formData.cdlNumber}
                        onChange={(e) => setFormData({ ...formData, cdlNumber: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="license-issuing-state" className="text-xs text-slate-300 font-semibold">
                        License Issuing State <span className="text-amber-400">*</span>
                      </Label>
                      <select
                        id="license-issuing-state"
                        required
                        value={formData.licenseIssuingState}
                        onChange={(e) => setFormData({ ...formData, licenseIssuingState: e.target.value })}
                        className="w-full h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="" disabled>
                          Select U.S. State...
                        </option>
                        {US_STATES.map((st) => (
                          <option key={st.code} value={st.code}>
                            {st.code} — {st.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="cdl-exp" className="text-xs text-slate-300 font-semibold">
                        License Expiration Date
                      </Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        <Input
                          id="cdl-exp"
                          type="date"
                          value={formData.cdlExpirationDate}
                          onChange={(e) => setFormData({ ...formData, cdlExpirationDate: e.target.value })}
                          className="pl-9 bg-slate-950 border-slate-700 text-white focus-visible:ring-amber-400 h-11 [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="med-exp" className="text-xs text-slate-300 font-semibold">
                        Medical Card Expiration
                      </Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                        <Input
                          id="med-exp"
                          type="date"
                          value={formData.medicalCardExpirationDate}
                          onChange={(e) => setFormData({ ...formData, medicalCardExpirationDate: e.target.value })}
                          className="pl-9 bg-slate-950 border-slate-700 text-white focus-visible:ring-amber-400 h-11 [color-scheme:dark]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Driver License & Medical Card Photo Uploads */}
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <Label className="text-xs text-white font-bold flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-amber-400" />
                          License &amp; Medical Card Photos / Copies
                        </Label>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Upload clear photos or copies of your driver&apos;s license (front &amp; back) and DOT medical card.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      {documentSlots.map((slot) => {
                        const progress = uploadProgress[slot.key];
                        const err = uploadErrors[slot.key];
                        const hasFile = Boolean(slot.url);
                        const isPdf = slot.url.startsWith('data:application/pdf');
                        const inputId = `upload-${slot.key}`;

                        return (
                          <div
                            key={slot.key}
                            className={`rounded-xl border p-3.5 flex flex-col justify-between transition-all ${
                              hasFile
                                ? 'bg-emerald-950/20 border-emerald-500/40'
                                : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-bold text-white leading-snug">
                                  {slot.label}
                                </span>
                                {hasFile && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 leading-snug">
                                {slot.subtitle}
                              </p>

                              {/* Progress Bar while processing */}
                              {progress > 0 && progress < 100 && (
                                <div className="space-y-1 pt-1">
                                  <div className="flex justify-between text-[10px] text-amber-300 font-semibold">
                                    <span>Processing upload...</span>
                                    <span>{progress}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-amber-400 transition-all duration-200"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Preview once selected */}
                              {hasFile && (
                                <div className="pt-1 space-y-2">
                                  {isPdf ? (
                                    <div className="h-28 rounded-lg bg-slate-900 border border-slate-700 flex flex-col items-center justify-center p-2 text-center">
                                      <FileText className="h-7 w-7 text-amber-400 mb-1" />
                                      <span className="text-[11px] font-semibold text-white truncate max-w-full px-2">
                                        {slot.fileName || 'PDF Document'}
                                      </span>
                                      <span className="text-[10px] text-emerald-400">PDF Ready</span>
                                    </div>
                                  ) : (
                                    <div className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-900 h-28">
                                      <img
                                        src={slot.url}
                                        alt={slot.label}
                                        className="w-full h-full object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage({ url: slot.url, title: slot.label })}
                                        className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-xs font-bold text-white"
                                      >
                                        <Eye className="h-3.5 w-3.5" /> View Full Photo
                                      </button>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between text-[10px] text-emerald-300">
                                    <span className="truncate max-w-[140px]">
                                      {slot.fileName || 'Attached'}
                                    </span>
                                    <span className="font-bold">100% Ready</span>
                                  </div>
                                </div>
                              )}

                              {err && (
                                <p className="text-[11px] text-red-400 font-medium pt-1">{err}</p>
                              )}
                            </div>

                            <div className="pt-3 mt-2 border-t border-slate-800/80 flex items-center gap-2">
                              <input
                                id={inputId}
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null;
                                  handleFileChange(slot.key, f);
                                  e.target.value = '';
                                }}
                              />
                              <label
                                htmlFor={inputId}
                                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                  hasFile
                                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                    : 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40'
                                }`}
                              >
                                {hasFile ? (
                                  <>
                                    <Upload className="h-3.5 w-3.5" />
                                    Replace
                                  </>
                                ) : (
                                  <>
                                    <Camera className="h-3.5 w-3.5" />
                                    Upload Photo
                                  </>
                                )}
                              </label>
                              {hasFile && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFile(slot.key)}
                                  className="p-2 rounded-lg bg-red-950/60 hover:bg-red-900/70 text-red-300 border border-red-800/50 transition-colors"
                                  title="Remove file"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Section 3: Emergency Contact */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-sm font-bold text-white">
                    <HeartHandshake className="h-4 w-4 text-rose-400" />
                    <span>3. Emergency Contact</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="em-name" className="text-xs text-slate-300 font-semibold">
                        Contact Name
                      </Label>
                      <Input
                        id="em-name"
                        type="text"
                        placeholder="e.g. Jane Doe"
                        value={formData.emergencyContactName}
                        onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="em-phone" className="text-xs text-slate-300 font-semibold">
                        Contact Phone
                      </Label>
                      <Input
                        id="em-phone"
                        type="tel"
                        placeholder="(555) 999-8888"
                        value={formData.emergencyContactPhone}
                        onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="em-rel" className="text-xs text-slate-300 font-semibold">
                        Relationship
                      </Label>
                      <Input
                        id="em-rel"
                        type="text"
                        placeholder="e.g. Spouse / Sibling"
                        value={formData.emergencyContactRelationship}
                        onChange={(e) => setFormData({ ...formData, emergencyContactRelationship: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Residential Address */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-sm font-bold text-white">
                    <MapPin className="h-4 w-4 text-sky-400" />
                    <span>4. Residential Address</span>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="home-street" className="text-xs text-slate-300 font-semibold">
                        Street Address
                      </Label>
                      <Input
                        id="home-street"
                        type="text"
                        placeholder="123 Trucker Way"
                        value={formData.homeAddress}
                        onChange={(e) => setFormData({ ...formData, homeAddress: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1 space-y-1.5">
                        <Label htmlFor="home-city" className="text-xs text-slate-300 font-semibold">City</Label>
                        <Input
                          id="home-city"
                          type="text"
                          placeholder="Dallas"
                          value={formData.homeCity}
                          onChange={(e) => setFormData({ ...formData, homeCity: e.target.value })}
                          className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                        />
                      </div>
                      <div className="col-span-1 space-y-1.5">
                        <Label htmlFor="home-state" className="text-xs text-slate-300 font-semibold">State</Label>
                        <Input
                          id="home-state"
                          type="text"
                          placeholder="TX"
                          maxLength={2}
                          value={formData.homeState}
                          onChange={(e) => setFormData({ ...formData, homeState: e.target.value.toUpperCase() })}
                          className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11 uppercase"
                        />
                      </div>
                      <div className="col-span-1 space-y-1.5">
                        <Label htmlFor="home-zip" className="text-xs text-slate-300 font-semibold">ZIP</Label>
                        <Input
                          id="home-zip"
                          type="text"
                          placeholder="75201"
                          maxLength={10}
                          value={formData.homeZip}
                          onChange={(e) => setFormData({ ...formData, homeZip: e.target.value })}
                          className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-11"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Endorsements, Notes & Equipment Experience */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-sm font-bold text-white">
                    <FileText className="h-4 w-4 text-emerald-400" />
                    <span>5. Endorsements, Notes &amp; Equipment Experience</span>
                  </div>

                  {/* Additional Endorsements Selector */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <Label className="text-xs text-slate-200 font-bold flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-amber-400" />
                        Additional Endorsements &amp; Qualifications (Select all that apply)
                      </Label>
                      {formData.endorsements.length > 0 && (
                        <span className="text-[11px] font-semibold text-amber-400">
                          {formData.endorsements.length} selected
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ENDORSEMENT_OPTIONS.map((opt) => {
                        const selected = formData.endorsements.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleEndorsement(opt.id)}
                            className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2.5 transition-all ${
                              selected
                                ? 'bg-amber-400/15 border-amber-400 text-white shadow-xs'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                  selected
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {opt.badge}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{opt.label}</div>
                                <div className="text-[10px] text-slate-400 truncate">{opt.desc}</div>
                              </div>
                            </div>
                            <div
                              className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                selected
                                  ? 'border-amber-400 bg-amber-400 text-slate-950'
                                  : 'border-slate-700 bg-slate-900'
                              }`}
                            >
                              {selected && <CheckCircle2 className="h-3 w-3" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-1 space-y-1.5">
                      <Label htmlFor="other-endorsements" className="text-xs text-slate-300 font-semibold">
                        Other Endorsements or Certifications (Optional)
                      </Label>
                      <Input
                        id="other-endorsements"
                        type="text"
                        placeholder="e.g. Forklift certified, HAZWOPER, Car Hauler, Winch/Ramps..."
                        value={formData.additionalEndorsements}
                        onChange={(e) => setFormData({ ...formData, additionalEndorsements: e.target.value })}
                        className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 h-10 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Notes or Equipment Experience */}
                  <div className="space-y-1.5">
                    <Label htmlFor="driver-notes" className="text-xs text-slate-300 font-semibold">
                      Notes or Equipment Experience (Optional)
                    </Label>
                    <Textarea
                      id="driver-notes"
                      rows={3}
                      placeholder="Add any notes regarding trailer types (gooseneck, dovetail, deckover), load securement experience, or preferred driving lanes..."
                      value={formData.driverNotes}
                      onChange={(e) => setFormData({ ...formData, driverNotes: e.target.value })}
                      className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-400 text-xs sm:text-sm"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="bg-slate-900/90 border-t border-slate-800 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Secure 256-bit encrypted submission</span>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-8 py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-sm sm:text-base rounded-xl transition-all shadow-lg shadow-amber-400/20 disabled:opacity-50 min-h-[48px]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting Profile...
                    </span>
                  ) : (
                    'Submit Driver Profile'
                  )}
                </Button>
              </CardFooter>
            </Card>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-slate-400">
          Powered by <strong className="text-slate-400">PayloadLogic</strong> Hotshot TMS
        </div>
      </div>

      {/* Lightbox Modal for Full Photo Preview */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">{lightboxImage.title}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLightboxImage(null)}
                className="h-7 text-xs text-slate-300 hover:text-white"
              >
                Close
              </Button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
