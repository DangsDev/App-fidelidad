import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Aquelarre · Programa de puntos',
    short_name: 'Aquelarre',
    description: 'Acumula puntos y canjéalos por fresas con crema y postres. ',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fffaf1',
    theme_color: '#8733b5',
    lang: 'es-MX',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
