'use client';

import { Navbar } from '@/components/landing/sections/Navbar';
import { HeroSection } from '@/components/landing/sections/HeroSection';
import { EvidenceSection } from '@/components/landing/sections/EvidenceSection';
import { LiveVendorGrid } from '@/components/landing/sections/LiveVendorGrid';
import { ComparisonTable } from '@/components/landing/sections/ComparisonTable';
import { PricingSection } from '@/components/landing/sections/PricingSection';
import { FAQSection } from '@/components/landing/sections/FAQSection';
import { FinalCTA } from '@/components/landing/sections/FinalCTA';
import { Footer } from '@/components/landing/sections/Footer';

/**
 * Marketing landing — deliberately tight (8 sections).
 * Narrative: promise → proof (evidence engine) → live data → differentiation
 * → pricing → objections → CTA. Every removed section moved its one
 * essential idea into Hero or Evidence.
 */
export function PageLanding() {
  return (
    <main className="min-h-screen bg-white text-[#09090B] antialiased dark:bg-[#0A0A0F] dark:text-[#FAFAFA]">
      <Navbar />
      <HeroSection />
      <EvidenceSection />
      <LiveVendorGrid />
      <ComparisonTable />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
