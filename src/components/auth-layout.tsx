import * as React from 'react';
import { BrandLogo, BrandMark } from '@/components/brand';

/** Branded frame for sign-in / password screens. `aside` sits above the form (sign-in: "Install in your phone"). */
export function AuthLayout({ title, children, aside }: { title: string; subtitle?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-header items-center bg-brand px-page-mobile text-on-brand sm:px-page">
        <span className="flex items-center gap-2">
          <BrandMark />
          <span className="text-card-title font-bold tracking-tight">The Vertex Health</span>
        </span>
      </header>
      <div className="flex flex-1 items-start justify-center px-page-mobile py-10 sm:items-center sm:px-page">
        <div className="w-full max-w-md">
          <div className="mb-5 flex justify-center">
            <BrandLogo className="w-36" />
          </div>
          <h1 className="sr-only">{title}</h1>
          {aside && <div className="mb-4">{aside}</div>}
          <div className="rounded-card border border-line bg-surface p-5 shadow-card">{children}</div>
        </div>
      </div>
    </main>
  );
}
