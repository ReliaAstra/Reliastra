'use client';

import { Navbar } from '@/components/landing/sections/Navbar';
import { HeroSection } from '@/components/landing/sections/HeroSection';
import { ProblemSection } from '@/components/landing/sections/ProblemSection';
import { SolutionSection } from '@/components/landing/sections/SolutionSection';
import { EvidenceSection } from '@/components/landing/sections/EvidenceSection';
import { LiveVendorGrid } from '@/components/landing/sections/LiveVendorGrid';
import { ComparisonTable } from '@/components/landing/sections/ComparisonTable';
import { UseCasesSection } from '@/components/landing/sections/UseCasesSection';
import { PartnersSection } from '@/components/landing/sections/PartnersSection';
import { PricingSection } from '@/components/landing/sections/PricingSection';
import { FAQSection } from '@/components/landing/sections/FAQSection';
import { FounderSection } from '@/components/landing/sections/FounderSection';
import { FinalCTA } from '@/components/landing/sections/FinalCTA';
import { Footer } from '@/components/landing/sections/Footer';

export function PageLanding() {
  return (
    <main className="min-h-screen bg-white text-[#09090B] antialiased dark:bg-[#0A0A0F] dark:text-[#FAFAFA]">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <EvidenceSection />
      <LiveVendorGrid />
      <ComparisonTable />
      <UseCasesSection />
      <PartnersSection />
      <PricingSection />
      <FAQSection />
      <FounderSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
