import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { withMerchantSecret } from "@/lib/merchant-secret"
import { requireCsrf } from "@/lib/request-security"
import {
  DEFAULT_YAGOUT_POST_URL,
  resolveYagoutConfigForMerchant,
  type YagoutConfig,
} from "@/lib/yagout-client"
import { YAGOUT_AGGREGATOR_ID } from "@/lib/yagout-request"
import { checkYagoutConfig, summarise, type ConfigCheckReport } from "@/lib/gateway-config-check"

/**
 * Tests YagoutPay credentials against Yagout without raising a payment.
 *
 * With an empty body it checks what this merchant's payments would actually use
 * (their own profile, or the platform fallback). With form values it checks
 * those before they are saved; a blank key reuses the stored one.
 */

const VerifySchema = z.object({
  yagoutMeId: z.string().trim().max(20).optional(),
  yagoutEncryptionKey: z.string().trim().max(200).optional(),
  yagoutPostUrl: z.string().trim().max(500).optional(),
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
  const stored = await db.getMerchantYagoutCredentials(id)
  if (!stored) return NextResponse.json({ error: "Merchant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = VerifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }
  const form = parsed.data

  let config: YagoutConfig
  let source: ConfigCheckReport["source"]

  if (form.yagoutMeId) {
    const encryptionKey =
      form.yagoutEncryptionKey ||
      (stored.yagoutEncryptionKey
        ? withMerchantSecret(stored.yagoutEncryptionKey, (plaintext) => plaintext)
        : "")
    if (!encryptionKey) {
      return NextResponse.json({
        status: "fail",
        source: "form",
        checks: [{ label: "Encryption key", status: "fail", detail: "Enter the encryption key to test these credentials." }],
      } satisfies ConfigCheckReport)
    }
    config = {
      aggregatorId: process.env.YAGOUTPAY_AGGREGATOR_ID?.trim() || YAGOUT_AGGREGATOR_ID,
      meId: form.yagoutMeId,
      encryptionKey,
      postUrl: form.yagoutPostUrl || process.env.YAGOUTPAY_POST_URL?.trim() || DEFAULT_YAGOUT_POST_URL,
    }
    source = "form"
  } else {
    try {
      config = await resolveYagoutConfigForMerchant(id)
    } catch (error) {
      return NextResponse.json({
        status: "fail",
        source: "platform",
        checks: [{
          label: "Configuration",
          status: "fail",
          detail: error instanceof Error ? error.message : "No YagoutPay credentials configured.",
        }],
      } satisfies ConfigCheckReport)
    }
    source = stored.yagoutMeId && stored.yagoutEncryptionKey ? "merchant" : "platform"
  }

  const checks = await checkYagoutConfig(config)
  return NextResponse.json({ status: summarise(checks), source, checks } satisfies ConfigCheckReport)
}
