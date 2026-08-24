'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ChunkLoadError means a JS chunk returned 503 — auto-reload once fixes it.
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold text-destructive">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        A temporary issue occurred while loading the page. Please refresh to continue.
      </p>
      <button
        onClick={() => {
          sessionStorage.removeItem('chunk-reload');
          reset();
        }}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
