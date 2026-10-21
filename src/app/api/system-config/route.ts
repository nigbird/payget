import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Public on purpose — the self-registration and update-review forms need the
 * upload rules before anyone has an account. Only those fields are returned;
 * the rest of SystemConfig (reset timeout, branch/district lists, ...) stays
 * server-side.
 */
export async function GET() {
  const config = await db.getSystemConfig();
  return NextResponse.json({
    allowedFileTypes: config?.allowedFileTypes ?? [],
    maxFileSizeMB: config?.maxFileSizeMB ?? 5,
  });
}
