import Link from 'next/link';

import { deriveState, elapsed, NO_OBSERVATION } from '@/lib/observatory/format';
import { canonicalUrl, breadcrumbJsonLd } from '@/lib/seo';
import { PUBLIC_ROUTES, SHARE_ROUTES } from '@/lib/routes';
import type { TrackCategoryDetail, TrackVendorListItem } from '@/lib/track-api';
import { JsonLd } from '@/components/seo/json-ld';
import { Breadcrumb } from '@/components/site/primitives';
import {
  Notice,
  ObservatoryShell,
  RecordSection,
  RecordTable,
  SpecRow,
  StateWord,
  Value,
  type RecordColumn,
} from '@/components/observatory/primitives';

/**
 * The public record for one catalog category (`/observatory/{slug}` where
 * the slug is a taxonomy entry, not a vendor).
 *
 * Everything rendered comes from the category API: the taxonomy row owns the
 * name and scope language, and every row in the table is a real vendor
 * record with its own observed state. The page adds no figures of its own -
 * a category has no latency or availability of its own here, only the sum
 * of the records it groups. A "category health" number rolled up from
 * unlike endpoints would be a marketing statistic, not a measurement, and
 * it is deliberately absent.
 */
export function CategoryRecord({ category }: { category: TrackCategoryDetail }) {
  const path = SHARE_ROUTES.observatoryCategory(category.slug);
  const vendors = category.vendors ?? [];

  const columns: RecordColumn<TrackVendorListItem>[] = [
    {
      key: 'name',
      head: 'Dependency',
      width: 'minmax(0,1fr)',
      mobile: 'lead',
      cell: (v) => (
        <span className="text-[14.5px] font-medium tracking-[-0.01em] text-[var(--ob-text)]">
          {v.display_name}
        </span>
      ),
    },
    {
      key: 'state',
      head: 'Observed state',
      width: 'minmax(0,190px)',
      mobile: 'trail',
      cell: (v) => {
        const verdict = deriveState(v.recent_status, null);
        return <StateWord size="sm" state={verdict.state} word={verdict.word} />;
      },
    },
    {
      key: 'observed',
      head: 'Last observation',
      width: 'minmax(0,180px)',
      align: 'right',
      cell: (v) => (
        <Value>{v.last_check_at ? `${elapsed(v.last_check_at)} ago` : NO_OBSERVATION}</Value>
      ),
    },
  ];

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.observatory },
            { name: category.name, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(path),
            url: canonicalUrl(path),
            name: `${category.name} dependency records - RELIASTRA observatory`,
            description: category.description ?? undefined,
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
            hasPart: vendors.map((v) => ({
              '@type': 'WebPage',
              name: `${v.display_name} reliability record`,
              url: canonicalUrl(SHARE_ROUTES.observatoryVendor(v.vendor_name)),
            })),
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.observatory },
              { name: category.name, href: path },
            ]}
          />
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-12 pt-10 md:pb-16 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">Catalog category</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>Open record · no account required</span>
          </p>
          <h1 className="obs-name mt-6 max-w-[18ch]">{category.name}</h1>
          {category.description ? (
            <p className="obs-descriptor mt-6 max-w-[62ch]">{category.description}</p>
          ) : null}

          <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-[var(--ob-line-2)] pt-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <dt className="ob-label">Dependencies under observation</dt>
              <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">
                {String(category.vendor_count)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <dt className="ob-label">Taxonomy position</dt>
              <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">
                {category.slug}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <dt className="ob-label">Category scope</dt>
              <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">
                Public catalog records grouped by what they are
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <RecordSection
        index="01"
        id="records"
        tone="base"
        title="Records in this category"
        note={
          <>
            Observed state is each dependency's own verdict from the most recent observation of
            its primary listed endpoint. There is deliberately no category roll-up: unlike
            endpoints do not share a meaningful average.
          </>
        }
        aside={<span className="ob-label md:text-right">Revalidated every 60 seconds</span>}
      >
        {vendors.length ? (
          <RecordTable
            columns={columns}
            rows={vendors}
            rowKey={(v) => v.id}
            rowHref={(v) => SHARE_ROUTES.observatoryVendor(v.vendor_name)}
            caption={`${vendors.length} dependency record${vendors.length === 1 ? '' : 's'} in this category. Times are relative to the most recent completed observation; open a record for exact UTC timestamps.`}
          />
        ) : (
          <Notice title="No public records in this category yet">
            Records appear once dependencies in this category are under observation.
          </Notice>
        )}
      </RecordSection>

      <RecordSection
        index="02"
        id="reading"
        title="How to read this page"
        note="What this grouping does and does not claim."
      >
        <dl className="flex flex-col">
          <SpecRow term="Grouping only" wide>
            A category is a directory position, not a measurement. It groups dependency records so
            engineers can find the class of infrastructure a service belongs to; it does not merge
            their data into one figure.
          </SpecRow>
          <SpecRow term="Observed state" wide>
            From the most recent observation of each dependency's primary listed endpoint, exactly
            the definition used on the observatory index. Open a record for the finer verdict, the
            full telemetry and the incident history.
          </SpecRow>
          <SpecRow term="Independence" wide>
            Every figure on the records under this category originates from a RELIASTRA probe. A
            vendor's own status text is never read or mirrored.
          </SpecRow>
        </dl>
        <p className="ob-small mt-8">
          Full catalog:{' '}
          <Link href={PUBLIC_ROUTES.observatory} className="ob-link">
            observatory index
          </Link>
          .
        </p>
      </RecordSection>
    </ObservatoryShell>
  );
}
