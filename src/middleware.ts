import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap gate: without any session cookie, protected pages go straight to sign-in. This is NOT access control —
 * the backend validates the session and role on every API call; the client also redirects on 401.
 */
// Install files (manifest, service worker, icons) must load without a session so phones can install the app.
const PUBLIC = ['/login', '/forgot-password', '/reset-password', '/f/', '/manifest.webmanifest', '/sw.js', '/icons/'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  // vh_rt is scoped to /api/auth, so pages see the access token or the non-secret session marker instead.
  const hasSession = req.cookies.has('vh_at') || req.cookies.has('vh_s');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
};
