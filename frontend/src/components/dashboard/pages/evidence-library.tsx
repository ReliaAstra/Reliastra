'use client';

import { FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { hasEvidence } from '@/lib/dashboard/plans';
import { useEvidence } from '@/lib/dashboard/queries';
import { formatDate, reportCode } from '@/lib/dashboard/format';
import { RsButton } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { TableSkeleton } from '../ui/skeleton';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EvidenceLibraryPage() {
  const { data, isLoading } = useEvidence();
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const router = useRouter();
  const [q, setQ] = useState('');
  const [vendor, setVendor] = useState('all');
  const allowed = hasEvidence(plan?.plan);

  const vendors = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.vendor).filter(Boolean))) as string[],
    [data]
  );
  const filtered = (data ?? []).filter((r) => {
    const hay = `${r.title ?? ''} ${r.vendor ?? ''} ${r.id}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (vendor !== 'all' && r.vendor !== vendor) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Evidence</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">
          Timestamped reports for vendor SLA claims.
        </p>
      </div>

      {!allowed ? (
        <div className="rounded-xl border border-dashed border-rs-border bg-rs-elevated px-6 py-16 text-center">
          <Lock size={32} className="mx-auto text-rs-text-tertiary" />
          <h3 className="mt-3 text-base font-medium text-rs-text">Evidence reports are a Standard feature</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-rs-text-secondary">
            Generate structured, timestamped evidence reports for vendor SLA claims. Upgrade to Standard to unlock.
          </p>
          <RsButton className="mt-4" onClick={() => openUpgrade('evidence')}>
            Start Standard trial
          </RsButton>
        </div>
      ) : isLoading ? (
        <TableSkeleton />
      ) : !data?.length ? (
        <EmptyState
          icon={<FileText size={32} />}
          title="No evidence reports"
          body="Reports are generated from resolved incidents with multi-region confirmation."
          actionLabel="View incidents"
          onAction={() => router.push('/incidents')}
          helpLabel="What is an evidence report?"
          onHelp={() => window.open('mailto:support@reliastra.com?subject=What%20is%20an%20evidence%20report%3F')}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-rs-text-tertiary" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search reports"
                className="w-full rounded-lg border border-rs-border bg-rs-input py-2.5 pl-9 pr-3 text-sm text-rs-text outline-none placeholder:text-rs-text-tertiary focus:border-rs-brand"
              />
            </div>
            <select
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="rounded-lg border border-rs-border bg-rs-input px-3 py-2.5 text-sm text-rs-text"
            >
              <option value="all">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            {filtered.map((r) => (
              <div
                key={r.id}
                className="mb-3 flex items-center justify-between rounded-xl border border-rs-border-subtle bg-rs-elevated p-5"
              >
                <div className="flex items-start gap-3">
                  <FileText size={20} className="mt-0.5 text-rs-text-accent" />
                  <div>
                    <div className="font-mono text-sm font-medium text-rs-text-accent">{reportCode(r.id)}</div>
                    <div className="mt-1 text-sm text-rs-text">{r.title || 'Evidence report'}</div>
                    <div className="mt-1 text-xs text-rs-text-tertiary">
                      {r.vendor || 'Vendor'} · {formatDate(r.generated_at)} · {r.confidence || 'MEDIUM'}
                      {typeof r.credit_amount === 'number' && (
                        <span
                          className={cn(
                            'ml-2',
                            r.credit_amount > 0 ? 'font-bold text-rs-up' : 'text-rs-text-tertiary'
                          )}
                        >
                          {r.credit_amount > 0 ? `$${r.credit_amount} credit` : '$0 credit'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RsButton variant="secondary" onClick={() => router.push(`/reports/${r.share_token || r.id}`)}>
                    Download PDF
                  </RsButton>
                  <RsButton
                    variant="ghost"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/reports/${r.share_token || r.id}`
                      )
                    }
                  >
                    Share
                  </RsButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
