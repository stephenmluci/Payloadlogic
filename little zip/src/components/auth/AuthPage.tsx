
'use client';
import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Truck, KeyRound, Wand2, UserCheck2, AlertCircle, LogIn, ShieldCheck, Package, Eye, EyeOff } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { generatePassword as genPasswordAI } from '@/ai/flows/generate-password';
import { useToast } from '@/hooks/use-toast';
import { validateDotFormat, TRIAL_MESSAGES } from '@/lib/trial';
import { checkDot } from '@/lib/trialClient';
import { isOwnerEmail, ALLOWED_OWNER_EMAIL, PRIVATE_TESTING_RESTRICTION_MESSAGE } from '@/lib/authConfig';
import { SUPPORT_EMAIL } from '@/lib/support';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';

type AuthError = { code: string; message: string } | null;

// Maps Firebase auth error codes to friendly, actionable messages
function getFriendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/private-testing-restricted':
      return PRIVATE_TESTING_RESTRICTION_MESSAGE;
    case 'auth/fmcsa-required':
      return 'Either a valid USDOT Number or MC Number is required to create an account.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead or use another email.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please try again.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up first.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/user-disabled':
      return `This account has been disabled. Please contact support at ${SUPPORT_EMAIL}.`;
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

type AuthPageProps = {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  handleSignIn: (email?: string, password?: string) => Promise<AuthError>;
  handleSignUp: (
    role?: 'admin' | 'client',
    fmcsaCredentials?: { usdotNumber?: string; mcNumber?: string }
  ) => Promise<AuthError>;
};

