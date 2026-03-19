'use client';

import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App render failed:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Runtime Error
            </p>
            <h1 className="mt-4 text-3xl font-semibold">
              The app hit an unexpected render failure.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Reload the page to recover. If the problem keeps happening, check
              the latest console error before continuing.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-200"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
