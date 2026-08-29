export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="text-rs-brand"
      >
        <rect x="1.5" y="1.5" width="21" height="21" rx="6" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M7.5 12.2l3.2 3.2 6-6.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.18em] text-rs-text">
        Reliastra
      </span>
    </span>
  );
}
