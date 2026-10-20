"use client"

import type { ReactNode } from "react"
import { Switch } from "@/components/ui/switch"

/**
 * Building blocks of the speaker screens: the Android app's layout in the
 * merchant portal's look (white background, cream cards, gold-to-brown buttons).
 */

/** The merchant portal's primary button. */
export const PRIMARY_BUTTON =
  "rounded-xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95 disabled:opacity-60"
/** The merchant portal's secondary (outline) button. */
export const OUTLINE_BUTTON = "rounded-xl border border-[#eddcc0] bg-white text-[#754319] hover:bg-[#fff8ea]"
/** Muted text, as in the portal. */
export const MUTED = "text-[#754319]/70"

export type Payment = {
  id: number
  type: "payment" | "test"
  amount: number
  currency: string
  payerName: string | null
  channel: string | null
  occurredAt: string
  /** When this phone received it (ms). */
  receivedAt: number
}

/** What the speaker shows; "offline" = no connection for 30 seconds. */
export type ConnectionState = "connecting" | "live" | "polling" | "reconnecting" | "offline"

export type Tone = "good" | "waiting" | "bad"

const TONE_TEXT: Record<Tone, string> = {
  good: "text-[#3E7D4F]",
  waiting: "text-[#B26A00]",
  bad: "text-[#C62828]",
}
const TONE_BG: Record<Tone, string> = {
  good: "bg-[#3E7D4F]/10",
  waiting: "bg-[#B26A00]/10",
  bad: "bg-[#C62828]/10",
}
const TONE_DOT: Record<Tone, string> = {
  good: "bg-[#3E7D4F]",
  waiting: "bg-[#B26A00]",
  bad: "bg-[#C62828]",
}

export function toneText(tone: Tone) {
  return TONE_TEXT[tone]
}
export function toneBg(tone: Tone) {
  return TONE_BG[tone]
}

export function connectionTone(state: ConnectionState): Tone {
  if (state === "live" || state === "polling") return "good"
  if (state === "offline") return "bad"
  return "waiting"
}

export function connectionLabel(state: ConnectionState) {
  switch (state) {
    case "live":
    case "polling":
      return "Online"
    case "offline":
      return "Offline"
    case "reconnecting":
      return "Reconnecting"
    default:
      return "Connecting"
  }
}

/** Full-height screen on the cream background, clear of the phone's notch and home bar. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-white text-[#5b371f] [padding-bottom:env(safe-area-inset-bottom)]">
      {children}
    </main>
  )
}

export function TopBar({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 [padding-top:env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
        {left}
        <h1 className={`flex-1 truncate text-lg font-bold text-white ${left ? "" : "pl-2"}`}>
          {title}
        </h1>
        {right}
      </div>
    </header>
  )
}

/** Portal card: white, or the cream gradient for highlights. */
export function NibCard({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode
  className?: string
  tone?: "default" | "gold" | "danger"
}) {
  const colors =
    tone === "gold"
      ? "border-[#f8b513]/30 bg-gradient-to-br from-[#fff9ef] to-[#fdf1d4]"
      : tone === "danger"
        ? "border-[#F5C6C0] bg-[#FDECEA] text-[#7A1C14]"
        : "border-[#eddcc0] bg-white"
  return <div className={`overflow-hidden rounded-2xl border shadow-sm ${colors} ${className}`}>{children}</div>
}

/** Small rounded label with a coloured dot, e.g. "● ONLINE". */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
    >
      <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
      {label.toUpperCase()}
    </span>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-bold text-[#5b371f]">{children}</h2>
}

export function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className={`text-xs font-medium ${MUTED}`}>{label}</p>
      <p className="break-words text-[15px]">{value || "—"}</p>
    </div>
  )
}

export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="flex-1">
        <span className="block text-[15px]">{title}</span>
        <span className={`block text-xs ${MUTED}`}>{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  )
}

export function formatAmount(amount: number, currency: string) {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
