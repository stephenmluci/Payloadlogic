import type { Metadata } from 'next';
import { MarketingLandingClient } from '@/components/landing/MarketingLandingClient';

export const metadata: Metadata = {
  title: 'PayloadLogic — Hotshot TMS Built for Owner-Operators',
  description:
    'Streamline your loads, maximize every trailer foot, and track every dollar. The all-in-one dispatch and fleet management platform built for hotshot truck owners.',
};

export default function HomePage() {
  return <MarketingLandingClient />;
}
