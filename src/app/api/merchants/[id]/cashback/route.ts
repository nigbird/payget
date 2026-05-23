import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { validateAccountNumberField } from "@/lib/account-number"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { getOrCreateCashbackConfig, mapConfigToDto } from "@/lib/cashback/service"
import { validateCashbackConfigBody } from "@/lib/cashback/validation"
import { writeAuditLog } from "@/lib/audit-log"
type CashbackMode = "ALL_CUSTOMERS" | "CATEGORY_ELIGIBLE"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { error } = await requireMerchantCashbackAccess(request, id)
    if (error) return error

    const config = await getOrCreateCashbackConfig(id)
    return NextResponse.json(mapConfigToDto(config))
  } catch (e) {
    console.error("Failed to load cashback config:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id } = await params
    const { user, error } = await requireMerchantCashbackAccess(request, id)
    if (error) return error

    const body = await request.json()
    const validationErrors: Record<string, string> = {}

    let subsidiaryAccountNumber: string | null | undefined = undefined
    if (body.subsidiaryAccountNumber !== undefined) {
      if (body.subsidiaryAccountNumber === null || body.subsidiaryAccountNumber === "") {
        subsidiaryAccountNumber = null
      } else {
        subsidiaryAccountNumber = validateAccountNumberField(
          body.subsidiaryAccountNumber,
          validationErrors,
          { required: true }
        )
      }
    }

    const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined
    const mode = body.mode === "ALL_CUSTOMERS" || body.mode === "CATEGORY_ELIGIBLE" ? body.mode : undefined
    const configErrors = validateCashbackConfigBody(body, Boolean(enabled && mode === "ALL_CUSTOMERS"))
    Object.assign(validationErrors, configErrors)

    if (Object.keys(validationErrors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors: validationErrors }, { status: 400 })
    }

    const config = await getOrCreateCashbackConfig(id)

    const updated = await prisma.merchantCashbackConfig.update({
      where: { id: config.id },
      data: {
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        mode:
          body.mode === "ALL_CUSTOMERS" || body.mode === "CATEGORY_ELIGIBLE"
            ? (body.mode as CashbackMode)
            : undefined,
        subsidiaryAccountNumber,
        allCustomersPercent: parseOptionalNumber(body.allCustomersPercent),
        allCustomersMinAmount: parseOptionalNumber(body.allCustomersMinAmount),
        allCustomersMaxAmount: parseOptionalNumber(body.allCustomersMaxAmount),
      },
      include: {
        categories: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: { _count: { select: { eligibleCustomers: true } } },
        },
      },
    })

    await writeAuditLog({
      request,
      userId: user!.id,
      action: "CASHBACK_CONFIG_UPDATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: body,
    })

    return NextResponse.json(mapConfigToDto(updated))
  } catch (e) {
    console.error("Failed to update cashback config:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
