'use client';

import { Fingerprint, Lock, ServerCog } from 'lucide-react';

/**
 * Security indicators, stated as facts.
 *
 * These are the three things that are actually true of this checkout and that a
 * B2B buyer checking out for infrastructure care about: who holds the card,
 * where the money is being taken, and that what they were quoted is what is
 * charged. What is deliberately absent: a wall of badges for certifications
 * RELIASTRA does not hold, PCI-scramble icons that mean nothing, and "256-bit
 * encryption" boilerplate — trust copy that cannot be verified reads as noise
 * to this buyer and cheapens the claims that can be.
 */
export function TrustMarks() {
  return (
    <div className="border-t border-rs-border-subtle bg-rs-base px-5 py-4">
      <ul className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
        <Mark icon={Lock} title="Card details stay with Paystack" body="RELIASTRA never receives your card number, expiry or CVC." />
        <Mark icon={Fingerprint} title="Amount fixed before you pay" body="The charge above is the amount sent to the provider — no conversion at the last step." />
        <Mark icon={ServerCog} title="Verified on our servers" body="Your plan activates after Paystack confirms the payment to us, not when a window closes." />
      </ul>
    </div>
  );
}

function Mark({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Lock;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-rs-text-tertiary" />
      <div className="min-w-0">
        <p className="text-[12px] font-medium leading-snug text-rs-text">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-rs-text-tertiary">{body}</p>
      </div>
    </li>
  );
}
