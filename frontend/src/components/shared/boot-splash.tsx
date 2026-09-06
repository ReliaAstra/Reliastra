/**
 * Boot splash shown while session state is being resolved.
 *
 * Previously this markup was inlined twice in `app/page.tsx`. It now also
 * guards the console route group, where it replaces the previous behaviour of
 * rendering the entire dashboard chrome to an unauthenticated visitor and only
 * redirecting afterwards.
 */
export function BootSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-white text-[#09090B] dark:bg-[#0A0A0F] dark:text-[#FAFAFA]"
    >
      <div className="flex items-center gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="animate-pulse text-[#0891B2] dark:text-[#22D3EE]"
        >
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M8 12L11 15L16 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-mono text-xs tracking-widest uppercase">
          RELIASTRA
        </span>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