export function AuthPage({ email, setEmail, password, setPassword, handleSignIn, handleSignUp }: AuthPageProps) {
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPassword, setIsGeneratingPassword] = useState(false);
  const [registerAsClient, setRegisterAsClient] = useState(false);
  const [usdotNumber, setUsdotNumber] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [fmcsaError, setFmcsaError] = useState<string | null>(null);
  const [noTrialNotice, setNoTrialNotice] = useState<string | null>(null);
  const [noTrialAcknowledged, setNoTrialAcknowledged] = useState(false);
  const [dotUnverifiedNotice, setDotUnverifiedNotice] = useState<string | null>(null);
  const [carrierVerifiedNotice, setCarrierVerifiedNotice] = useState<string | null>(null);
  const [isCheckingDot, setIsCheckingDot] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [authError, setAuthError] = useState<AuthError>(null);
  const { toast } = useToast();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const switchToSignIn = () => {
    setIsSigningUp(false);
    setAuthError(null);
    setFmcsaError(null);
    setTermsError(false);
    setCarrierVerifiedNotice(null);
    setNoTrialNotice(null);
    setDotUnverifiedNotice(null);
  };

  const switchToSignUp = () => {
    setIsSigningUp(true);
    setAuthError(null);
    setFmcsaError(null);
    setTermsError(false);
    setCarrierVerifiedNotice(null);
    setNoTrialNotice(null);
    setDotUnverifiedNotice(null);
  };

  const handleGeneratePassword = async () => {
    setIsGeneratingPassword(true);
    try {
      const result = await genPasswordAI({ length: 14, includeNumbers: true, includeSymbols: true });
      if (result.password) {
        setPassword(result.password);
        toast({ title: 'Password Generated', description: 'A secure password has been generated for you.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not generate password.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate password. Please try again.' });
    } finally {
      setIsGeneratingPassword(false);
    }
  };

  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handleResetPassword = async () => {
    const emailVal = (emailRef.current?.value || email || '').trim();
    if (!emailVal) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter your email address first to reset your password.'
      });
      return;
    }

    if (!isOwnerEmail(emailVal)) {
      setAuthError({
        code: 'auth/private-testing-restricted',
        message: PRIVATE_TESTING_RESTRICTION_MESSAGE,
      });
      toast({
        variant: 'destructive',
        title: 'Access Restricted',
        description: PRIVATE_TESTING_RESTRICTION_MESSAGE,
      });
      return;
    }

    setIsResettingPassword(true);
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, emailVal.trim());
      toast({
        title: 'Password Reset Email Sent',
        description: 'Password reset email sent! Check your inbox.'
      });
      alert('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Password reset error:', error);
      const code = error?.code || 'unknown';
      setAuthError({ code, message: error?.message || 'Failed to send password reset email.' });
      toast({
        variant: 'destructive',
        title: 'Reset Failed',
        description: getFriendlyAuthError(code)
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const onSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    setAuthError(null);
    setFmcsaError(null);

    const emailVal = (emailRef.current?.value ?? email ?? '').trim();
    const passwordVal = passwordRef.current?.value || password || '';
    if (emailVal && emailVal !== email) setEmail(emailVal);
    if (passwordVal && passwordVal !== password) setPassword(passwordVal);

    if (!emailVal) {
      setAuthError({ code: 'auth/invalid-email', message: 'Please enter your email address.' });
      emailRef.current?.focus();
      return;
    }

    if (!passwordVal) {
      setAuthError({ code: 'auth/wrong-password', message: 'Please enter your password.' });
      passwordRef.current?.focus();
      return;
    }

    // Private Testing Mode Lockdown: Only the owner is permitted to create a new account (drivers sign in with their provisioned credentials)
    if (isSigningUp && !isOwnerEmail(emailVal)) {
      setAuthError({
        code: 'auth/private-testing-restricted',
        message: PRIVATE_TESTING_RESTRICTION_MESSAGE,
      });
      toast({
        variant: 'destructive',
        title: 'Access Restricted',
        description: PRIVATE_TESTING_RESTRICTION_MESSAGE,
      });
      return;
    }

    // Consent & Agreement Verification (Required for both Sign In and Sign Up)
    if (!agreedToTerms) {
      setTermsError(true);
      toast({
        variant: 'destructive',
        title: 'Terms of Service Required',
        description: `You must review and agree to the Terms of Service before ${isSigningUp ? 'creating an account' : 'signing in to access the site'}. By using the site, you automatically agree to our terms.`,
      });
      return;
    }

    // Step 1: The FMCSA Gate (Signup Flow)
    // Carriers must provide a valid USDOT number (it anchors the 14-day free trial).
    // Client (shipper) registrations keep the original "USDOT or MC" requirement.
    // Owner / Admin accounts are exempt from the USDOT requirement.
    const isOwner = isOwnerEmail(emailVal);
    const trimmedDot = usdotNumber.trim();
    const trimmedMc = mcNumber.trim();
    if (isSigningUp && registerAsClient && !trimmedDot && !trimmedMc) {
      setFmcsaError('Either a valid USDOT Number or MC Number is required to register.');
      toast({
        variant: 'destructive',
        title: 'FMCSA Credential Required',
        description: 'Please provide either a valid USDOT Number or MC Number to successfully create an account.',
      });
      return;
    }
    if (isSigningUp && !registerAsClient && !isOwner) {
      const format = validateDotFormat(trimmedDot);
      if (!format.ok) {
        setFmcsaError(format.error);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Pre-check the DOT (format → FMCSA → already-used-a-trial) before creating the account.
      if (isSigningUp && !registerAsClient && !isOwner && !noTrialAcknowledged) {
        const check = await checkDot(trimmedDot);
        if (check.status === 'invalid') {
          setFmcsaError(check.error || TRIAL_MESSAGES.dotNotFound);
          return;
        }
        if (check.trialAvailable === false || check.status === 'blocked_trial_used') {
          // Not blocked: they can still create an account, but without a free trial. Ask them to confirm.
          setNoTrialNotice(`${TRIAL_MESSAGES.dotAlreadyUsed} ${TRIAL_MESSAGES.dotAlreadyUsedNextStep}`);
          setNoTrialAcknowledged(true);
          return;
        }
        if (check.status === 'valid_unverified' || check.status === 'unverified') {
          setDotUnverifiedNotice(TRIAL_MESSAGES.dotUnverified);
        }
        if (check.status === 'valid_verified' || check.status === 'verified') {
          const name = check.carrier?.legalName || check.carrierLegalName;
          if (name) {
            setCarrierVerifiedNotice(`Verified Carrier: ${name}${check.carrier?.state ? ` (${check.carrier.state})` : ''}`);
          }
        }
      }

      const error = isSigningUp
        ? await handleSignUp(registerAsClient ? 'client' : 'admin', {
            usdotNumber: trimmedDot,
            mcNumber: trimmedMc,
          })
        : await handleSignIn(emailVal, passwordVal);
      if (error) {
        if (error.code === 'trial/invalid-dot') setFmcsaError(error.message);
        else setAuthError(error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) onSubmit();
  };

  const isEmailAlreadyInUse = authError?.code === 'auth/email-already-in-use';
  const isUserNotFound = authError?.code === 'auth/user-not-found';
  const hasError = !!authError;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c141f] p-4 sm:p-6 text-slate-100 relative overflow-hidden">
      {/* Background ambient radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[350px] h-[200px] bg-[#ffbe24]/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <Link href="/" className="hover:opacity-95 transition-opacity">
          <PayloadLogicLogo variant="full" priority className="max-w-[320px] sm:max-w-[380px]" />
        </Link>
      </div>

      <Card className="w-full max-w-md shadow-2xl border-white/10 rounded-2xl bg-[#111d2e] text-white overflow-hidden backdrop-blur-md relative z-10">
        <form onSubmit={onSubmit}>
          <CardHeader className="text-center pb-4 pt-6">
            <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              {isSigningUp ? 'Create Your Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs sm:text-sm mt-1">
              {isSigningUp 
                ? 'Join owner-operators managing loads, rates, and fleet logistics' 
                : 'Sign in to access your dispatch dashboard and fleet intelligence'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 relative z-10">
            {/* ── Private Testing Notice Banner ─────────────────────────────── */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs text-amber-200">
              <ShieldCheck className="h-5 w-5 text-[#ffbe24] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>Private Testing Mode</span>
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">Owner Access Only</span>
                </div>
                <p className="text-amber-200/90 leading-relaxed">
                  {PRIVATE_TESTING_RESTRICTION_MESSAGE}
                </p>
              </div>
            </div>

            {/* ── Registration Locked Notice for Sign Up ──────────────────── */}
            {isSigningUp && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-300">Public Sign-Up Closed</p>
                  <p className="text-red-200/90 mt-0.5">
                    {PRIVATE_TESTING_RESTRICTION_MESSAGE}
                  </p>
                </div>
              </div>
            )}

            {/* ── Inline error banner ─────────────────────────────────────── */}
            {hasError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start gap-2 text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium leading-snug">
                    {authError!.message || getFriendlyAuthError(authError!.code)}
                  </p>
                </div>

                {/* Switch-to-sign-in CTA for email-already-in-use */}
                {isEmailAlreadyInUse && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={switchToSignIn}
                    className="self-start border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800 mt-1"
                  >
                    <LogIn className="h-3.5 w-3.5 mr-1.5" />
                    Switch to Sign In
                  </Button>
                )}

                {/* Switch-to-sign-up CTA for user-not-found */}
                {isUserNotFound && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={switchToSignUp}
                    className="self-start border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800 mt-1"
                  >
                    <UserCheck2 className="h-3.5 w-3.5 mr-1.5" />
                    Create an Account
                  </Button>
                )}
              </div>
            )}

            {/* ── Email field ─────────────────────────────────────────────── */}
            <div className="space-y-2 relative z-10">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-200">
                Email
              </Label>
              <div className="relative">
                <Input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  value={email ?? ''}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setAuthError(null);
                  }}
                  placeholder="your@email.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`h-11 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-medium text-base sm:text-sm border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 transition-all ${
                    hasError && (isEmailAlreadyInUse || authError?.code === 'auth/invalid-email')
                      ? 'border-red-500 ring-2 ring-red-500/20 focus:ring-red-500 focus-visible:ring-red-500'
                      : ''
                  }`}
                />
                {email && !isOwnerEmail(email) && (
                  <p className="text-[11px] text-amber-300 font-medium flex items-center gap-1 mt-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0 text-amber-400" />
                    Private testing: only {ALLOWED_OWNER_EMAIL} is authorized.
                  </p>
                )}
              </div>
            </div>

            {/* ── Password field ──────────────────────────────────────────── */}
            <div className="space-y-2 relative z-10">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-200">
                Password
              </Label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password ?? ''}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setAuthError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete={isSigningUp ? 'new-password' : 'current-password'}
                  className={`h-11 bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-medium text-base sm:text-sm border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 transition-all ${
                    isSigningUp ? 'pr-32' : 'pr-11'
                  } ${
                    hasError && (authError?.code === 'auth/wrong-password' || authError?.code === 'auth/invalid-credential' || authError?.code === 'auth/weak-password')
                      ? 'border-red-500 ring-2 ring-red-500/20 focus:ring-red-500 focus-visible:ring-red-500'
                      : ''
                  }`}
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 transition-colors rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {isSigningUp && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGeneratePassword}
                      disabled={isGeneratingPassword}
                      className="h-7 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-2"
                      aria-label="Generate secure password"
                    >
                      <Wand2 className="h-3.5 w-3.5 mr-1 text-blue-600" />
                      {isGeneratingPassword ? 'Generating…' : 'Generate'}
                    </Button>
                  )}
                </div>
              </div>
              {!isSigningUp && (
                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    disabled={isResettingPassword}
                    onClick={handleResetPassword}
                    className="h-auto p-0 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    {isResettingPassword ? 'Sending reset email…' : 'Forgot Password?'}
                  </Button>
                </div>
              )}
            </div>

            {/* ── FMCSA Carrier Gate (Step 1) ──────────────────────────────── */}
            {isSigningUp && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-3">
                <div className="flex items-center gap-2 text-blue-900">
                  <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800">
                        FMCSA Carrier Verification Gate {!isOwnerEmail(email) && <span className="text-red-500">*</span>}
                      </h4>
                      {isOwnerEmail(email) && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                          Owner Bypass: DOT Optional
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-blue-900/80 leading-snug">
                      {isOwnerEmail(email) 
                        ? 'Your account is recognized as Owner/Admin. USDOT number is optional and trial gating is bypassed.'
                        : 'Required credential to create an account and unlock rate intelligence.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="usdotNumber" className="text-xs font-semibold text-slate-700">
                      USDOT Number
                    </Label>
                    <Input
                      id="usdotNumber"
                      name="usdotNumber"
                      type="text"
                      value={usdotNumber}
                      onChange={(e) => {
                        setUsdotNumber(e.target.value);
                        setFmcsaError(null);
                        setAuthError(null);
                        setNoTrialNotice(null);
                        setNoTrialAcknowledged(false);
                        setDotUnverifiedNotice(null);
                        setCarrierVerifiedNotice(null);
                      }}
                      onBlur={async () => {
                        if (!registerAsClient && usdotNumber.trim()) {
                          const f = validateDotFormat(usdotNumber);
                          if (!f.ok) {
                            setFmcsaError(f.error);
                            setCarrierVerifiedNotice(null);
                            return;
                          }
                          setIsCheckingDot(true);
                          try {
                            const res = await checkDot(f.dot);
                            if (res.status === 'invalid') {
                              setFmcsaError(res.error || TRIAL_MESSAGES.dotNotFound);
                              setCarrierVerifiedNotice(null);
                            } else if (res.status === 'blocked_trial_used' || res.trialAvailable === false) {
                              setNoTrialNotice(`${TRIAL_MESSAGES.dotAlreadyUsed} ${TRIAL_MESSAGES.dotAlreadyUsedNextStep}`);
                              setCarrierVerifiedNotice(null);
                            } else if (res.status === 'valid_verified' || res.status === 'verified') {
                              setFmcsaError(null);
                              setDotUnverifiedNotice(null);
                              const name = res.carrier?.legalName || res.carrierLegalName;
                              if (name) {
                                setCarrierVerifiedNotice(`Verified Carrier: ${name}${res.carrier?.state ? ` (${res.carrier.state})` : ''}`);
                              } else {
                                setCarrierVerifiedNotice(`USDOT ${f.dot} Verified with FMCSA/SAFER`);
                              }
                            } else if (res.status === 'valid_unverified' || res.status === 'unverified') {
                              setFmcsaError(null);
                              setCarrierVerifiedNotice(null);
                              setDotUnverifiedNotice(TRIAL_MESSAGES.dotUnverified);
                            }
                          } finally {
                            setIsCheckingDot(false);
                          }
                        }
                      }}
                      inputMode="numeric"
                      placeholder="e.g. 1234567"
                      className={`h-10 text-xs sm:text-sm bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${fmcsaError ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="mcNumber" className="text-xs font-semibold text-slate-700">
                      MC Number {!registerAsClient && <span className="text-slate-400 font-normal">(optional)</span>}
                    </Label>
                    <Input
                      id="mcNumber"
                      name="mcNumber"
                      type="text"
                      value={mcNumber}
                      onChange={(e) => {
                        setMcNumber(e.target.value);
                        setFmcsaError(null);
                        setAuthError(null);
                      }}
                      placeholder="e.g. MC-654321"
                      className={`h-10 text-xs sm:text-sm bg-white text-slate-900 placeholder:text-slate-400 caret-slate-900 font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${fmcsaError ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                    />
                  </div>
                </div>

                {isCheckingDot && (
                  <p className="text-[11px] text-blue-700 font-medium animate-pulse">
                    Verifying carrier with FMCSA / SAFER database...
                  </p>
                )}

                {carrierVerifiedNotice && !fmcsaError && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800 text-xs font-semibold">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="truncate">{carrierVerifiedNotice}</span>
                  </div>
                )}

                {fmcsaError && (
                  <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium pt-0.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{fmcsaError}</span>
                  </div>
                )}
                {noTrialNotice && (
                  <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>{noTrialNotice} Press the button again to continue.</span>
                  </div>
                )}
                {dotUnverifiedNotice && !fmcsaError && !carrierVerifiedNotice && (
                  <p className="text-[11px] text-slate-600">{dotUnverifiedNotice}</p>
                )}
                <p className="text-[10px] text-slate-500">
                  {registerAsClient
                    ? '* Either a valid USDOT Number or MC Number must be provided to successfully register.'
                    : '* Your USDOT number starts your 14-day free trial — no credit card needed. One trial per DOT number.'}
                </p>
              </div>
            )}

            {/* ── Client Registration Option (Signup Only) ─────────────── */}
            {isSigningUp && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="registerAsClient"
                    checked={registerAsClient}
                    onCheckedChange={(checked) => setRegisterAsClient(checked as boolean)}
                  />
                  <Label htmlFor="registerAsClient" className="text-sm font-normal">
                    Register as a Client (for submitting load requests)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6 leading-relaxed">
                  <strong>Driver?</strong> Driver accounts are created by your company dispatcher — contact them for your login credentials.
                </p>
              </div>
            )}

            {/* ── Mandatory Terms Agreement Checkbox (Both Sign In & Sign Up) ─ */}
            <div className={`p-3 rounded-xl border transition-colors ${termsError ? 'border-red-300 bg-red-50/70' : 'border-slate-200 bg-slate-50/60'}`}>
              <div className="flex items-start space-x-2.5">
                <Checkbox
                  id="agreeTerms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => {
                    setAgreedToTerms(checked as boolean);
                    if (checked) setTermsError(false);
                  }}
                  className={termsError ? 'border-red-500' : ''}
                />
                <div className="grid gap-1 leading-none">
                  <Label
                    htmlFor="agreeTerms"
                    className="text-xs font-medium leading-relaxed text-slate-700 cursor-pointer"
                  >
                    I have read and agree to the{' '}
                    <Link href="/terms-of-service" target="_blank" className="text-blue-600 underline font-semibold hover:text-blue-800">
                      Terms of Service
                    </Link>
                    {' '}and{' '}
                    <Link href="/privacy-policy" target="_blank" className="text-blue-600 underline font-semibold hover:text-blue-800">
                      Privacy Policy
                    </Link>
                    . <span className="text-red-500 font-bold">*</span>
                  </Label>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    By signing in, creating an account, or using this site, you acknowledge and automatically agree to the Terms of Service.
                  </p>
                  {termsError && (
                    <p className="text-[11px] text-red-600 font-semibold mt-0.5">
                      You must agree to the Terms of Service before {isSigningUp ? 'creating an account' : 'signing in to access the site'}.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button disabled={isSubmitting} className="w-full bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] font-bold py-2.5 rounded-xl shadow-lg shadow-[#ffbe24]/20 transition-all" type="submit">
              {isSigningUp
                ? <><UserCheck2 className="mr-2 h-5 w-5" />{isSubmitting ? 'Creating account…' : (noTrialAcknowledged ? 'Create Account Without Trial' : (registerAsClient ? 'Sign Up' : 'Start 14-Day Free Trial'))}</>
                : <><KeyRound className="mr-2 h-5 w-5" />{isSubmitting ? 'Signing in…' : 'Sign In'}</>
              }
            </Button>

            <Button variant="link" type="button" onClick={isSigningUp ? switchToSignIn : switchToSignUp} className="text-sm text-slate-300 hover:text-white">
              {isSigningUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Button>

            <div className="text-center text-xs text-muted-foreground pt-1 space-y-1">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                By using this site, signing in, or creating an account, you automatically agree to our{' '}
                <Link href="/terms-of-service" className="underline hover:text-primary font-medium">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy-policy" className="underline hover:text-primary font-medium">Privacy Policy</Link>.
              </p>
              <p className="text-slate-500 text-[11px]">
                Need help or have questions? Contact us at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline font-semibold">
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
