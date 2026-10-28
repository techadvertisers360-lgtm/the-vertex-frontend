import type { NextConfig } from 'next';

/**
 * The browser talks to `/api/*` on this origin; Next rewrites to the backend so the httpOnly session
 * cookies are first-party. Socket.IO connects to NEXT_PUBLIC_SOCKET_URL directly (D-025).
 */
const backend = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // e2e builds into its own folder so it never clashes with a running `next dev` (.next)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
