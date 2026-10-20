"use client"

import type { ReactNode } from "react"
import { BellOff, CloudOff, Settings, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  NibCard,
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

/** One line telling the merchant whether payments will be heard right now. */
function Readiness({ connection, soundBlocked }: { connection: ConnectionState; soundBlocked: boolean }) {
  let title: string
  let detail: string
  let tone: Tone = connectionTone(connection)
  switch (connection) {
    case "live":
    case "polling":
      if (soundBlocked) {
        title = "Tap anywhere to turn on sound"
        detail = "Connected, but the browser needs one tap before it plays sound"
        tone = "waiting"
      } else {
        title = "Speaker is ready"
        detail = "Connected and listening for payments"
      }
      break
    case "reconnecting":
      title = "Reconnecting…"
      detail = "The connection dropped; trying again"
      break
    case "offline":
      title = "Speaker is offline"
      detail = "Payments won't be announced until the connection is back. It reconnects by itself; check Wi-Fi or mobile data."
      break
    default:
      title = "Connecting…"
      detail = "Getting ready to announce payments"
  }
  const Icon = connection === "offline" ? CloudOff : soundBlocked ? BellOff : Volume2
  return (
    <div className="flex items-center gap-3.5 px-1">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneBg(tone)}`}>
        <Icon className={`h-[22px] w-[22px] ${toneText(tone)}`} />
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm text-[#8A7565]">{detail}</p>
      </div>
    </div>
  )
}

function LatestAnnouncement({ payment, merchantName }: { payment: Payment; merchantName: string }) {
  const test = payment.type === "test"
  return (
    <NibCard>
      {/* key: replays the entrance animation for each new payment */}
      <div
        key={payment.id}
        className="flex flex-col items-center bg-gradient-to-b from-[#FCEBC0] to-white px-4 py-5 text-center animate-in fade-in zoom-in-95 duration-300"
      >
        <p className="text-[11px] font-semibold tracking-wider text-[#8A7565]">LATEST ANNOUNCEMENT</p>
        <p className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-[#754319]">
          <Volume2 className="h-[18px] w-[18px]" />
          {test ? "Test payment" : "Payment received"}
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{formatAmount(payment.amount, payment.currency)}</p>
        {payment.payerName && !test && <p className="mt-1 text-base">from {payment.payerName}</p>}
        <p className="mt-1.5 text-xs text-[#8A7565]">
          {[merchantName, formatTime(payment.receivedAt)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </NibCard>
  )
}

function RecentList({ recent }: { recent: Payment[] }) {
  return (
    <NibCard>
      {recent.length === 0 ? (
        <div className="px-6 py-6 text-center">
          <p className="text-sm font-semibold">Waiting for payments…</p>
          <p className="mt-1 text-xs text-[#8A7565]">Use the Test button in the merchant portal to check the sound.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#EDE2CF]">
          {recent.map((payment) => {
            const test = payment.type === "test"
            const details = [test ? null : payment.payerName, payment.channel].filter(Boolean).join(" · ")
            return (
              <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm tabular-nums text-[#8A7565]">{formatTime(payment.receivedAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{test ? "Test" : "Payment"}</span>
                  {details && <span className="block truncate text-xs text-[#8A7565]">{details}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatAmount(payment.amount, payment.currency)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </NibCard>
  )
}

export function StatusScreen({
  merchantName,
  deviceName,
  host,
  connection,
  soundBlocked,
  backgroundPaused,
  onResumeBackground,
  setupCard,
  recent,
  onOpenSettings,
}: {
  merchantName: string
  deviceName: string
  host: string
  connection: ConnectionState
  soundBlocked: boolean
  /** The keep-alive track was paused (by the user, or another app took the sound). */
  backgroundPaused: "paused" | "interrupted" | null
  onResumeBackground: () => void
  setupCard: ReactNode
  recent: Payment[]
  onOpenSettings: () => void
}) {
  return (
    <Screen>
      <TopBar
        title="Nibtera Speaker"
        right={
          <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings" className="text-[#8A7565]">
            <Settings className="h-5 w-5" />
          </Button>
        }
      />
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-10">
        <NibCard>
          <div className="flex flex-col items-center px-4 py-[22px] text-center">
            <StatusPill label={connectionLabel(connection)} tone={connectionTone(connection)} />
            {connection === "polling" && <p className="mt-1.5 text-[11px] text-[#8A7565]">Compatibility mode</p>}
            <p className="mt-3.5 text-2xl font-semibold">{merchantName || "Paired"}</p>
            {deviceName && <p className="text-base text-[#8A7565]">{deviceName}</p>}
            <p className="mt-1.5 text-xs text-[#8A7565]/75">{host}</p>
          </div>
        </NibCard>

        <Readiness connection={connection} soundBlocked={soundBlocked} />

        {backgroundPaused && !soundBlocked && (
          <button
            type="button"
            onClick={onResumeBackground}
            className="flex items-center gap-3 rounded-2xl bg-[#B26A00] px-4 py-3 text-left text-sm font-semibold text-white"
          >
            <BellOff className="h-5 w-5 shrink-0" />
            {backgroundPaused === "interrupted"
              ? "Another app is using the sound. With the screen off, payments may only show as notifications. Tap to resume."
              : "Background mode is paused. With the screen off, payments may only show as notifications. Tap to resume."}
          </button>
        )}

        {setupCard}

        {recent[0] && <LatestAnnouncement payment={recent[0]} merchantName={merchantName} />}

        <h3 className="mt-1 text-sm font-semibold">Recent announcements</h3>
        <RecentList recent={recent} />
      </div>
    </Screen>
  )
}
