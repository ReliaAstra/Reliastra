'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { RsButton } from '../ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-rs-base p-8 text-center">
        <AlertTriangle size={48} className="text-rs-degraded" />
        <h1 className="mt-4 text-xl font-semibold text-rs-text">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-rs-text-secondary">
          Our team has been notified. If this persists, contact support.
        </p>
        <RsButton className="mt-6" onClick={() => window.location.reload()}>
          Reload page
        </RsButton>
        <a href="mailto:support@reliastra.com" className="mt-3 text-sm text-rs-text-accent">
          Contact support
        </a>
      </div>
    );
  }
}
