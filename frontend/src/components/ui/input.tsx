import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Spec: h-36px bg --rs-input border subtle rounded-lg px-12 text-sm
        // Focus: border --rs-brand + ring brand @20% 3px
        // Error: border --rs-down + helper text 12px --rs-down
        // Placeholder --rs-text-tertiary
        "flex h-9 w-full min-w-0 rounded-[10px] border border-rs-border-subtle bg-rs-input px-3 py-1 text-sm text-rs-text",
        "placeholder:text-rs-text-tertiary",
        "transition-[border-color,box-shadow] duration-150 ease",
        "focus-visible:outline-none focus-visible:border-rs-brand focus-visible:ring-[3px] focus-visible:ring-[rgb(37_99_235_/_0.20)]",
        "dark:focus-visible:ring-[rgb(59_130_246_/_0.20)]",
        "aria-invalid:border-rs-down aria-invalid:ring-[rgb(220_38_38_/_0.15)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "file:text-rs-text file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
}

export { Input }
