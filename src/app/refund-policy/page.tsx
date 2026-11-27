"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayloadLogicLogo } from "@/components/brand/PayloadLogicLogo";
import { SUPPORT_EMAIL } from "@/lib/support";

export default function RefundPolicyPage() {
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
            <CardTitle className="text-2xl font-bold font-headline">Refund Policy</CardTitle>
            <p className="text-sm text-muted-foreground">All Sales Final</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-4">
            <p className="font-medium text-slate-900 leading-relaxed">
              All sales are final. PayloadLogic does not offer refunds on subscriptions, trials converted to paid plans, or any other purchases. By subscribing or making a payment, you acknowledge and agree that all fees are non-refundable. If you experience a technical issue that prevents you from using the service, contact{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline font-semibold">
                {SUPPORT_EMAIL}
              </a>{" "}
              and we will work to resolve it, but this does not entitle you to a refund.
            </p>
            <p className="text-xs text-muted-foreground pt-2 border-t border-slate-100">
              See also our{" "}
              <Link href="/terms-of-service#refund-policy" className="text-blue-600 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/pricing" className="text-blue-600 hover:underline">
                Pricing
              </Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
