
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Zap, ShieldCheck } from 'lucide-react';

type SubscriptionPageProps = {
  userDisplayName: string;
  onStartTrial: () => void;
  // onChoosePaidPlan: (planId: string) => void; // For future paid plans
};

export function SubscriptionPage({ userDisplayName, onStartTrial }: SubscriptionPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary via-primary/80 to-accent p-4">
      <Card className="w-full max-w-2xl shadow-2xl overflow-hidden">
        <CardHeader className="bg-primary/10 p-8 text-center">
          <Zap className="h-16 w-16 mx-auto text-primary mb-4" />
          <CardTitle className="text-3xl font-headline text-primary-foreground">Welcome, {userDisplayName}!</CardTitle>
          <CardDescription className="text-lg text-primary-foreground/90 mt-2">
            Choose Your Plan & Unleash Your Dispatch Power
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Free Trial Card */}
          <Card className="flex flex-col shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="h-8 w-8 text-green-500" />
                <CardTitle className="text-2xl font-semibold">Free Trial</CardTitle>
              </div>
              <CardDescription>
                Experience Dash Dispatch Pro with no commitment. Explore all features with sample data.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-3 text-sm">
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" /> Full access to all features
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" /> Mock data environment
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" /> No credit card required
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" /> Data is not saved
                </li>
              </ul>
            </CardContent>
            <CardFooter className="mt-auto pt-4 border-t">
              <Button onClick={onStartTrial} className="w-full bg-green-500 hover:bg-green-600 text-white">
                Start Free Trial
              </Button>
            </CardFooter>
          </Card>

          {/* Placeholder for Paid Plan Card */}
          <Card className="flex flex-col shadow-lg border-primary border-2 relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-md">
                MOST POPULAR
            </div>
            <CardHeader className="pb-4">
               <div className="flex items-center gap-3 mb-2">
                <Zap className="h-8 w-8 text-primary" />
                <CardTitle className="text-2xl font-semibold">Pro Plan</CardTitle>
              </div>
              <CardDescription>
                Unlock the full potential with saved data, advanced analytics, and priority support.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-3 text-sm">
              <p className="text-3xl font-bold text-center my-4 text-primary">$49 <span className="text-sm font-normal text-muted-foreground">/ month</span></p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" /> Everything in Free Trial, PLUS:
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" /> Persistent data storage
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" /> Unlimited load entries
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" /> Advanced reporting (coming soon)
                </li>
                 <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" /> Priority email support
                </li>
              </ul>
            </CardContent>
            <CardFooter className="mt-auto pt-4 border-t">
              <Button className="w-full" onClick={() => alert('Paid plan selection coming soon!')}>
                Choose Pro Plan (Coming Soon)
              </Button>
            </CardFooter>
          </Card>
        </CardContent>
         <CardFooter className="text-center justify-center p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground">
                By choosing a plan, you agree to our Terms of Service and Privacy Policy.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
