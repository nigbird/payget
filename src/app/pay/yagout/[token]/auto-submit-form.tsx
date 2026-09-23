"use client"

import { useEffect, useRef, useState } from "react"

type Props = {
  postUrl: string
  meId: string
  merchantRequest: string
  hash: string
}

/**
 * Posts the customer into YagoutPay.
 *
 * Yagout accepts the hosted flow only as a real browser form POST from a
 * whitelisted domain — never a REST call — so this submit has to happen in the
 * customer's browser rather than on our server.
 *
 * The button is not a fallback detail: if the automatic submit is blocked, or
 * the customer comes back to this page with the bfcache, they still have a way
 * forward rather than a page that appears to have stalled.
 */
export function YagoutAutoSubmitForm({ postUrl, meId, merchantRequest, hash }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    formRef.current?.submit()

    // If we are still here a few seconds later the submit did not take, so
    // stop showing "redirecting" and let the customer act.
    const timer = setTimeout(() => setStalled(true), 5000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <form
      ref={formRef}
      method="POST"
      action={postUrl}
      encType="application/x-www-form-urlencoded"
    >
      <input type="hidden" name="me_id" value={meId} />
      <input type="hidden" name="merchant_request" value={merchantRequest} />
      <input type="hidden" name="hash" value={hash} />

      <button
        type="submit"
        className="w-full rounded-xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] px-6 py-3 font-semibold text-white shadow-sm transition-all hover:shadow-md"
      >
        {stalled ? "Continue to payment" : "Continue"}
      </button>

      {stalled && (
        <p className="pt-3 text-center text-xs text-slate-500">
          Not redirected automatically? Use the button above.
        </p>
      )}
    </form>
  )
}
