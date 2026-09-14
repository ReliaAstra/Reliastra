'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The only two interactions on the public verification page, kept in one client
 * island so the page itself stays server-rendered: a copy affordance (a hash
 * that must be re-typed from a screen is a hash that will be mistyped) and a
 * re-check, which re-runs the server fetch rather than trusting whatever this
 * tab loaded earlier. `force-dynamic` on the route means the refresh is a fresh
 * read of `/v1/verify/{id}`, not a cached render.
 */

export function CopyValue({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is denied in plain HTTP previews and in some
      // enterprise browsers. The value is already on screen and selectable, so
      // the correct response is to say nothing and leave it readable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 border border-[#DFE4EB] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-[#5A6472] uppercase transition-colors hover:border-[#0B1220] hover:text-[#0B1220] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A9761F]"
      aria-label={`${label} ${value}`}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function RecheckButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        router.refresh();
        // `refresh()` resolves when the new RSC payload arrives; the local flag
        // is cleared on a timer so the button never sticks in a disabled state
        // if the render completes before React commits.
        window.setTimeout(() => setBusy(false), 700);
      }}
      className="border border-[#0B1220] bg-[#0B1220] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#18202F] disabled:opacity-60"
    >
      {busy ? 'Re-checking…' : 'Re-check now'}
    </button>
  );
}
