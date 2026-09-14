import { NextResponse } from "next/server"
import { resolveOpaqueToken } from "@/lib/opaque-tokens"
import { closeMpgsLinkError } from "@/lib/mpgs-settlement"


export async function GET(request: Request) {
  const url = new URL(request.url)
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || url.origin).replace(/\/$/, "")
  const destination = process.env.MPGS_ERROR_URL?.trim() || `${baseUrl}/payment-error`

  try {
    // Logged in full because it is the only view we get of what the gateway
    // appends here, and that shapes how much this redirect can be trusted.
    console.log("[MPGS] Link error redirect:", {
      params: Object.fromEntries(url.searchParams.entries()),
    })

    const token = url.searchParams.get("t")
    if (!token) {
      console.warn("[MPGS] Link error redirect carried no token")
      return NextResponse.redirect(destination)
    }

    const resolved = await resolveOpaqueToken(token)
    if (!resolved.ok) {
      console.warn("[MPGS] Link error token rejected:", resolved.error)
      return NextResponse.redirect(destination)
    }

    const transactionId = resolved.data?.transactionId
    if (typeof transactionId !== "string" || !transactionId) {
      console.warn("[MPGS] Link error token carried no transactionId")
      return NextResponse.redirect(destination)
    }

    const result = await closeMpgsLinkError(transactionId, {
      request,
      errorCode: url.searchParams.get("errorCode"),
      errorDescription: url.searchParams.get("errorDescription"),
    })
    console.log("[MPGS] Link error close:", result)
  } catch (error) {
    console.error("[mpgs-link-error] Error:", error)
  }

  return NextResponse.redirect(destination)
}
