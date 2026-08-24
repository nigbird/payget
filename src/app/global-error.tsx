'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch')
    ) {
      const reloaded = sessionStorage.getItem('chunk-reload');
      if (!reloaded) {
        sessionStorage.setItem('chunk-reload', '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem('chunk-reload');
    }
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center font-sans">
        <h2 className="text-xl font-semibold text-red-600">Something went wrong</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          A temporary issue occurred while loading the page. Please refresh to continue.
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem('chunk-reload');
            reset();
          }}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
