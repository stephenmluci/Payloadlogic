'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Shield } from 'lucide-react';

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-semibold mt-6 mb-2 font-headline">{children}</h2>
);

const SectionContent = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
    {children}
  </div>
);

export default function TermsOfServicePage() {
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
            <Shield className="h-8 w-8 text-primary" />
            <CardTitle className="text-3xl font-headline">Terms of Service</CardTitle>
          </div>
          <CardDescription>
            Last Updated: {lastUpdated}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
            <SectionTitle>1. Liability Disclaimer</SectionTitle>
            <SectionContent>
              <p>
                Dash Dispatch Pro and its affiliates shall not be liable for any direct, indirect, or consequential damages, injuries or accidents resulting from app use, user misuse or violation of traffic laws, or technical failures beyond our reasonable control.
              </p>
              <p>
                You agree to use this app at your own risk and in compliance with all applicable laws.
              </p>
            </SectionContent>

            <SectionTitle>2. User Guidelines</SectionTitle>
            <SectionContent>
              <p>By using Dash Dispatch Pro, you agree to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Maintain accurate account information</li>
                <li>Not engage in illegal or fraudulent activities</li>
                <li>Not harass other users or dispatchers</li>
                <li>Not misuse the dispatch system</li>
                <li>Report safety concerns immediately</li>
              </ul>
              <p>Violations may result in account termination.</p>
            </SectionContent>

            <SectionTitle>3. User Content</SectionTitle>
            <SectionContent>
              <p>Users retain ownership but grant Dash Dispatch Pro a worldwide license to use submitted content and the right to moderate or remove inappropriate content.</p>
              <p>Prohibited content includes:</p>
               <ul className="list-disc pl-5 space-y-1">
                <li>Illegal material</li>
                <li>Commercial advertisements</li>
                <li>Personally identifiable information</li>
                <li>Harassing or abusive content</li>
              </ul>
            </SectionContent>

            <SectionTitle>4. General Terms</SectionTitle>
            <SectionContent>
              <ul className="list-disc pl-5 space-y-1">
                <li>We may update these terms with 15 days notice.</li>
                <li>Service available "as-is" without warranties.</li>
                <li>Governing law: State of Delaware, USA.</li>
              </ul>
               <p>Contact: legal@dashdispatchpro.com</p>
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
