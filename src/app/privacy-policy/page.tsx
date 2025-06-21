
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileLock } from 'lucide-react';

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-semibold mt-6 mb-2 font-headline">{children}</h2>
);

const SectionContent = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
    {children}
  </div>
);

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const [lastUpdated, setLastUpdated] = React.useState('');

  React.useEffect(() => {
    setLastUpdated(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileLock className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-headline">Privacy Policy</CardTitle>
          </div>
          <CardDescription>
            Last Updated: {lastUpdated}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
            <SectionContent>
              <p>
                Welcome to Dash Dispatch Pro. We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
              </p>
            </SectionContent>

            <SectionTitle>1. Information We Collect</SectionTitle>
            <SectionContent>
              <p>We may collect information about you in a variety of ways. The information we may collect includes:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and telephone number, that you voluntarily give to us when you register with the application.</li>
                <li><strong>Business Data:</strong> Information you provide related to your business operations, including client details, load information, and expense records. This data is stored securely and is considered confidential.</li>
                <li><strong>Usage Data:</strong> We may automatically collect information about your access to and use of the application, such as your IP address, browser type, and operating system.</li>
              </ul>
            </SectionContent>

            <SectionTitle>2. Use of Your Information</SectionTitle>
            <SectionContent>
                <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you to:</p>
                 <ul className="list-disc pl-5 space-y-1">
                    <li>Create and manage your account.</li>
                    <li>Process transactions and manage your operational data (loads, expenses, etc.).</li>
                    <li>Email you regarding your account or order status changes.</li>
                    <li>Monitor and analyze usage and trends to improve your experience with the application.</li>
                    <li>Perform other business activities as needed.</li>
                </ul>
            </SectionContent>

            <SectionTitle>3. Disclosure of Your Information</SectionTitle>
            <SectionContent>
              <p>We do not share your personal or business information with third parties except as described in this Privacy Policy. We may share information we have collected about you in certain situations:</p>
               <ul className="list-disc pl-5 space-y-1">
                <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information is necessary to respond to legal process or protect the rights, property, and safety of others, we may share your information as permitted by law.</li>
                <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including data storage (e.g., Firebase), and email delivery.</li>
              </ul>
            </SectionContent>

            <SectionTitle>4. Security of Your Information</SectionTitle>
            <SectionContent>
              <p>We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable.</p>
            </SectionContent>
            
            <SectionTitle>5. Policy for Children</SectionTitle>
            <SectionContent>
              <p>We do not knowingly solicit information from or market to children under the age of 13. If you become aware of any data we have collected from children under age 13, please contact us using the contact information provided below.</p>
            </SectionContent>

            <SectionTitle>6. Contact Us</SectionTitle>
            <SectionContent>
                <p>If you have questions or comments about this Privacy Policy, please contact us at: legal@dashdispatchpro.com</p>
            </SectionContent>
          </div>

          <div className="mt-8 text-center border-t pt-6">
            <Button onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
