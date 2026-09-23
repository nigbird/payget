import { resolveEncryptedToken } from "@/app/api/payments/_shared"
import { YagoutAutoSubmitForm } from "./auto-submit-form"

/**
 * Hands the customer off to YagoutPay.
 *
 * This page exists because Yagout will not accept a server-side REST call for
 * the hosted flow: the request has to arrive as a form POST from a browser on a
 * domain they have whitelisted. So rather than returning a gateway URL the way
 * the card rail does, we return a link to this page and let it do the posting.
 *
 * It is a server component so the signed form fields are read straight from the
 * transaction and never exposed through a JSON endpoint.
 */

export const dynamic = "force-dynamic"

type PageProps = { params: Promise<{ token: string }> }

function Shell({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFFDF7] px-4">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="pt-2 text-sm text-slate-500">{message}</p>
      </div>
    </main>
  )
}

export default async function YagoutHandoffPage({ params }: PageProps) {
  const { token } = await params

  const resolved = await resolveEncryptedToken(token)
  if (!resolved.ok) {
    return <Shell title="This payment link cannot be used" message={resolved.error} />
  }

  const { tx, merchant } = resolved
  const yagout = tx.userCredentials?.yagout

  if (tx.paymentMethod !== "YAGOUT") {
    return (
      <Shell
        title="Wrong payment type"
        message="This link was not raised as a YagoutPay payment."
      />
    )
  }

  // Built when the payment was raised and stored verbatim. Rebuilding here
  // could produce a different hash, and only the stored pair is the one Yagout
  // will accept for this order.
  if (!yagout?.merchantRequest || !yagout?.hash || !yagout?.meId || !yagout?.postUrl) {
    return (
      <Shell
        title="This payment is not ready"
        message="The gateway request for this payment is missing. Please ask the merchant to send a new payment link."
      />
    )
  }

  const amount = typeof yagout.amount === "string" ? yagout.amount : tx.amount.toFixed(2)
  const currency = typeof yagout.currency === "string" ? yagout.currency : "ETB"

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFFDF7] px-4">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
        <div className="pb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {merchant?.name ?? "Payment"}
          </p>
          <p className="pt-2 text-3xl font-bold text-slate-900">
            {amount} {currency}
          </p>
          {tx.serviceDescription && (
            <p className="pt-1 text-sm text-slate-500">{tx.serviceDescription}</p>
          )}
          <p className="pt-4 text-sm text-slate-500">
            Taking you to YagoutPay to complete this payment securely.
          </p>
        </div>

        <YagoutAutoSubmitForm
          postUrl={String(yagout.postUrl)}
          meId={String(yagout.meId)}
          merchantRequest={String(yagout.merchantRequest)}
          hash={String(yagout.hash)}
        />

        <p className="pt-4 text-center text-[11px] text-slate-400">
          Do not close this window until the payment completes.
        </p>
      </div>
    </main>
  )
}
