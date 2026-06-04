import { prisma } from "@/lib/prisma"
import type { CashbackMode } from "@prisma/client"
import { CashbackProcessingStatus } from "@prisma/client"
import type {
  CashbackCategoryDto,
  CashbackConfigDto,
  CashbackEligibleCustomerDto,
  CashbackLogDto,
  CashbackTransactionDto,
} from "./types"

export async function getOrCreateCashbackConfig(merchantId: string) {
  const existing = await prisma.merchantCashbackConfig.findUnique({
    where: { merchantId },
    include: {
      categories: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { eligibleCustomers: true } } },
      },
    },
  })

  if (existing) return existing

  return prisma.merchantCashbackConfig.create({
    data: { merchantId },
    include: {
      categories: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { eligibleCustomers: true } } },
      },
    },
  })
}

export function mapConfigToDto(config: Awaited<ReturnType<typeof getOrCreateCashbackConfig>>): CashbackConfigDto {
  return {
    id: config.id,
    merchantId: config.merchantId,
    enabled: config.enabled,
    mode: config.mode,
    subsidiaryAccountNumber: config.subsidiaryAccountNumber,
    allCustomersPercent: config.allCustomersPercent,
    allCustomersMinAmount: config.allCustomersMinAmount,
    allCustomersMaxAmount: config.allCustomersMaxAmount,
    categories: config.categories.map(
      (c): CashbackCategoryDto => ({
        id: c.id,
        name: c.name,
        description: c.description,
        percent: c.percent,
        minTransactionAmount: c.minTransactionAmount,
        maxTransactionAmount: c.maxTransactionAmount,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        eligibleCount: c._count.eligibleCustomers,
      })
    ),
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

export async function appendCashbackLog(
  cashbackTransactionId: string,
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  metadata?: unknown
) {
  return prisma.cashbackProcessingLog.create({
    data: {
      cashbackTransactionId,
      level,
      message,
      metadata: metadata ?? undefined,
    },
  })
}

export async function listCashbackTransactions(
  merchantId: string,
  options?: { limit?: number; status?: string; offset?: number }
): Promise<{ transactions: CashbackTransactionDto[]; total: number }> {
  const where = {
    merchantId,
    ...(options?.status 
      ? { status: options.status as CashbackProcessingStatus } 
      : { NOT: { status: CashbackProcessingStatus.SKIPPED } }
    ),
  }
  
  const [rows, total] = await Promise.all([
    prisma.cashbackTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: { category: { select: { name: true } } },
    }),
    prisma.cashbackTransaction.count({ where }),
  ])

  const transactions = rows.map((r) => ({
    id: r.id,
    paymentTransactionId: r.paymentTransactionId,
    customerPhone: r.customerPhone,
    customerAccount: r.customerAccount,
    paymentAmount: r.paymentAmount,
    cashbackAmount: r.cashbackAmount,
    cashbackPercent: r.cashbackPercent,
    status: r.status,
    skipReason: r.skipReason,
    failureReason: r.failureReason,
    categoryName: r.category?.name ?? null,
    providerDebitRef: r.providerDebitRef,
    providerCreditRef: r.providerCreditRef,
    processedAt: r.processedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
  
  return { transactions, total }
}

export async function listCashbackLogs(cashbackTransactionId: string, merchantId: string): Promise<CashbackLogDto[]> {
  const tx = await prisma.cashbackTransaction.findFirst({
    where: { id: cashbackTransactionId, merchantId },
  })
  if (!tx) return []

  const logs = await prisma.cashbackProcessingLog.findMany({
    where: { cashbackTransactionId },
    orderBy: { createdAt: "asc" },
  })

  return logs.map((l) => ({
    id: l.id,
    level: l.level,
    message: l.message,
    metadata: l.metadata,
    createdAt: l.createdAt.toISOString(),
  }))
}

export async function listEligibleCustomers(
  merchantId: string,
  options?: { categoryId?: string; search?: string; limit?: number }
): Promise<CashbackEligibleCustomerDto[]> {
  const rows = await prisma.cashbackEligibleCustomer.findMany({
    where: {
      merchantId,
      ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options?.search
        ? {
            OR: [
              { phone: { contains: options.search } },
              { accountNumber: { contains: options.search.replace(/\D/g, "") } },
            ],
          }
        : {}),
    },
    orderBy: { importedAt: "desc" },
    take: options?.limit ?? 200,
    include: { category: { select: { name: true } } },
  })

  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    accountNumber: r.accountNumber,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    importedAt: r.importedAt.toISOString(),
  }))
}

export type UpdateCashbackConfigInput = {
  enabled?: boolean
  mode?: CashbackMode
  subsidiaryAccountNumber?: string | null
  allCustomersPercent?: number | null
  allCustomersMinAmount?: number | null
  allCustomersMaxAmount?: number | null
}
