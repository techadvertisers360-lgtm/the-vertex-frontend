'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, BellRing, Eye, KeyRound, LogOut, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { LEADERSHIP_ROLES, recordHref, ROLE_LABEL } from '@/lib/links';
import { RealtimeProvider, useRealtime, type LiveNotification } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { NotificationRail, useUnreadCount } from './notification-rail';
import { BrandMark } from '@/components/brand';
import { NotificationPrompt } from '@/components/push-settings';
import { HeaderAttendance } from './header-attendance';
import { GeofenceGate } from './geofence-gate';

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useSession();
  const pathname = usePathname();
  // Longest matching prefix is the active item.
  const active = [...me.nav].sort((a, b) => b.path.length - a.path.length).find((n) => pathname === n.path || pathname.startsWith(n.path + '/'));
  return (
    <nav aria-label="Main" className="space-y-0.5 p-3">
      {me.nav.map((n) => {
        const isActive = active?.key === n.key;
        return (
          <Link
            key={n.key}
            href={n.path}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-control-touch items-center rounded-control border-l-[length:var(--spacing-accent)] px-3 text-body sm:min-h-control',
              isActive ? 'border-l-brand bg-brand-light font-semibold text-brand' : 'border-l-transparent text-ink hover:bg-canvas',
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Header({ onMenu, onBell }: { onMenu: () => void; onBell: () => void }) {
  const { me, signOut } = useSession();
  const { connected } = useRealtime();
  const unread = useUnreadCount();
  const leadership = LEADERSHIP_ROLES.includes(me.user.role);
  return (
    <header className="sticky top-0 z-30 flex h-header items-center gap-2 bg-brand px-2 text-on-brand sm:px-4">
      <Button variant="onBrand" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>
      <Link href={me.home} className="flex items-center gap-2 px-1">
        <BrandMark />
        <span className="text-card-title font-bold tracking-tight">The Vertex Health</span>
      </Link>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <span className={cn('hidden items-center gap-1.5 text-[12px] sm:inline-flex', connected ? 'text-on-brand-muted' : 'text-gold')} title={connected ? 'Live updates on' : 'Offline — refresh every 30 s'}>
          <span className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-gold')} />
          {connected ? 'Live' : 'Offline'}
        </span>
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-dense font-semibold">{me.user.displayName}</p>
        </div>
        <Chip tone={leadership ? 'gold' : 'brand'} className="hidden sm:inline-flex">
          {ROLE_LABEL[me.user.role]}
        </Chip>
        <HeaderAttendance />
        <Button variant="onBrand" size="icon" onClick={onBell} aria-label={`Notifications, ${unread} unread`} className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-on-brand">{unread > 99 ? '99+' : unread}</span>
          )}
        </Button>
        {!me.viewAs && (
          <Button asChild variant="onBrand" size="icon" aria-label="Phone notifications" title="Phone notifications">
            <Link href="/account/notifications">
              <BellRing className="size-5" />
            </Link>
          </Button>
        )}
        {!me.viewAs && me.user.role === 'DEVELOPER' && (
          <Button asChild variant="onBrand" size="icon" aria-label="Password badlein" title="Password badlein">
            <Link href="/account/password">
              <KeyRound className="size-5" />
            </Link>
          </Button>
        )}
        <Button variant="onBrand" size="icon" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
          <LogOut className="size-5" />
        </Button>
      </div>
    </header>
  );
}

/**
 * Keeps each role inside its own area of the app (UI convenience — the API enforces access). `/account/password` is
 * the developer's own password page (D-044); `/account/notifications` and `/n/<id>` are for everyone (D-046).
 */
function RoleGuard({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  // Only the developer changes a password (D-044); every user has their phone-notification settings and the
  // notification-tap redirect (D-046).
  const shared = pathname === '/account/notifications' || pathname.startsWith('/n/');
  const account = shared || (me.user.role === 'DEVELOPER' && (pathname === '/account' || pathname.startsWith('/account/')));
  const mustChange = me.user.mustChangePassword && pathname !== '/account/password';
  const allowed = !mustChange && (account || pathname === me.home || pathname.startsWith(me.home + '/'));
  React.useEffect(() => {
    if (mustChange) {
      router.replace('/account/password');
    } else if (!allowed) {
      toast.error('Aap ko is screen ki ijazat nahi hai.');
      router.replace(me.home);
    }
  }, [allowed, mustChange, me.home, router]);
  return allowed ? <>{children}</> : null;
}

/** Developer "view as" (D-043): shows whose screens these are, that nothing can be saved, and the way back. */
function ViewAsBanner() {
  const { me } = useSession();
  const [leaving, setLeaving] = React.useState(false);
  if (!me.viewAs) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-gold/40 bg-gold/10 px-3 py-2 text-dense text-ink">
      <span className="flex items-center gap-2">
        <Eye className="size-4 text-gold" aria-hidden />
        <span>
          Developer view: aap <span className="font-semibold">{me.user.displayName}</span> ({ROLE_LABEL[me.user.role]}) ki screens dekh rahe hain — sirf dekhna, koi save nahi hoga.
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        loading={leaving}
        onClick={async () => {
          setLeaving(true);
          await post('/me/stop-view-as').catch(() => undefined);
          // Full reload: drops this user's cached data and live channel.
          window.location.href = '/developer';
        }}
      >
        Wapas Developer
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [railOpen, setRailOpen] = React.useState(false); // slide-over below xl
  const [railHidden, setRailHidden] = React.useState(false); // toggle on xl+

  const openRecord = React.useCallback(
    (n: LiveNotification) => {
      const href = recordHref(me.user.role, n.recordType, n.recordId);
      if (href) router.push(href);
    },
    [me.user.role, router],
  );

  const onBell = () => {
    if (window.matchMedia('(min-width: 1280px)').matches) setRailHidden((v) => !v);
    else setRailOpen(true);
  };

  return (
    <RealtimeProvider onOpenRecord={openRecord}>
      <GeofenceGate />
      <div className="flex min-h-dvh flex-col">
        <Header onMenu={() => setMenuOpen(true)} onBell={onBell} />
        <div className="flex flex-1">
          <aside className="hidden w-sidebar shrink-0 border-r border-line bg-surface lg:block">
            <div className="sticky top-header">
              <NavList />
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-page-mobile py-4 sm:px-page sm:py-6">
            <ViewAsBanner />
            <NotificationPrompt />
            <RoleGuard>{children}</RoleGuard>
          </main>
          {!railHidden && (
            <aside className="hidden w-rail shrink-0 border-l border-line bg-surface xl:block">
              <div className="sticky top-header h-[calc(100dvh-var(--spacing-header))]">
                <NotificationRail />
              </div>
            </aside>
          )}
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" title="Menu" className="w-sidebar">
          <div className="flex h-header items-center bg-brand px-4 text-on-brand">
            <span className="flex items-center gap-2">
              <BrandMark />
              <span className="text-card-title font-bold">The Vertex Health</span>
            </span>
          </div>
          <NavList onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Dialog>
      <Dialog open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="right" title="Notifications">
          <NotificationRail onClose={() => setRailOpen(false)} />
        </SheetContent>
      </Dialog>
    </RealtimeProvider>
  );
}
