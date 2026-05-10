"use client"

import { Loader2 } from "lucide-react"

type SigningInOverlayProps = {
  message?: string
  subMessage?: string
}

/**
 * Full-screen translucent overlay shown while credentials succeed and navigation runs.
 */
export function SigningInOverlay({
  message = "Signing you in…",
  subMessage = "Securing your session",
}: SigningInOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-[#754319]/20 backdrop-blur-md animate-in fade-in duration-300"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 flex min-w-[min(90vw,20rem)] max-w-md flex-col items-center gap-5 rounded-2xl border border-white/35 bg-white/75 px-10 py-9 shadow-2xl shadow-black/15 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[#f8b513]/40 to-[#754319]/30 animate-pulse" />
          <Loader2 className="relative h-9 w-9 text-[#754319] animate-spin" aria-hidden />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-lg font-semibold tracking-tight text-[#1f2937]">{message}</p>
          <p className="text-sm text-[#6b7280]">{subMessage}</p>
        </div>
        <div className="h-1 w-full max-w-[10rem] overflow-hidden rounded-full bg-[#f4db9f]/80">
          <div className="mx-auto h-full w-4/5 rounded-full bg-gradient-to-r from-[#f8b513] via-[#c9a24a] to-[#754319] animate-pulse" />
        </div>
      </div>
    </div>
  )
}
