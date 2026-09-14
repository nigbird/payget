import Link from "next/link"
import { AlertCircle, RefreshCcw, ShieldCheck } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export const metadata = {
  title: "Payment not completed",
}

/** Query keys the gateway may append when redirecting to the error URL. */
const REFERENCE_KEYS = ["orderId", "order", "reference", "id"] as const

/** Only surface a reference that looks like a gateway id — never echo arbitrary input. */
function extractReference(params: Record<string, string | string[] | undefined>): string | null {
  for (const key of REFERENCE_KEYS) {
    const raw = params[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)) {
      return value
    }
  }
  return null
}

export default async function PaymentErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const reference = extractReference(params)

  return (
    <main className="min-h-svh bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-rose-600" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[#5b371f] tracking-tight">
              Payment not completed
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Your payment could not be processed, so you have not been charged.
            </p>
          </div>
        </div>

        <Card className="rounded-3xl border-amber-200/30 bg-white/80 shadow-xl backdrop-blur-sm">
          <CardContent className="p-5 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-800/60 mb-2">
                What you can do
              </p>
              <ul className="space-y-2.5">
                <li className="flex gap-2.5">
                  <RefreshCcw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Open the payment link again and retry. Links allow a limited number of
                    attempts before they expire.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Check that your card details are correct and that your card is enabled for
                    online payments.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    If the problem continues, contact the business you were paying and quote the
                    reference below.
                  </span>
                </li>
              </ul>
            </div>

            {reference && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Reference
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-700 break-all">{reference}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-slate-400 leading-relaxed">
          If money was debited from your account, it will be released automatically by your bank.
          <br />
          <Link href="/" className="text-amber-700 font-semibold hover:underline">
            Return to homepage
          </Link>
        </p>
      </div>
    </main>
  )
}
