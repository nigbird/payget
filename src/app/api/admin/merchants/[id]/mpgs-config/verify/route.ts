import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { withMerchantSecret } from "@/lib/merchant-secret"
import { requireCsrf } from "@/lib/request-security"
import {
  DEFAULT_MPGS_API_VERSION,
  DEFAULT_MPGS_BASE_URL,
  DEFAULT_MPGS_CURRENCY,
  resolveMpgsConfigForMerchant,
  type MpgsConfig,
} from "@/lib/mpgs-client"
import { checkMpgsConfig, summarise, type ConfigCheckReport } from "@/lib/gateway-config-check"

/**
 * Tests MPGS credentials against the gateway without charging anything.
 *
 * With an empty body it checks what this merchant's payments would actually use
 * (their own profile, or the platform fallback). With form values it checks
 * those before they are saved; a blank password reuses the stored one.
 */

const VerifySchema = z.object({
  mpgsMerchantId: z.string().trim().max(200).optional(),
  mpgsPassword: z.string().trim().max(200).optional(),
  mpgsBaseUrl: z.string().trim().max(500).optional(),
  mpgsCurrency: z.string().trim().max(3).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrf(request)
  if (csrfError) return csrfError

  const user = await requireAuthUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!userHasPermission(user, "MERCHANT_APPROVE")) {
    return NextResponse.json({ error: "Permission denied: MERCHANT_APPROVE required" }, { status: 403 })
  }

  const { id } = await params
  const stored = await db.getMerchantMpgsCredentials(id)
  if (!stored) return NextResponse.json({ error: "Merchant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = VerifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }
  const form = parsed.data

  let config: MpgsConfig
  let source: ConfigCheckReport["source"]

  if (form.mpgsMerchantId) {
    const password =
      form.mpgsPassword ||
      (stored.mpgsPassword ? withMerchantSecret(stored.mpgsPassword, (plaintext) => plaintext) : "")
    if (!password) {
      return NextResponse.json({
        status: "fail",
        source: "form",
        checks: [{ label: "Credentials", status: "fail", detail: "Enter the MPGS password to test these credentials." }],
      } satisfies ConfigCheckReport)
    }
    config = {
      baseUrl: (form.mpgsBaseUrl || process.env.MPGS_BASE_URL?.trim() || DEFAULT_MPGS_BASE_URL).replace(/\/$/, ""),
      apiVersion: process.env.MPGS_API_VERSION?.trim() || DEFAULT_MPGS_API_VERSION,
      merchantId: form.mpgsMerchantId,
      password,
      currency: (form.mpgsCurrency || process.env.MPGS_CURRENCY?.trim() || DEFAULT_MPGS_CURRENCY).toUpperCase(),
    }
    source = "form"
  } else {
    try {
      config = await resolveMpgsConfigForMerchant(id)
    } catch (error) {
      return NextResponse.json({
        status: "fail",
        source: "platform",
        checks: [{
          label: "Configuration",
          status: "fail",
          detail: error instanceof Error ? error.message : "No MPGS credentials configured.",
        }],
      } satisfies ConfigCheckReport)
    }
    source = stored.mpgsMerchantId && stored.mpgsPassword ? "merchant" : "platform"
  }

  const checks = await checkMpgsConfig(config)
  return NextResponse.json({ status: summarise(checks), source, checks } satisfies ConfigCheckReport)
}
