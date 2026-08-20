'use client';

import { useMemo } from 'react';
import { IDS, mockEvidence, mockIncidentDetail, mockResults } from '@/lib/dashboard/mock';
import { durationBetween, formatDate, formatUtc, incidentCode, reportCode } from '@/lib/dashboard/format';
import { RsButton } from '../ui/button';

export function EvidenceReportPage({ token }: { token: string }) {
  const report = mockEvidence.find((e) => e.share_token === token || e.id === token) ?? mockEvidence[1];
  const incident = mockIncidentDetail;
  const results = mockResults(IDS.twilio);
  const code = reportCode(report.id);
  const inc = incidentCode(incident.id, incident.display_id);

  const points = useMemo(
    () =>
      (incident.impact?.vendor ?? []).map((p, i) => ({
        x: i,
        vendor: p.v,
        yours: incident.impact?.your_service[i]?.v ?? p.v,
      })),
    [incident]
  );

  return (
    <div className="min-h-screen bg-white text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="rs-no-print sticky top-0 z-10 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-8 py-3">
        <span className="text-sm text-[#64748B]">{code}</span>
        <RsButton onClick={() => window.print()}>Download PDF</RsButton>
      </div>
      <article className="mx-auto max-w-[800px] px-12 py-12">
        <header className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold tracking-[-0.02em]">Reliastra</div>
            <div className="mt-1 text-xs text-[#94A3B8]">Independent dependency evidence</div>
          </div>
          <div className="text-right font-mono text-sm text-[#0F172A]">
            <div>{code}</div>
            <div className="text-[#64748B]">{formatDate(report.generated_at)}</div>
          </div>
        </header>
        <div className="my-4 h-px bg-[#E2E8F0]" />

        <section>
          <h1 className="text-lg font-semibold text-[#0F172A]">Executive summary</h1>
          <div className="mt-4 grid grid-cols-4 gap-4">
            {[
              { label: 'Vendor', value: report.vendor || 'Twilio' },
              { label: 'Incident duration', value: durationBetween(incident.started_at, incident.resolved_at) },
              { label: 'Confidence', value: report.confidence || 'HIGH' },
              { label: 'SLA credit eligible', value: (report.credit_amount ?? 0) > 0 ? 'Yes' : 'No' },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-[11px] uppercase tracking-[0.05em] text-[#94A3B8]">{item.label}</div>
                <div className="mt-1 font-mono text-base text-[#0F172A]">{item.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#334155]">
            {incident.description} Independent checks from multiple regions confirmed the degradation. Report {code} is bound to incident {inc}.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Impact analysis</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#F1F5F9] text-left">
                <th className="border border-[#E2E8F0] px-3 py-2 font-semibold">Metric</th>
                <th className="border border-[#E2E8F0] px-3 py-2 font-semibold">Your service</th>
                <th className="border border-[#E2E8F0] px-3 py-2 font-semibold">Vendor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#E2E8F0] px-3 py-2">Peak error / latency</td>
                <td className="border border-[#E2E8F0] px-3 py-2 font-mono">3.1x baseline</td>
                <td className="border border-[#E2E8F0] px-3 py-2 font-mono">1,240ms p95</td>
              </tr>
              <tr className="bg-[#F8FAFC]">
                <td className="border border-[#E2E8F0] px-3 py-2">Window</td>
                <td className="border border-[#E2E8F0] px-3 py-2 font-mono">{formatUtc(incident.started_at)}</td>
                <td className="border border-[#E2E8F0] px-3 py-2 font-mono">
                  {incident.resolved_at ? formatUtc(incident.resolved_at) : 'Ongoing'}
                </td>
              </tr>
            </tbody>
          </table>
          <svg viewBox="0 0 320 80" className="mt-4 w-full">
            {points.map((p, i) => {
              if (i === 0) return null;
              const prev = points[i - 1];
              const max = Math.max(...points.map((x) => Math.max(x.vendor, x.yours)), 1);
              const x1 = (prev.x / (points.length - 1)) * 320;
              const x2 = (p.x / (points.length - 1)) * 320;
              const y1 = 70 - (prev.vendor / max) * 60;
              const y2 = 70 - (p.vendor / max) * 60;
              const y3 = 70 - (prev.yours / max) * 60;
              const y4 = 70 - (p.yours / max) * 60;
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2563EB" strokeWidth="1.5" />
                  <line x1={x1} y1={y3} x2={x2} y2={y4} stroke="#0F172A" strokeWidth="1.5" />
                </g>
              );
            })}
          </svg>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Multi-region verification</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#F1F5F9] text-left">
                {['Region', 'Time', 'Latency', 'Status', 'Quorum'].map((h) => (
                  <th key={h} className="border border-[#E2E8F0] px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 9).map((r, i) => (
                <tr key={r.id} className={i % 2 ? 'bg-[#F8FAFC]' : 'bg-white'}>
                  <td className="border border-[#E2E8F0] px-3 py-2">{r.region}</td>
                  <td className="border border-[#E2E8F0] px-3 py-2 font-mono">{formatUtc(r.executed_at, 'HH:mm:ss')}</td>
                  <td className="border border-[#E2E8F0] px-3 py-2 font-mono">{Math.round(r.latency_ms)}ms</td>
                  <td className="border border-[#E2E8F0] px-3 py-2">{r.is_up ? 'Up' : 'Down'}</td>
                  <td className="border border-[#E2E8F0] px-3 py-2">{r.quorum_confirmed ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Correlation analysis</h2>
          <p className="mt-2 text-sm text-[#334155]">
            Temporal correlation window 180 seconds. Confidence {report.confidence || 'HIGH'} from independent regional confirmation.
          </p>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#F1F5F9]">
                <th className="border border-[#E2E8F0] px-3 py-2 text-left">Region</th>
                <th className="border border-[#E2E8F0] px-3 py-2 text-left">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#E2E8F0] px-3 py-2">us-east</td>
                <td className="border border-[#E2E8F0] px-3 py-2">Yes</td>
              </tr>
              <tr className="bg-[#F8FAFC]">
                <td className="border border-[#E2E8F0] px-3 py-2">eu-west</td>
                <td className="border border-[#E2E8F0] px-3 py-2">Yes</td>
              </tr>
              <tr>
                <td className="border border-[#E2E8F0] px-3 py-2">ap-south</td>
                <td className="border border-[#E2E8F0] px-3 py-2">No</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">Evidence timeline</h2>
          <ol className="mt-4 space-y-3 border-l border-[#E2E8F0] pl-4">
            {(incident.timeline ?? []).map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#2563EB] bg-white" />
                <div className="font-mono text-xs text-[#94A3B8]">{formatUtc(ev.timestamp, 'HH:mm:ss')}</div>
                <div className="text-sm">{ev.description}</div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold">SLA credit assessment</h2>
          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-[11px] uppercase text-[#94A3B8]">Eligibility</div>
              <div className="mt-1 font-mono">{(report.credit_amount ?? 0) > 0 ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-[#94A3B8]">Estimated credit</div>
              <div className="mt-1 font-mono">${report.credit_amount ?? 0}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-[#94A3B8]">Basis</div>
              <div className="mt-1">Duration × contracted monthly spend share</div>
            </div>
          </div>
        </section>

        <footer className="mt-12 border-t border-[#E2E8F0] pt-4 text-xs text-[#94A3B8]">
          Generated by Reliastra · Independent verification from 3 global regions
          <div>reliastra.com · Page 1 of 1</div>
        </footer>
      </article>
    </div>
  );
}
