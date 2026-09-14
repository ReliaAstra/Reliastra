import type { Metadata } from 'next';
import Link from 'next/link';

import {
  CopyValue,
  RecheckButton,
} from '@/components/site/evidence-verification-actions';
import {
  evidenceFormat,
  loadVerificationRecord,
  type EvidenceVerificationRecord,
} from '@/lib/evidence-verification';
import { SITE_URL } from '@/lib/seo';

/**
 * The public verification page for one evidence artifact.
 *
 * A printed report is only as strong as the easiest way to check it. Before this
 * page existed the artifact printed a verification id and no address, so the one
 * claim in the document that anyone could have tested required reading our API
 * documentation - which is to say, required trusting us first.
 *
 * Server-rendered on purpose: a counterparty's link preview, a court's archived
 * copy and a journalist's curl all see the same verified statement, and none of
 * them execute JavaScript. The record is read from `/v1/verify/{id}` through a
 * shared loader, so what the page says and what the metadata says cannot diverge.
 *
 * Nothing is inferred here. An unknown reference is "not found"; an unreachable
 * service is "unavailable"; a document without a signing key is reported as
 * unsigned. Inventing a friendlier answer would make this page the weakest part
 * of an artifact built to be the strongest.
 */

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

function titleFor(load: Awaited<ReturnType<typeof loadVerificationRecord>>): string {
  if (load.kind === 'verified') return 'Evidence verified';
  if (load.kind === 'not_found') return 'Reference not found';
  return 'Verification unavailable';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const load = await loadVerificationRecord(token);
  const description =
    load.kind === 'verified'
      ? `RELIASTRA holds an evidence record for this reference: ${
          load.record.authenticity.signed
            ? `Ed25519-signed, key ${load.record.authenticity.signing_key_id ?? 'not recorded'}`
            : 'unsigned by this deployment'
        }, ${
          load.record.retention.expired === true ? 'retention period elapsed' : 'within retention'
        }.`
      : load.kind === 'not_found'
        ? 'No RELIASTRA evidence record matches this reference.'
        : 'RELIASTRA could not reach the verification service. The reference was not checked.';
  const path = `/reports/${encodeURIComponent(token)}`;
  return {
    title: `${titleFor(load)} · RELIASTRA evidence`,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      type: 'website',
      title: `${titleFor(load)} · RELIASTRA`,
      description,
      url: `${SITE_URL}${path}`,
      siteName: 'RELIASTRA',
    },
    twitter: { card: 'summary', title: `${titleFor(load)} · RELIASTRA`, description },
  };
}

