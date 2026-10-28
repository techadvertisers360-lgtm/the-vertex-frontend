import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'The Vertex Health', template: '%s · The Vertex Health' },
  description: 'The Vertex Health — clinic operations',
  // iPhone "Add to Home Screen": open full-screen with this name (the manifest covers Android).
  appleWebApp: { capable: true, title: 'Vertex Health', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0E4D45' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      {/* Browser extensions (e.g. ColorZilla) inject attributes into <body>; don't treat that as a hydration error. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
