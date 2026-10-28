'use client';
import { AppShell } from '@/components/shell/app-shell';
import { Splash } from '@/components/shell/splash';
import { SessionProvider } from '@/lib/session';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider fallback={<Splash />}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
