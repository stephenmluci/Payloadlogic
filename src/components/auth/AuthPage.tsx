
'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Truck, KeyRound, Wand2, UserCheck2 } from 'lucide-react';
import { generatePassword as genPasswordAI } from '@/ai/flows/generate-password';
import { useToast } from '@/hooks/use-toast';

type AuthPageProps = {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  handleSignIn: () => Promise<void>;
  handleSignUp: (role: 'admin' | 'client') => Promise<void>; // Updated to accept role
};

export function AuthPage({ email, setEmail, password, setPassword, handleSignIn, handleSignUp }: AuthPageProps) {
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isGeneratingPassword, setIsGeneratingPassword] = useState(false);
  const [registerAsClient, setRegisterAsClient] = useState(false);
  const { toast } = useToast();

  const toggleFormMode = () => setIsSigningUp(!isSigningUp);

  const handleGeneratePassword = async () => {
    setIsGeneratingPassword(true);
    try {
      const result = await genPasswordAI({ length: 14, includeNumbers: true, includeSymbols: true });
      if (result.password) {
        setPassword(result.password);
        toast({ title: "Password Generated", description: "A secure password has been generated for you." });
      } else {
        toast({ variant: "destructive", title: "Error", description: "Could not generate password." });
      }
    } catch (error) {
      console.error("Error generating password:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to generate password. Please try again." });
    } finally {
      setIsGeneratingPassword(false);
    }
  };

  const onSignUp = () => {
    handleSignUp(registerAsClient ? 'client' : 'admin');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center mb-4">
            <Truck className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-headline">Dash Dispatch Pro</CardTitle>
          <CardDescription>{isSigningUp ? "Create a new account" : "Sign in to your account"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSigningUp ? "new-password" : "current-password"}
              />
              {isSigningUp && (
                 <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleGeneratePassword} 
                  disabled={isGeneratingPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
                  aria-label="Generate secure password"
                >
                  <Wand2 className="h-4 w-4 mr-1" /> {isGeneratingPassword ? 'Generating...' : 'Generate'}
                </Button>
              )}
            </div>
          </div>
          {isSigningUp && (
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
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          {isSigningUp ? (
            <Button onClick={onSignUp} className="w-full" type="button">
              <UserCheck2 className="mr-2 h-5 w-5" /> Sign Up
            </Button>
          ) : (
            <Button onClick={handleSignIn} className="w-full" type="button">
              <KeyRound className="mr-2 h-5 w-5" /> Sign In
            </Button>
          )}
          <Button variant="link" onClick={toggleFormMode} className="text-sm">
            {isSigningUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
