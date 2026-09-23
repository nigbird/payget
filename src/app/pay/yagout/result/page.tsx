/**
 * Where a customer lands after YagoutPay returns them.
 *
 * The outcome shown here comes from the query string, which the customer can
 * edit — so this page is presentational only. The authoritative record was
 * written by the return handler before this redirect, from a payload it
 * decrypted with the merchant's key.
 */

export const dynamic = "force-dynamic"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Mirrors payment-error's guard: never echo arbitrary gateway input back. */
const SAFE_REFERENCE = /^[A-Za-z0-9_-]{1,64}$/

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

export default async function YagoutResultPage({ searchParams }: PageProps) {
  const params = await searchParams
  const succeeded = first(params.status) === "success"

  const candidate = first(params.ref)
  const reference = candidate && SAFE_REFERENCE.test(candidate) ? candidate : null

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFFDF7] px-4">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            succeeded ? "bg-emerald-100" : "bg-rose-100"
          }`}
        >
          <span className={`text-2xl ${succeeded ? "text-emerald-600" : "text-rose-600"}`}>
            {succeeded ? "✓" : "!"}
          </span>
        </div>

        <h1 className="pt-4 text-xl font-bold text-slate-900">
          {succeeded ? "Payment received" : "Payment not completed"}
        </h1>

        <p className="pt-2 text-sm text-slate-500">
          {succeeded
            ? "Thank you. Your payment has been recorded and the merchant has been notified."
            : "This payment was not completed. Nothing has been charged. Please contact the merchant if you need a new payment link."}
        </p>

        {reference && (
          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Reference
            </p>
            <p className="pt-1 font-mono text-sm text-slate-700">{reference}</p>
          </div>
        )}
      </div>
    </main>
  )
}
