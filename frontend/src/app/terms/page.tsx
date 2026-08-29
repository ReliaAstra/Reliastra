import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — RELIASTRA',
  description: 'The terms governing use of the RELIASTRA dependency monitoring, incident correlation, and evidence platform.',
};

const SECTIONS = [
  {
    title: '1. The service',
    body: 'RELIASTRA monitors third-party endpoints you configure ("dependencies"), correlates their failures with your reported incidents, attributes likely causes using a deterministic engine, and generates verifiable evidence reports. The service is provided over a subscription with plan-based limits.',
  },
  {
    title: '2. Accounts & trials',
    body: 'You must provide accurate registration information and are responsible for activity under your account. New organizations receive a free trial with elevated capabilities for fourteen (14) days from account creation. Trial eligibility and expiration are determined solely by RELIASTRA\'s systems; attempting to circumvent trial limits may result in suspension. When a trial ends, the organization reverts to its underlying plan unless a paid subscription is active.',
  },
  {
    title: '3. Acceptable use',
    body: [
      'You may only monitor endpoints you are authorized to test. Do not configure checks against systems you do not own or operate without permission.',
      'Do not use the service to attack, overload, or probe beyond reasonable health-check load any third party; check intervals are capped by plan for this reason.',
      'Do not attempt to access other organizations\' data, share tokens or API keys publicly, or reverse engineer platform controls.',
    ],
  },
  {
    title: '4. Plans, billing & payouts',
    body: 'Paid plans renew monthly until cancelled and are billed through our payment provider. Plan limits (dependency count, team size, retention, check interval) are enforced server-side. Partner referral commissions accrue per the partner program terms shown at enrollment, including hold periods and payout minimums; commission reversals apply on refunds and chargebacks of the underlying subscription payment.',
  },
  {
    title: '5. Evidence reports',
    body: 'Evidence reports reflect measurements recorded by RELIASTRA probes during the stated window and are bound to checksums you can verify through public verification links. They document observed behavior; they do not by themselves constitute legal determinations of fault or contractual SLA credits, which remain governed by your agreements with the relevant vendor.',
  },
  {
    title: '6. Availability & liability',
    body: 'We target high availability but do not warrant uninterrupted service. To the maximum extent permitted by law, RELIASTRA\'s aggregate liability is limited to the amounts you paid in the three months preceding the claim, and we are not liable for indirect or consequential damages.',
  },
  {
    title: '7. Termination & contact',
    body: 'You may cancel at any time; access continues to the end of the paid period. We may suspend accounts that violate these terms. Questions: support@reliastra.com.',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white pb-24 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[760px] px-6 py-16">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-700 hover:text-cyan-600 dark:text-cyan-400">
          ← RELIASTRA
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: August 2026</p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</h2>
              {Array.isArray(s.body) ? (
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  {s.body.map((p, i) => (
                    <li key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{s.body}</p>
              )}
            </section>
          ))}
        </div>

        <p className="mt-12 rounded-xl border border-zinc-200 bg-[#F8F9FA] p-5 text-sm leading-relaxed text-zinc-600 dark:border-white/10 dark:bg-[#131318] dark:text-zinc-400">
          These terms govern the RELIASTRA product. Partner Network participants are additionally
          bound by the partner program terms presented at enrollment.
        </p>
      </div>
    </main>
  );
}
