"use client"

import { useState, type ReactNode } from "react"
import { BellOff, CloudOff, Inbox, Loader2, Settings, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  MUTED,
  NibCard,
  OUTLINE_BUTTON,
  Screen,
  StatusPill,
  TopBar,
  connectionLabel,
  connectionTone,
  formatAmount,
  formatTime,
  toneBg,
  toneText,
  type ConnectionState,
  type Payment,
  type Tone,
} from "./ui"

const PAGE_SIZE = 10

/**
 * Why background sound (the keep-alive track) isn't playing, in the user's terms:
 * - paused: from the phone's media controls
 * - interrupted: another app took the sound
 * - needs-tap: the browser wants a tap first
 * - unavailable: this device can't play it (a tap won't help; notifications still alert)
 */
export type BackgroundIssue = "paused" | "interrupted" | "needs-tap" | "unavailable"

const BACKGROUND_COPY: Record<BackgroundIssue, { title: string; detail: string; action?: string }> = {
  paused: { title: "Background sound is paused", detail: "Amounts may not be spoken while the screen is off.", action: "Resume" },
  interrupted: { title: "Another app is playing sound", detail: "Amounts may not be spoken while the screen is off.", action: "Resume" },
  "needs-tap": { title: "Background sound is off", detail: "Amounts may not be spoken while the screen is off.", action: "Turn on" },
  unavailable: { title: "Background sound isn't available", detail: "Notifications still alert you when the screen is off." },
}

/** Merchant, connection and readiness in one compact card. */
function StatusCard({
  merchantName,
  deviceName,
  connection,
  soundBlocked,
  soundDiagnosis,
  onTurnOnSound,
}: {
  merchantName: string
  deviceName: string
  connection: ConnectionState
  soundBlocked: boolean
  soundDiagnosis: string | null
  onTurnOnSound: () => void
}) {
  const live = connection === "live" || connection === "polling"
  let title = "Connecting…"
  let detail: string | null = "Getting ready to announce payments"
  let tone: Tone = connectionTone(connection)
  if (live && soundBlocked) {
    title = "Tap to turn on sound"
    detail = soundDiagnosis ?? "The browser needs one tap before it plays sound"
    tone = "waiting"
  } else if (live) {
    title = "Speaker is ready"
    detail = "Listening for payments"
  } else if (connection === "reconnecting") {
    title = "Reconnecting…"
    detail = "The connection dropped; trying again"
  } else if (connection === "offline") {
    title = "Offline"
    detail = "Check Wi-Fi or mobile data"
  }
  const Icon = connection === "offline" ? CloudOff : !live ? Loader2 : soundBlocked ? BellOff : Volume2

  const readiness = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneBg(tone)}`}>
        <Icon className={`h-[18px] w-[18px] ${toneText(tone)} ${!live && connection !== "offline" ? "animate-spin" : ""}`} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-[15px] font-semibold ${live && !soundBlocked ? "" : toneText(tone)}`}>{title}</span>
        {detail && <span className={`block truncate text-xs ${MUTED}`}>{detail}</span>}
      </span>
    </>
  )

  return (
    <NibCard>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {merchantName ? (
            <p className="truncate text-lg font-bold leading-tight">{merchantName}</p>
          ) : (
            <span className="block h-5 w-40 max-w-full animate-pulse rounded bg-[#eddcc0]/70" aria-label="Loading merchant" />
          )}
          {deviceName && <p className={`truncate text-xs ${MUTED}`}>{deviceName}</p>}
        </div>
        <StatusPill label={connectionLabel(connection)} tone={connectionTone(connection)} />
      </div>
      <div className="border-t border-[#eddcc0]/70">
        {/* The tap itself is what the browser needs before it plays sound. */}
        {live && soundBlocked ? (
          <button
            type="button"
            onClick={onTurnOnSound}
            className="flex w-full items-center gap-3 bg-[#B26A00]/5 px-4 py-2.5 hover:bg-[#B26A00]/10"
          >
            {readiness}
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-2.5">{readiness}</div>
        )}
      </div>
    </NibCard>
  )
}

function BackgroundNotice({ issue, onResume }: { issue: BackgroundIssue; onResume: () => void }) {
  const copy = BACKGROUND_COPY[issue]
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#B26A00]/25 bg-[#B26A00]/5 px-4 py-2.5">
      <BellOff className="h-[18px] w-[18px] shrink-0 text-[#B26A00]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className={`text-xs ${MUTED}`}>{copy.detail}</p>
      </div>
      {copy.action && (
        <Button size="sm" variant="outline" onClick={onResume} className={`h-8 shrink-0 px-3 ${OUTLINE_BUTTON}`}>
          {copy.action}
        </Button>
      )}
    </div>
  )
}

function LatestPayment({ payment }: { payment: Payment }) {
  const test = payment.type === "test"
  const from = [test ? null : payment.payerName, payment.channel].filter(Boolean).join(" · ")
  return (
    <NibCard tone="gold">
      {/* key: replays the entrance animation for each new payment */}
      <div key={payment.id} className="px-4 py-4 text-center animate-in fade-in zoom-in-95 duration-300 md:py-6">
        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#754319]">
          <Volume2 className="h-4 w-4" />
          {test ? "Test payment" : "Latest payment"}
          <span className={`font-normal normal-case tracking-normal ${MUTED}`}>· {formatTime(payment.receivedAt)}</span>
        </p>
        <p className="mt-1 break-words text-3xl font-bold tabular-nums md:text-4xl lg:text-5xl">
          {formatAmount(payment.amount, payment.currency)}
        </p>
        {from && <p className={`mt-1 truncate text-sm md:text-base ${MUTED}`}>{from}</p>}
      </div>
    </NibCard>
  )
}

