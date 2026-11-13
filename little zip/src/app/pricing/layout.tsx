
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Pricing — PayloadLogic",
  description:
    "Simple fleet-based pricing for hotshot owner-operators. Monthly, 6-month, and annual plans. Scales with your fleet size.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
