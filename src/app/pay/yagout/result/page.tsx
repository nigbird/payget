import Image from "next/image"
import Link from "next/link"
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, History } from "lucide-react"

import { db, type Transaction } from "@/lib/db"

/**
 * Where the merchant lands after YagoutPay returns them.
 *
 * Yagout payments are raised from the merchant portal and paid on the spot in
 * the merchant's own browser, so this page speaks to the merchant, not to the
 * end customer, and sends them back into the portal.
 *
 * The query string is editable, so it only picks which transaction to show.
 * The status displayed is read from the database, where the return handler
 * recorded it from a payload it decrypted with the merchant's key.
 */

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Payment result · NibTera Merchant",
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Mirrors payment-error's guard: never echo arbitrary gateway input back. */
const SAFE_REFERENCE = /^[A-Za-z0-9_-]{1,64}$/

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

/** Enough of the account number to recognise it, not enough to reuse it. */
function maskAccount(account: string | null | undefined): string | null {
  const digits = account?.trim()
  if (!digits) return null
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`
}

type Outcome = "success" | "failed" | "pending"

function outcomeOf(tx: Transaction | null, hinted: string | null): Outcome {
  if (!tx) return hinted === "success" ? "pending" : "failed"
  if (tx.status === "success") return "success"
  if (tx.status === "failed") return "failed"
  return "pending"
}

const COPY: Record<Outcome, { title: string; body: string }> = {
  success: {
    title: "Payment received",
    body: "YagoutPay confirmed this payment and it has been recorded against your merchant account.",
  },
  failed: {
    title: "Payment not completed",
    body: "YagoutPay did not approve this payment, so nothing was collected. You can raise a new payment request from your dashboard.",
  },
  pending: {
    title: "Awaiting confirmation",
    body: "We have not received a final result from YagoutPay for this payment yet. Check its status in your transactions before handing over goods.",
  },
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-right text-sm text-[#5b371f] break-all ${mono ? "font-mono text-xs" : "font-semibold"}`}>
        {value}
      </dd>
    </div>
  )
}

export default async function YagoutResultPage({ searchParams }: PageProps) {
  const params = await searchParams
  const candidate = first(params.ref) ?? first(params.reference)
  const reference = candidate && SAFE_REFERENCE.test(candidate) ? candidate : null

  const tx = reference ? await db.getTransactionByReference(reference).catch(() => null) : null
  const merchant = tx ? await db.getMerchantByIdLean(tx.merchantId).catch(() => null) : null

  const outcome = outcomeOf(tx, first(params.status))
  const copy = COPY[outcome]

  const yagout = tx?.userCredentials?.yagout
  const currency = (typeof yagout?.gatewayCurrency === "string" && yagout.gatewayCurrency) || yagout?.currency || "ETB"

  // Which Yagout profile the money was collected under. A merchant with their
  // own me_id is settled by Yagout directly; everyone else is collected under
  // the platform's aggregator profile and paid out by the bank afterwards.
  const platformMeId = process.env.YAGOUTPAY_MERCHANT_ID?.trim()
  const txMeId = typeof yagout?.meId === "string" ? yagout.meId.trim() : null
  const viaPlatform = !txMeId || txMeId === platformMeId
  const settlement = viaPlatform
    ? "NibTera aggregator account"
    : `Your YagoutPay profile (${txMeId})`

  const icon =
    outcome === "success" ? (
      <CheckCircle2 className="h-10 w-10 text-emerald-600" />
    ) : outcome === "failed" ? (
      <AlertCircle className="h-10 w-10 text-rose-600" />
    ) : (
      <Clock className="h-10 w-10 text-amber-600" />
    )
  const iconBg =
    outcome === "success" ? "bg-emerald-100" : outcome === "failed" ? "bg-rose-100" : "bg-amber-100"

  const dashboardHref = tx ? `/merchant/${tx.merchantId}` : "/login"
  const transactionsHref = tx ? `/merchant/${tx.merchantId}/transactions` : null

  return (
    <main className="min-h-svh bg-gradient-to-b from-[#FFFDF7] to-amber-50/40 px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="flex items-center gap-3">
          <Image src="/niblogo.png" alt="" width={36} height={36} className="rounded-lg" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-800/60">
              Merchant portal
            </p>
            <p className="text-sm font-bold text-[#5b371f]">{merchant?.name ?? "NibTera Merchant"}</p>
          </div>
        </header>

        <section className="rounded-3xl border border-amber-200/40 bg-white/90 p-6 shadow-xl">
          <div className="text-center">
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${iconBg}`}>
              {icon}
            </div>
            <h1 className="pt-4 text-2xl font-bold tracking-tight text-[#5b371f]">{copy.title}</h1>
            <p className="pt-2 text-sm leading-relaxed text-slate-500">{copy.body}</p>
            {tx && (
              <p className="pt-4 text-3xl font-bold text-[#5b371f]">
                {tx.amount.toFixed(2)} <span className="text-base font-semibold text-amber-700">{currency}</span>
              </p>
            )}
          </div>

          {tx && (
            <dl className="mt-6 divide-y divide-amber-100 rounded-2xl border border-amber-100 bg-amber-50/30 px-4">
              <Row label="Merchant" value={merchant?.name ?? "—"} />
              {outcome === "success" && maskAccount(merchant?.accountNumber) && (
                <Row label="Merchant account" value={maskAccount(merchant?.accountNumber)!} />
              )}
              <Row label="Collected via" value={settlement} />
              {(tx.description || tx.serviceDescription) && (
                <Row label="Customer / note" value={tx.description || tx.serviceDescription} />
              )}
              {tx.payerPhone && <Row label="Customer phone" value={tx.payerPhone} />}
              {typeof yagout?.paymode === "string" && yagout.paymode && (
                <Row label="Payment mode" value={yagout.paymode} />
              )}
              {outcome === "failed" && yagout?.resMessage && (
                <Row label="Gateway message" value={yagout.resMessage} />
              )}
              <Row label="Reference" value={tx.transactionReference} mono />
              {yagout?.pgRef && <Row label="YagoutPay ref" value={yagout.pgRef} mono />}
            </dl>
          )}

          {!tx && reference && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Reference</p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-700">{reference}</p>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={dashboardHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-700 px-4 text-sm font-semibold text-white shadow-md hover:opacity-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          {transactionsHref && (
            <Link
              href={transactionsHref}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50"
            >
              <History className="h-4 w-4" />
              View transactions
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
