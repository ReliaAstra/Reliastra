import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumb } from '@/components/site/primitives';
import { ObservatoryShell, StateWord } from '@/components/observatory/primitives';
import { canonicalUrl, breadcrumbJsonLd, DISCOVERY_ALTERNATES } from '@/lib/seo';
import { robotsDirective } from '@/lib/indexability';
import { PUBLIC_ROUTES, SHARE_ROUTES, researchRoute } from '@/lib/routes';
import { RecordUnreadableError } from '@/lib/track-api';
import {
  loadVendorQuestion,
  vendorQuestionPath,
} from '@/lib/observatory/questions';

/**
 * The direct answer to "Is {vendor} down?" - the question engine's public
 * surface.
 *
 * The answer is not written here. It is composed by the same functions the
 * dependency record's masthead uses (`answerInputFromRecord` +
 * `buildIsDownAnswer`), from the same composed record read - so a reader
 * comparing this page and the record finds one answer, and an answer engine
 * quoting either surface quotes the same measured facts. Every clause of the
 * answer traces to a field the measurement API returned; "we do not know"
 * (stale observation, no observation yet) is composed and published the same
 * way, because it is a real state of the instrument, not a failure of the
 * page.
 *
 * Response contract, identical to every observatory surface: subject exists
 * -> 200 `index`; the catalog does not name this slug -> 404 `noindex`; the
 * measurement API did not answer -> throw, so `app/down/error.tsx` serves a
 * 5xx and the URL keeps its indexability for retry. A category slug is not
 * a subject: this namespace answers questions about measured vendors only.
 *
 * Structured data is an FAQPage whose question and answer text are exactly
 * the rendered strings - published for every resolved record, because every
 * resolved record has an answer (including "unknown"), never for a missing
 * or unreadable one.
 */

interface PageProps {
  params: Promise<{ vendor: string }>;
}

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vendor } = await params;
  const path = vendorQuestionPath(vendor);
  const url = canonicalUrl(path);

  const load = await loadVendorQuestion(vendor);

  /**
   * Existence unknown: the URL keeps its indexability and the body throws
   * for a 5xx. `noindex` here would withdraw a sitemap-listed answer on the
   * strength of a timeout.
   */
  if (load.kind === 'unreadable') {
    return {
      title: 'Direct answer - RELIASTRA observatory',
      alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
      robots: robotsDirective({ index: true, follow: true }),
    };
  }

  if (load.kind === 'missing') {
    return {
      title: 'No such question - RELIASTRA observatory',
      alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
      robots: robotsDirective({ index: false, follow: true }),
    };
  }

  const { answer, record } = load.question;
  const title = `${answer.question} - RELIASTRA observed answer`;
  const description = answer.lead;

  return {
    title,
    description,
    alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
    robots: robotsDirective({ index: true, follow: true }),
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      siteName: 'RELIASTRA',
    },
  };
}

export default async function VendorQuestionPage({ params }: PageProps) {
  const { vendor } = await params;
  const load = await loadVendorQuestion(vendor);

  /**
   * Existence unknown. Throwing is the response: the boundary turns it into
   * a 5xx (retry signal), and under ISR the last good answer keeps serving.
   */
  if (load.kind === 'unreadable') {
    throw new RecordUnreadableError(load.reason, '/public/vendors');
  }
  if (load.kind === 'missing') notFound();

  const { question } = load;
  const { answer, input, record } = question;
  const detail = record.detail;
  const recordPath = SHARE_ROUTES.observatoryVendor(question.vendor);

  const answerText = [answer.lead, ...answer.facts].join(' ');

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.observatory },
            { name: detail.display_name, path: recordPath },
            { name: answer.question, path: vendorQuestionPath(question.vendor) },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            '@id': `${canonicalUrl(vendorQuestionPath(question.vendor))}#faq`,
            mainEntity: [
              {
                '@type': 'Question',
                name: answer.question,
                answerCount: 1,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: answerText,
                },
              },
            ],
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.observatory },
              { name: detail.display_name, href: recordPath },
              { name: 'Direct answer', href: vendorQuestionPath(question.vendor) },
            ]}
          />
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-10 pt-10 md:pb-12 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">RELIASTRA observed answer</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>measured, not reported by {detail.display_name}</span>
          </p>
          <h1 className="ob-h1 mt-6 max-w-[26ch]">{answer.question}</h1>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--ob-line-2)] pt-5">
            <StateWord
              state={input.verdict.state}
              word={input.verdict.word}
              size="sm"
            />
            <span className="ob-label">
              Endpoint scope: {input.endpointHost ?? 'the listed endpoint'}
            </span>
          </div>
        </div>
      </header>

      <div className="ob-container flex flex-col gap-12 py-12 md:py-16">
        <section aria-labelledby="answer-h" className="max-w-[78ch]">
          <h2 id="answer-h" className="ob-h4">
            The answer, from RELIASTRA&apos;s own observations
          </h2>
          <p className="obs-descriptor mt-5 text-[16px] leading-[1.7]">{answer.lead}</p>
          <ul className="mt-6 flex flex-col gap-2" aria-label="Measured facts behind the answer">
            {answer.facts.map((fact) => (
              <li key={fact} className="ob-small max-w-[88ch]">
                {fact}
              </li>
            ))}
          </ul>
          <p className="ob-small mt-5 max-w-[88ch] text-[var(--ob-text-4)]">
            {input.verdict.qualifier}
          </p>
        </section>

        <section aria-labelledby="scope-h" className="max-w-[78ch]">
          <h2 id="scope-h" className="ob-h4">
            What this answer does not claim
          </h2>
          <ul className="mt-5 flex flex-col gap-4">
            {answer.caveats.map((caveat) => (
              <li key={caveat} className="max-w-[78ch] text-[14.5px] leading-relaxed text-[var(--ob-text-2)]">
                {caveat}
              </li>
            ))}
            <li className="max-w-[78ch] text-[14.5px] leading-relaxed text-[var(--ob-text-2)]">
              Regions are printed only where probes actually measured:{' '}
              {record.regions.length
                ? record.regions.join(', ')
                : 'no region is declared on this record'}
              . Nothing about any other region is claimed or inferred.
            </li>
          </ul>
        </section>

        <section aria-labelledby="behind-h">
          <h2 id="behind-h" className="ob-h4">
            Behind this answer
          </h2>
          <ul className="mt-5 flex flex-col">
            {[
              {
                href: recordPath,
                label: `${detail.display_name} - full measurement record`,
                kind: 'Live observatory',
              },
              {
                href: SHARE_ROUTES.observatoryIncidents,
                label: 'Cross-vendor observed incident search',
                kind: 'Incident search',
              },
              {
                href: researchRoute('how-reliastra-measures-vendor-reliability'),
                label: 'How RELIASTRA measures vendor reliability',
                kind: 'Methodology',
              },
            ].map((link) => (
              <li
                key={link.href}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--ob-line)] py-3.5 last:border-b-0"
              >
                <Link href={link.href} className="ob-link text-[14px]">
                  {link.label}
                </Link>
                <span className="ob-label">{link.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ObservatoryShell>
  );
}
