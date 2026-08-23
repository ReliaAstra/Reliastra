"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group rs-toaster"
      position="bottom-right"
      expand={false}
      visibleToasts={3}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: 'group toast !rounded-lg !bg-rs-elevated !border-rs-border-subtle !text-rs-text !shadow-rs-popover rs-toast-in',
          title: 'text-sm font-medium text-rs-text',
          description: 'text-xs text-rs-text-secondary',
          actionButton: 'bg-rs-brand text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-rs-brand-hover',
          cancelButton: 'text-xs text-rs-text-tertiary border border-rs-border-subtle',
          success: '!border-rs-border-subtle [&_[data-icon]]:!text-rs-up',
          error: '!border-rs-border-subtle [&_[data-icon]]:!text-rs-down',
        },
      }}
      style={
        {
          "--normal-bg": "var(--rs-elevated)",
          "--normal-text": "var(--rs-text)",
          "--normal-border": "var(--rs-border-subtle)",
          "--success-bg": "var(--rs-elevated)",
          "--error-bg": "var(--rs-elevated)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
