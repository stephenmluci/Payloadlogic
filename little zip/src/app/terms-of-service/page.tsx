"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ArrowLeft, ShieldCheck, CheckCircle2, LogOut, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PayloadLogicLogo } from "@/components/brand/PayloadLogicLogo";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SUPPORT_EMAIL } from "@/lib/support";
import { auth } from "@/lib/firebase";
import { signOut, onAuthStateChanged, User } from "firebase/auth";

export default function TermsOfServicePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [eldAcknowledged, setEldAcknowledged] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  /**
   * Explicitly sign out of Firebase Auth and redirect to the login screen.
   * Ensures users who decline or cancel are never left stranded on the ToS page.
   */
  const handleDeclineOrCancel = async () => {
    setIsProcessing(true);
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (error) {
      console.error("Error signing out after declining terms:", error);
    } finally {
      setIsProcessing(false);
      router.push("/login");
    }
  };

  /**
   * Accept terms and proceed to complete setup / dashboard access.
   */
  const handleAccept = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Navigation & Cancel Header */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={30} />
          </Link>
          <Button
            variant="ghost"
            onClick={handleDeclineOrCancel}
            disabled={isProcessing}
            className="text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Cancel &amp; Back to Login
          </Button>
        </div>

        {/* Setup Banner / Opening Notice */}
        <div className="mb-6 p-4 rounded-xl bg-blue-50/90 border border-blue-200/80 shadow-xs flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blue-950">
              To complete your Dash Dispatch account setup and access the dashboard, please review and accept our Terms of Service.
            </p>
            <p className="text-xs text-blue-800/90 mt-1 leading-relaxed">
              Acceptance of the Terms of Service is mandatory prior to signing in or signing up—access to the site is not permitted without agreement. By using this site, you automatically agree to our Terms of Service. If you decline, you will be signed out and returned to the login screen.
            </p>
          </div>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle className="text-2xl font-bold font-headline">Terms of Service</CardTitle>
            <p className="text-sm text-slate-700 font-medium mt-1">
              To complete your Dash Dispatch account setup and access the dashboard, please review and accept the Terms of Service below.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Last updated: October 2026</p>
          </CardHeader>

          <CardContent className="prose prose-sm max-w-none space-y-6">
            <section>
              <h3 className="font-semibold text-lg">1. Acceptance of Terms</h3>
              <p>
                To complete your Dash Dispatch account setup and access the dashboard, please review and accept our Terms of Service. You must review and agree to these Terms prior to signing in, signing up, or accessing any part of the site; otherwise you are not permitted to access or use the site. By accessing, browsing, signing in, creating an account, or continuing to use this site, you acknowledge and automatically agree to be bound by these Terms of Service. If you do not agree to these terms, you must discontinue use immediately.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">2. Description of the Service</h3>
              <p>
                The Service is a software tool that helps small trucking businesses manage clients, loads, expenses, and related operations. The Service is provided as a technology platform only.
              </p>
              <p>
                <strong>We are not a freight broker, motor carrier, freight forwarder, or insurance provider.</strong> We do not arrange transportation, take custody of freight, or provide insurance coverage.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">3. No Responsibility for Misuse or Outcomes</h3>
              <p>
                You are solely responsible for how you use the Service and for all data you enter (including rates, load details, client information, and expenses).
              </p>
              <p>
                The Service and its owners, employees, and affiliates are <strong>not responsible or liable</strong> for:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Any decisions you make based on information in the Service</li>
                <li>Contracts, rate confirmations, or agreements generated through the Service</li>
                <li>Missed pickups or deliveries, cargo claims, accidents, or regulatory violations</li>
                <li>Financial losses, lost profits, or business interruptions</li>
                <li>Incorrect, incomplete, or outdated information entered by you or other users</li>
                <li>Any misuse of the Service by you or third parties</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg">4. Limitation of Liability</h3>
              <p>
                To the maximum extent permitted by law, the Service shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues.
              </p>
              <p>
                Our total liability for any claim arising out of or relating to the Service is limited to the greater of (a) the amount you paid us in the 12 months prior to the claim, or (b) $100 USD.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">5. “As-Is” Disclaimer</h3>
              <p>
                The Service is provided on an “as-is” and “as-available” basis without warranties of any kind, whether express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">6. Indemnification</h3>
              <p>
                You agree to indemnify, defend, and hold harmless the platform and its owners from any claims, damages, losses, or expenses (including reasonable attorneys’ fees) arising out of your use of the Service, your violation of these Terms, or your violation of any rights of another party.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">7. User Accounts &amp; Acceptable Use</h3>
              <p>
                You are responsible for maintaining the confidentiality of your account credentials. You agree not to use the Service for any unlawful purpose or in a way that could harm the Service or other users.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">8. Generated Documents</h3>
              <p>
                Any rate confirmations, agreements, or PDFs generated by the Service are provided as templates only. They do not constitute legal advice. You should have all documents reviewed by a qualified attorney before use.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">9. Termination</h3>
              <p>
                We reserve the right to suspend or terminate your account at any time if you violate these Terms or for any other reason at our sole discretion.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">10. Changes to These Terms</h3>
              <p>
                We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">11. Governing Law</h3>
              <p>
                These Terms are governed by the laws of the State of Delaware and the federal laws of the United States, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">12. Contact</h3>
              <p>
                For questions about these Terms, contact us at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline">
                  {SUPPORT_EMAIL}
                </a>.
              </p>
            </section>

            {/* ── Strict Legal Disclaimer: Hours of Service (HOS) & ELD ── */}
            <div className="mt-8 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5 shadow-sm not-prose">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-200/70 text-amber-900 shrink-0 mt-0.5">
                  <AlertTriangle className="h-6 w-6 text-amber-700" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-amber-950 text-sm tracking-tight">
                    Critical Regulatory Notice: Hours of Service (HOS) &amp; ELD Compliance
                  </h4>
                  <p className="text-sm font-semibold text-amber-900 leading-relaxed">
                    Hours of Service (HOS) provided in this app are for estimation purposes only. Dash Dispatch is NOT a certified Electronic Logging Device (ELD). Drivers must strictly rely on their certified ELD for legal compliance.
                  </p>
                </div>
              </div>

              {/* Mandatory Checkbox */}
              <div className="mt-4 pt-3 border-t border-amber-200">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="eldAcknowledged"
                    checked={eldAcknowledged}
                    onCheckedChange={(checked) => setEldAcknowledged(checked as boolean)}
                    className="mt-0.5 border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white"
                  />
                  <Label
                    htmlFor="eldAcknowledged"
                    className="text-xs sm:text-sm font-bold text-amber-950 leading-snug cursor-pointer select-none"
                  >
                    I understand and agree that Dash Dispatch does not replace my ELD. <span className="text-red-600">*</span>
                  </Label>
                </div>
                {!eldAcknowledged && (
                  <p className="text-[11px] text-amber-800 font-medium mt-1.5 pl-7">
                    * This acknowledgment is mandatory before you can accept terms and access the dashboard.
                  </p>
                )}
              </div>
            </div>
          </CardContent>

          {/* Action Footer for Acceptance / Decline */}
          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-6 bg-slate-50/60 rounded-b-xl">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleDeclineOrCancel}
                disabled={isProcessing}
                className="w-full sm:w-auto border-slate-300 text-slate-700 hover:text-red-700 hover:border-red-300 hover:bg-red-50"
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Decline &amp; Sign Out
              </Button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="ghost"
                onClick={handleDeclineOrCancel}
                disabled={isProcessing}
                className="w-full sm:w-auto text-slate-500 hover:text-slate-700"
              >
                Cancel
              </Button>

              <Button
                onClick={handleAccept}
                disabled={isProcessing || !eldAcknowledged}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={!eldAcknowledged ? "Please tick the ELD acknowledgment box above to continue" : undefined}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Accept Terms &amp; Continue
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
