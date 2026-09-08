/**
 * Boot splash shown while session state is being resolved.
 *
 * It guards the console route group and the marketing entry point, so it is
 * the very first thing a returning operator sees. It is therefore rendered in
 * the product's own palette - void background, restrained signal rule - and
 * not in the default light theme with a cyan checkmark, which belonged to no
 * part of RELIASTRA. There is no spinner: a two-second wait does not need
 * animation to be legible, and reduced-motion users get the same thing.
 */
export function BootSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-[#08090A] px-6 text-[#F2F2EE]"
    >
      <div className="text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.34em] text-[#F2F2EE]">
          RELIASTRA
        </p>
        <div className="mx-auto mt-4 h-px w-24 bg-[#D9A441]" />
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-[#666B70]">
          Restoring session
        </p>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
