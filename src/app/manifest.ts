import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NibTeraMerchant',
    short_name: 'NibTera',
    description: 'Secure Payment Gateway for NibTera Merchants',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#f8b513',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
