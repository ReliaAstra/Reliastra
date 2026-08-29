import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — RELIASTRA',
  description: 'How RELIASTRA collects, uses, and protects customer data across its monitoring, evidence, and billing systems.',
};

const SECTIONS = [
  {
    title: 'What we collect',
    body: [
      'Account data you provide at registration: name, work email, organization name, and authentication credentials (hashed) or federated identity tokens from Google or GitHub.',
      'Monitoring data: the endpoint URLs, HTTP methods, headers and expected responses of the dependencies you configure us to check, plus the results of those checks (timing, status codes, regional origin).',
      'Operational metadata: incident records, correlation results, generated evidence reports, audit-log entries for security-relevant actions, and billing state.',
      'First-party acquisition attribution: the campaign parameters that brought you to our site (UTM source/medium/campaign and landing path). We use first-party storage only — no third-party advertising cookies.',
    ],
  },
  {
    title: 'How we use it',
    body: [
      'To run the service: scheduling checks, detecting incidents, correlating vendor failures with your alerts, generating evidence reports, and delivering notifications through the channels you configure.',
      'To secure accounts: authentication, session management, rate limiting, payout-destination change verification, and abuse prevention.',
      'To bill accurately: subscription state, usage against plan limits, and payment processing through our payment provider (Paystack). Card details are handled by the provider; RELIASTRA never stores full card numbers.',
      'We do not sell personal data, and we do not share monitoring data with other customers. Public Track pages only ever show aggregated posture for vendors that have been made public — never customer endpoints or credentials.',
    ],
  },
  {
    title: 'Evidence & public data',
    body: [
      'Evidence reports belong to the organization that generated them. They are exposed publicly only through explicit share links or verification references created by that organization.',
      'The public verification endpoint confirms a report exists and binds its checksum — it does not disclose endpoints, headers, or account details.',
    ],
  },
  {
    title: 'Retention',
    body: [
      'Check history is retained according to your plan (24 hours on Free up to 90 days on Professional and Agency) and is pruned automatically by scheduled jobs.',
      'Billing records are retained as long as required for tax and accounting compliance.',
    ],
  },
  {
    title: 'Your choices & contact',
    body: [
      'You may update your organization data in Settings, export or delete dependencies at any time, and request account deletion by contacting support@reliastra.com.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white pb-24 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[760px] px-6 py-16">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-700 hover:text-cyan-600 dark:text-cyan-400">
          ← RELIASTRA
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: August 2026</p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</h2>
              <ul className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <li key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-12 rounded-xl border border-zinc-200 bg-[#F8F9FA] p-5 text-sm leading-relaxed text-zinc-600 dark:border-white/10 dark:bg-[#131318] dark:text-zinc-400">
          Questions about this policy? Contact <span className="font-medium">support@reliastra.com</span>.
          If you arrived from the Partner Network, note that partners are additionally covered by the
          partner-specific terms presented during program enrollment.
        </p>
      </div>
    </main>
  );
}
