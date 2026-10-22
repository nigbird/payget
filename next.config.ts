import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // pino writes logs from a worker thread; it must load from node_modules, not the bundle.
  serverExternalPackages: ['pino', 'pino-roll', 'thread-stream'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // No remote image hosts: every image is served by this app (uploads go through
  // /api/uploads/*). The old placeholder hosts were unused template leftovers.
  images: {
    remotePatterns: [],
  },
  // Don't advertise the framework in response headers.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Service worker must always be re-fetched so security fixes deploy immediately.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // The legacy XSS auditor is removed from browsers and could itself be
            // abused; current guidance (OWASP) is to disable it and rely on CSP.
            key: 'X-XSS-Protection',
            value: '0',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            //  Disable browser features not used by this payment app
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), usb=(), bluetooth=(), serial=()',
          },
          {
            //  Prevent this app's window from being opened by cross-origin pages
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            //  Prevent cross-origin pages from embedding this app's resources
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-site',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            // No Flash/PDF cross-domain policy files may grant other sites access.
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
          {
            // Every resource this app loads is same-origin (fonts are self-hosted
            // by next/font, images/audio are local), so pages can require that
            // nothing cross-origin is embedded without opting in.
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
      {
        // The speaker scans the portal's pairing QR code with the camera.
        // Same policy as above (this later entry overrides it), with the
        // camera allowed for this page only.
        source: '/speaker',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), usb=(), bluetooth=(), serial=()',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; frame-ancestors 'none';",
          },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/merchant/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/login/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/forgot-password',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        // The real page is /reset-password/<token>; the old exact '/reset-password'
        // match never applied to it.
        source: '/reset-password/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;