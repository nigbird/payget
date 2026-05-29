import { NextResponse } from "next/server"

/**
 * Legacy payment callback endpoint (removed for security).
 * Provider callbacks must use POST /api/provider/callback with encrypted payloads.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint has been removed.",
      message: "Use POST /api/provider/callback with the provider encrypted callback format.",
    },
    { status: 410 }
  )
}
