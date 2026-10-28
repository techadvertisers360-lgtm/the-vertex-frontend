import type { MetadataRoute } from 'next';

/** Web app manifest: lets staff install the app on Android / iPhone home screens (opens full-screen, no browser bar). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Vertex Health',
    short_name: 'Vertex Health',
    description: 'The Vertex Health — clinic operations',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#0E4D45',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