function EmptyPayments() {
  return (
    <NibCard>
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#f8b513]/25 to-[#754319]/15">
          <Inbox className="h-6 w-6 text-[#754319]" />
        </span>
        <p className="mt-3 font-semibold">No payments yet today</p>
        <p className={`mt-1 text-sm ${MUTED}`}>New payments appear here and are announced.</p>
      </div>
    </NibCard>
  )
}

function PaymentHistory({ recent }: { recent: Payment[] }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  const paid = recent.filter((p) => p.type !== "test")
  const currency = paid[0]?.currency ?? "ETB"
  const total = paid.filter((p) => p.currency === currency).reduce((sum, p) => sum + p.amount, 0)

  return (
    <NibCard>
      <div className="flex items-baseline justify-between gap-3 border-b border-[#eddcc0]/70 px-4 py-3">
        <h3 className="text-sm font-bold">
          Today <span className={`font-normal ${MUTED}`}>· {recent.length}</span>
        </h3>
        {paid.length > 0 && (
          <p className="text-sm tabular-nums">
            <span className={MUTED}>Total </span>
            <span className="font-semibold">{formatAmount(total, currency)}</span>
          </p>
        )}
      </div>

      {/* Column headings on larger screens; phones show compact two-line rows. */}
      <div className={`hidden grid-cols-[4.5rem_minmax(0,1fr)_8rem_9rem] gap-4 border-b border-[#eddcc0]/70 px-4 py-2 text-xs font-medium md:grid ${MUTED}`}>
        <span>Time</span>
        <span>Payer</span>
        <span>Bank</span>
        <span className="text-right">Amount</span>
      </div>
      <ul className="divide-y divide-[#eddcc0]/70">
        {recent.slice(0, shown).map((payment) => {
          const test = payment.type === "test"
          const payer = test ? "Test payment" : payment.payerName
          return (
            <li
              key={payment.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:grid-cols-[4.5rem_minmax(0,1fr)_8rem_9rem] md:gap-4"
            >
              <span className={`whitespace-nowrap text-xs tabular-nums md:text-sm ${MUTED}`}>{formatTime(payment.receivedAt)}</span>
              <span className="min-w-0">
                {/* Phones: payer over bank, or the bank alone. Larger screens: payer column only. */}
                <span className="block truncate text-sm md:hidden">{payer || payment.channel || "Payment"}</span>
                {payer && payment.channel && <span className={`block truncate text-xs md:hidden ${MUTED}`}>{payment.channel}</span>}
                <span className="hidden truncate text-sm md:block">{payer || "—"}</span>
              </span>
              <span className={`hidden truncate text-sm md:block ${MUTED}`}>{payment.channel || "—"}</span>
              <span className="text-right text-[15px] font-semibold tabular-nums">
                {formatAmount(payment.amount, payment.currency)}
              </span>
            </li>
          )
        })}
      </ul>
      {recent.length > shown && (
        <div className="border-t border-[#eddcc0]/70 p-2">
          <Button variant="ghost" onClick={() => setShown((n) => n + PAGE_SIZE)} className="h-9 w-full text-[#754319] hover:bg-[#fff8ea]">
            Show more ({recent.length - shown})
          </Button>
        </div>
      )}
    </NibCard>
  )
}

export function StatusScreen({
  merchantName,
  deviceName,
  connection,
  soundBlocked,
  soundDiagnosis,
  onTurnOnSound,
  background,
  onResumeBackground,
  setupCard,
  recent,
  onOpenSettings,
}: {
  merchantName: string
  deviceName: string
  connection: ConnectionState
  soundBlocked: boolean
  soundDiagnosis: string | null
  onTurnOnSound: () => void
  background: BackgroundIssue | null
  onResumeBackground: () => void
  setupCard: ReactNode
  /** Today's announcements, newest first. */
  recent: Payment[]
  onOpenSettings: () => void
}) {
  return (
    <Screen>
      <TopBar
        title="Nibtera Speaker"
        right={
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <Settings className="h-5 w-5" />
          </Button>
        }
      />
      {/* Phone: one column. Desktop: a compact status column and the payments beside it. */}
      <div className="mx-auto max-w-xl px-4 pb-8 pt-3 md:max-w-2xl md:px-5 md:pt-5 lg:grid lg:max-w-6xl lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-6 lg:pt-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-[5.5rem]">
          <StatusCard
            merchantName={merchantName}
            deviceName={deviceName}
            connection={connection}
            soundBlocked={soundBlocked}
            soundDiagnosis={soundDiagnosis}
            onTurnOnSound={onTurnOnSound}
          />
          {background && !soundBlocked && <BackgroundNotice issue={background} onResume={onResumeBackground} />}
          {setupCard}
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:mt-0">
          {recent.length === 0 ? (
            <EmptyPayments />
          ) : (
            <>
              <LatestPayment payment={recent[0]} />
              <PaymentHistory recent={recent} />
            </>
          )}
        </div>
      </div>
    </Screen>
  )
}
