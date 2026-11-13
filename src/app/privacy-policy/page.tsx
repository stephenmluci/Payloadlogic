"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PRIVACY_EMAIL } from "@/lib/support";
import { PayloadLogicLogo } from "@/components/brand/PayloadLogicLogo";

export default function PrivacyPolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={30} />
          </Link>
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: October 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6">
            <section>
              <h3 className="font-semibold text-lg">1. Introduction</h3>
              <p>
                This Privacy Policy explains how PayloadLogic (“we”, “us”, or “our”) collects, uses, and shares information when you use our Service.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">2. Information We Collect</h3>
              <p>We collect the following types of information:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Account Information:</strong> Name, email address, company name, and password when you register.</li>
                <li><strong>Business Data:</strong> Client information, load details, expenses, vehicle information, and other data you enter into the Service.</li>
                <li><strong>Usage Data:</strong> Information about how you interact with the Service (pages viewed, features used, etc.).</li>
                <li><strong>Device & Log Data:</strong> IP address, browser type, and device information.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg">3. How We Use Information</h3>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process transactions and send related information</li>
                <li>Respond to your requests and provide customer support</li>
                <li>Monitor and analyze usage and trends</li>
                <li>Detect, prevent, and address technical issues or fraud</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg">4. How We Share Information</h3>
              <p>
                We do not sell your personal information. We may share information with:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Service providers who help us operate the Service (for example, Firebase/Google Cloud for hosting and authentication)</li>
                <li>Professional advisors (lawyers, accountants) when necessary</li>
                <li>Authorities when required by law or to protect our rights</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg">5. Data Storage & Security</h3>
              <p>
                Your data is stored on Firebase (Google Cloud) infrastructure. We use industry-standard security measures. However, no method of transmission or storage is 100% secure.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">6. Data Retention</h3>
              <p>
                We retain your information for as long as your account is active or as needed to provide the Service. You may request deletion of your account and associated data by contacting us.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">7. Your Rights</h3>
              <p>
                Depending on your location, you may have rights to access, correct, delete, or export your personal information. To exercise these rights, contact us at{' '}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="text-blue-600 hover:underline">
                  {PRIVACY_EMAIL}
                </a>.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">8. Children’s Privacy</h3>
              <p>
                The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">9. Changes to This Policy</h3>
              <p>
                We may update this Privacy Policy from time to time. We will post the updated version on this page and update the “Last updated” date.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg">10. Contact Us</h3>
              <p>
                If you have questions about this Privacy Policy, contact us at{' '}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="text-blue-600 hover:underline">
                  {PRIVACY_EMAIL}
                </a>.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
