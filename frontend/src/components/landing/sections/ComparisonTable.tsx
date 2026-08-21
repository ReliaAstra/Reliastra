'use client';

import { motion } from 'framer-motion';
import { Check, X, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

const ease = [0.25, 0.1, 0.25, 1] as const;

type CellValue = 'check' | 'x' | 'partial';

interface Row {
  feature: string;
  statusPages: CellValue;
  internalMonitoring: CellValue;
  basicUptime: CellValue;
  reliastra: CellValue;
}

const ROWS: Row[] = [
  { feature: 'Independent Vendor Monitoring', statusPages: 'x', internalMonitoring: 'x', basicUptime: 'x', reliastra: 'check' },
  { feature: 'Multi-Region Verification', statusPages: 'x', internalMonitoring: 'partial', basicUptime: 'x', reliastra: 'check' },
  { feature: 'Vendor-Causal Correlation', statusPages: 'x', internalMonitoring: 'x', basicUptime: 'x', reliastra: 'check' },
  { feature: 'SLA Evidence Report Generation', statusPages: 'x', internalMonitoring: 'x', basicUptime: 'x', reliastra: 'check' },
  { feature: 'Timestamp Chain of Custody', statusPages: 'x', internalMonitoring: 'x', basicUptime: 'x', reliastra: 'check' },
  { feature: 'Real-Time Vendor Dashboard', statusPages: 'partial', internalMonitoring: 'check', basicUptime: 'check', reliastra: 'check' },
];

const HEADERS = ['Feature', 'Status Pages', 'Internal Monitoring', 'Basic Uptime', 'Reliastra'];

function CellIcon({ value }: { value: CellValue }) {
  if (value === 'check') {
    return <Check className="h-[18px] w-[18px] text-[#16A34A] dark:text-[#22C55E]" aria-label="Yes" />;
  }
  if (value === 'x') {
    return (
      <X className="h-[18px] w-[18px] text-[#DC2626] dark:text-[#F87171]" style={{ opacity: 0.5 }} aria-label="No" />
    );
  }
  return <CircleDot className="h-[18px] w-[18px] text-[#D97706] dark:text-[#FBBF24]" aria-label="Partial" />;
}

export function ComparisonTable() {
  return (
    <section className="bg-white py-32 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mx-auto mb-16 max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
            WHY RELIASTRA
          </p>
          <h2 className="mb-6 text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            The evidence gap.
          </h2>
          <p className="leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            Existing monitoring tools can tell you something is wrong. Only Reliastra
            can prove it was your vendor: and give you the evidence to claim your SLA
            credits.
          </p>
        </motion.div>

        <motion.div
          className="mx-auto max-w-4xl overflow-x-auto"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, ease }}
        >
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="bg-[#F8F9FA] dark:bg-[#1A1A20]">
                {HEADERS.map((header, i) => (
                  <th
                    key={header}
                    className={cn(
                      'border-b border-[#E4E4E7] px-4 py-4 text-left text-sm font-semibold text-[#09090B] dark:border-white/10 dark:text-[#FAFAFA]',
                      i === 0 && 'w-[40%]',
                      i === HEADERS.length - 1 &&
                        'border-l-2 border-[#0891B2] bg-[#0891B2]/5 dark:border-[#22D3EE] dark:bg-[#22D3EE]/5'
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  className="border-b border-[#F0F0F0] transition-colors hover:bg-[#F8F9FA]/50 dark:border-white/5 dark:hover:bg-white/5"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease }}
                >
                  <td className="px-4 py-4 text-[#52525B] dark:text-[#A1A1AA]">{row.feature}</td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <CellIcon value={row.statusPages} />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <CellIcon value={row.internalMonitoring} />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <CellIcon value={row.basicUptime} />
                    </div>
                  </td>
                  <td className="border-l-2 border-[#0891B2] bg-[#0891B2]/5 px-4 py-4 text-center dark:border-[#22D3EE] dark:bg-[#22D3EE]/5">
                    <div className="flex justify-center">
                      <CellIcon value={row.reliastra} />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