function Figure({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'positive' | 'caution';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-[#17615A]'
      : tone === 'caution'
        ? 'text-[#9A5B0B]'
        : 'text-[#0B1220]';
  return (
    <div className="border-t border-[#0B1220] px-0 pt-2.5 pb-3 sm:pr-4">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-[#5A6472] uppercase">
        {label}
      </div>
      <div className={`mt-1.5 text-[17px] leading-tight font-bold ${toneClass}`}>{value}</div>
      {note ? <div className="mt-1.5 text-[11px] leading-snug text-[#5A6472]">{note}</div> : null}
    </div>
  );
}

function FieldRow({
  label,
  value,
  copy,
  mono = true,
}: {
  label: string;
  value: string;
  copy?: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[#DFE4EB] py-2.5 last:border-b-0 sm:grid-cols-[190px_1fr] sm:gap-4">
      <div className="pt-0.5 text-[10px] font-semibold tracking-[0.09em] text-[#5A6472] uppercase">
        {label}
      </div>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span
          className={`min-w-0 break-words text-[13px] text-[#0B1220] ${
            mono ? 'font-mono text-[12px]' : ''
          }`}
        >
          {value}
        </span>
        {copy ? <CopyValue value={copy} /> : null}
      </div>
    </div>
  );
}

function VerifiedRecord({
  token,
  record,
}: {
  token: string;
  record: EvidenceVerificationRecord;
}) {
  const signed = record.authenticity.signed;
  const expired = record.retention.expired === true;
  const unavailableArtifact = record.retention.artifact_available === false;

  return (
    <>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="mt-1 grid size-12 shrink-0 place-items-center rounded-full border border-[#17615A] text-[10px] font-bold tracking-[0.06em] text-[#17615A] uppercase"
        >
          OK
        </span>
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-[#0B1220]">
            Evidence verified
          </h1>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[#3C4655]">
            RELIASTRA holds an evidence snapshot for reference{' '}
            <span className="font-mono text-[13px]">{token}</span>. The hashes, signature and
            retention state below are read from the record at request time - this page is the
            answer, not a copy of the document.
          </p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Signature"
          value={signed ? `Signed · ${record.authenticity.algorithm ?? 'Ed25519'}` : 'Unsigned'}
          tone={signed ? 'positive' : 'caution'}
          note={
            signed
              ? `Key ${record.authenticity.signing_key_id ?? 'not recorded'} · covers the payload bytes, not the PDF`
              : 'This deployment publishes no signing key, so the hashes attest consistency only'
          }
        />
        <Figure
          label="Retention"
          value={expired ? 'Retention elapsed' : `Until ${evidenceFormat.date(record.retention.expires_at)}`}
          tone={expired ? 'caution' : 'neutral'}
          note={
            record.retention.retention_days
              ? `${record.retention.retention_days} day policy · stored files may be deleted after it`
              : 'Issued record; retention policy not stated on the row'
          }
        />
        <Figure
          label="Artifact"
          value={
            unavailableArtifact
              ? 'Row without a file'
              : evidenceFormat.bytes(record.rendering.file_size_bytes)
          }
          tone={unavailableArtifact ? 'caution' : 'neutral'}
          note={
            unavailableArtifact
              ? 'The snapshot exists; the stored document could not be resolved'
              : 'PDF bytes on record, checksummed separately from the payload'
          }
        />
        <Figure
          label="Renderer"
          value={record.rendering.renderer ?? 'Not recorded'}
          note={
            record.rendering.renderer_version
              ? `${record.rendering.renderer_version} · ${record.rendering.note ?? 'pagination is a property of this renderer'}`
              : (record.rendering.note ?? 'provenance recorded from this version onward')
          }
        />
      </div>

      <section className="mt-8">
        <h2 className="text-[13px] font-bold tracking-[0.02em] text-[#0B1220]">
          What is bound to this reference
        </h2>
        <div className="mt-2">
          <FieldRow
            label="Incident ID"
            value={record.incident_id}
            copy={record.incident_id}
          />
          <FieldRow
            label="Dependency ID"
            value={record.dependency_id}
            copy={record.dependency_id}
          />
          <FieldRow
            label="Organization ID"
            value={record.org_id}
            copy={record.org_id}
          />
          <FieldRow
            label="Window (UTC)"
            mono={false}
            value={
              record.time_window
                ? `${evidenceFormat.stamp(record.time_window.start)} → ${evidenceFormat.stamp(
                    record.time_window.end,
                  )}`
                : 'not recorded'
            }
          />
          <FieldRow
            label="Evidence data hash"
            value={evidenceFormat.shortHash(record.data_hash, 16, 12)}
            copy={record.data_hash ?? undefined}
          />
          <FieldRow
            label="Document checksum"
            value={evidenceFormat.shortHash(record.report_checksum, 16, 12)}
            copy={record.report_checksum ?? undefined}
          />
          {signed ? (
            <FieldRow
              label="Signature"
              value={evidenceFormat.shortHash(record.authenticity.signature, 16, 12)}
              copy={record.authenticity.signature ?? undefined}
            />
          ) : null}
          <FieldRow
            label="Methodology"
            mono={false}
            value={record.methodology_version ?? 'not recorded'}
          />
          <FieldRow
            label="Recorded at"
            mono={false}
            value={evidenceFormat.stamp(record.created_at)}
          />
        </div>
      </section>

      <section className="mt-7 border border-[#C6CFDB] p-4">
        <h2 className="text-[13px] font-bold text-[#0B1220]">How to check this yourself</h2>
        <ol className="mt-2.5 space-y-1.5 text-[12.5px] leading-relaxed text-[#3C4655]">
          {(record.verification?.procedure ?? []).map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span className="font-mono text-[11px] text-[#A9761F]">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[#5A6472]">
          The payload itself is not published here. It is issued to the parties named in the
          document, beside it, as a <span className="font-mono">.json</span> artifact - which is
          what makes the hash above meaningful: anyone holding the payload can recompute it without
          asking us anything. Public keys:{' '}
          {record.authenticity.public_keys ? (
            <a
              className="font-mono text-[11px] text-[#0B1220] underline decoration-[#D9A441] decoration-2 underline-offset-2"
              href={record.authenticity.public_keys}
            >
              {record.authenticity.public_keys}
            </a>
          ) : (
            'not published'
          )}
          .
        </p>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <RecheckButton />
        <Link
          href="/research"
          className="text-[12px] text-[#5A6472] underline decoration-[#DFE4EB] underline-offset-2 hover:text-[#0B1220]"
        >
          How RELIASTRA measures, and what it refuses to claim
        </Link>
      </div>
    </>
  );
}

export default async function EvidenceReportPage({ params }: PageProps) {
  const { token } = await params;
  const load = await loadVerificationRecord(token);

  return (
    <div className="min-h-screen bg-[#EEF1F5] text-[#0B1220] antialiased print:bg-white [font-variant-numeric:tabular-nums]">
      <header className="border-b border-[#DFE4EB] bg-white print:hidden">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="size-5" role="img" aria-label="RELIASTRA">
              <rect
                x="0.75"
                y="0.75"
                width="22.5"
                height="22.5"
                fill="none"
                stroke="#0B1220"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
              <path d="M4 16.5h16" stroke="#0B1220" strokeOpacity="0.3" strokeWidth="1.5" />
              <path d="M8 16.5V11" stroke="#0B1220" strokeOpacity="0.5" strokeWidth="1.5" />
              <path d="M16 16.5v-3" stroke="#0B1220" strokeOpacity="0.5" strokeWidth="1.5" />
              <path d="M12 16.5V6.5" stroke="#D9A441" strokeWidth="1.75" />
            </svg>
            <span className="text-[13px] font-bold tracking-[0.14em]">RELIASTRA</span>
          </Link>
          <span className="text-[10px] font-semibold tracking-[0.12em] text-[#5A6472] uppercase">
            Evidence verification · no account required
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[860px] px-0 py-0 sm:px-5 sm:py-10">
        <article className="border border-[#DFE4EB] bg-white px-5 py-8 sm:px-10 sm:py-11 print:border-0">
          {load.kind === 'verified' ? (
            <VerifiedRecord token={token} record={load.record} />
          ) : (
            <>
              <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em]">
                {load.kind === 'not_found' ? 'Reference not found' : 'Verification unavailable'}
              </h1>
              <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-[#3C4655]">
                {load.kind === 'not_found' ? (
                  <>
                    No RELIASTRA evidence record matches{' '}
                    <span className="font-mono text-[13px]">{token}</span>. The reference may have
                    been transcribed from a printed page, edited, or revoked. A missing record is
                    not a denial of the underlying event - it means only this.
                  </>
                ) : (
                  'RELIASTRA could not reach the verification service, so this reference was not checked. This is a service problem, not a statement about the document. Try again shortly.'
                )}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <RecheckButton />
                <Link
                  href="/contact"
                  className="text-[12px] text-[#5A6472] underline decoration-[#DFE4EB] underline-offset-2 hover:text-[#0B1220]"
                >
                  Contact RELIASTRA
                </Link>
              </div>
            </>
          )}
        </article>

        <p className="mx-auto mt-5 max-w-[80ch] px-1 text-[11.5px] leading-relaxed text-[#5A6472] print:hidden">
          This page states what RELIASTRA holds. It assigns no liability, certifies no service
          credit, and offers no legal opinion - the measurement record it refers to states its own
          limits in its final sections.
        </p>
      </main>
    </div>
  );
}
