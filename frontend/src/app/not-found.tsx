import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function RootNotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F7F8FA] px-6 text-[#0B1220] dark:bg-[#0B0F19] dark:text-[#F8FAFC]">
      {/* Ambient grid + glow, matching the product shell */}
      <div className="grid-pattern pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(37,99,235,0.35), transparent)',
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-rs-border-subtle bg-white shadow-sm dark:bg-[#111726]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-[#2563EB]">
            <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#69748A] dark:text-[#6B7893]">
          Error 404
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
          This page went{' '}
          <span className="text-gradient-brand">offline</span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-[#3F4A5C] dark:text-[#A5B0C2]">
          The page you are looking for does not exist or was moved.
          Your dependencies are still being monitored — nothing is down on our side.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#2563EB] px-5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] sm:w-auto"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#D5DAE2] bg-white px-5 text-sm font-medium text-[#0B1220] transition-colors hover:bg-[#F1F3F7] dark:border-[#313F58] dark:bg-transparent dark:text-[#F8FAFC] dark:hover:bg-[#182136] sm:w-auto"
          >
            Back to home
          </Link>
        </div>

        <p className="mt-10 font-mono text-xs text-[#69748A] dark:text-[#6B7893]">
          status: <span className="text-[#059669]">operational</span> · route: not found · your monitors: unaffected
        </p>
      </div>
    </main>
  );
}
