"use client"

import { useState, type ReactNode } from "react"
import { BellOff, CloudOff, Settings, Volume2 } from "lucide-react"
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

/** One line telling the merchant whether payments will be heard right now. */
function Readiness({
  connection,
  soundBlocked,
  soundDiagnosis,
  onTurnOnSound,
}: {
  connection: ConnectionState
  soundBlocked: boolean
  /** Shown under the prompt once a tap didn't help, so a screenshot says why. */
  soundDiagnosis: string | null
  onTurnOnSound: () => void
}) {
  const live = connection === "live" || connection === "polling"
  let title = "Connecting…"
  let detail: string | null = null
  let tone: Tone = connectionTone(connection)
  if (live && soundBlocked) {
    title = "Tap here to turn on sound"
    detail = soundDiagnosis
    tone = "waiting"
  } else if (live) {
    title = "Speaker is ready"
    detail = "Listening for payments"
  } else if (connection === "reconnecting") {
    title = "Reconnecting…"
  } else if (connection === "offline") {
    title = "Offline"
    detail = "Check Wi-Fi or mobile data"
  }
  const Icon = connection === "offline" ? CloudOff : soundBlocked ? BellOff : Volume2

  const body = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneBg(tone)}`}>
        <Icon className={`h-[22px] w-[22px] ${toneText(tone)}`} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-base font-semibold">{title}</span>
        {detail && <span className={`block text-sm ${MUTED}`}>{detail}</span>}
      </span>
    </>
  )
  // The tap itself is what the browser needs before it plays sound.
  return live && soundBlocked ? (
    <button
      type="button"
      onClick={onTurnOnSound}
      className="flex items-center gap-3.5 rounded-2xl border border-[#B26A00]/30 bg-[#B26A00]/5 px-3 py-2.5"
    >
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3.5 px-1">{body}</div>
  )
}

function LatestAnnouncement({ payment }: { payment: Payment }) {
  const test = payment.type === "test"
  return (
    <NibCard tone="gold">
      {/* key: replays the entrance animation for each new payment */}
      <div
        key={payment.id}
        className="flex flex-col items-center px-4 py-5 text-center animate-in fade-in zoom-in-95 duration-300"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[#754319]">
          <Volume2 className="h-[18px] w-[18px]" />
          {test ? "Test payment" : "Payment received"}
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{formatAmount(payment.amount, payment.currency)}</p>
        {payment.payerName && !test && <p className="mt-1 text-base">from {payment.payerName}</p>}
        <p className={`mt-1.5 text-xs ${MUTED}`}>{formatTime(payment.receivedAt)}</p>
      </div>
    </NibCard>
  )
}

function RecentList({ recent }: { recent: Payment[] }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  if (recent.length === 0) {
    return (
      <NibCard>
        <p className={`px-6 py-6 text-center text-sm ${MUTED}`}>Waiting for payments…</p>
      </NibCard>
    )
  }
  return (
    <>
      <NibCard>
        <ul className="divide-y divide-[#eddcc0]/70">
          {recent.slice(0, shown).map((payment) => {
            const test = payment.type === "test"
            const details = [test ? "Test" : payment.payerName, payment.channel].filter(Boolean).join(" · ")
            return (
              <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`shrink-0 whitespace-nowrap text-sm tabular-nums ${MUTED}`}>
                  {formatTime(payment.receivedAt)}
                </span>
                <span className={`min-w-0 flex-1 truncate text-sm ${MUTED}`}>{details}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatAmount(payment.amount, payment.currency)}
                </span>
              </li>
            )
          })}
        </ul>
      </NibCard>
      {recent.length > shown && (
        <Button variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)} className={`h-10 ${OUTLINE_BUTTON}`}>
          Show more ({recent.length - shown})
        </Button>
      )}
    </>
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
  backgroundError,
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
  /** The keep-alive track isn't playing: paused by the user, taken by another app, or refused. */
  background: "paused" | "interrupted" | "blocked" | null
  backgroundError: string | null
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
          <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings" className="text-white hover:bg-white/15 hover:text-white">
            <Settings className="h-5 w-5" />
          </Button>
        }
      />
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-10 pt-4">
        <NibCard>
          <div className="flex flex-col items-center px-4 py-5 text-center">
            <StatusPill label={connectionLabel(connection)} tone={connectionTone(connection)} />
            <p className="mt-3 text-2xl font-bold">{merchantName || "Paired"}</p>
            {deviceName && <p className={`text-sm ${MUTED}`}>{deviceName}</p>}
          </div>
        </NibCard>

        <Readiness
          connection={connection}
          soundBlocked={soundBlocked}
          soundDiagnosis={soundDiagnosis}
          onTurnOnSound={onTurnOnSound}
        />

        {background && !soundBlocked && (
          <button
            type="button"
            onClick={onResumeBackground}
            className="flex items-center gap-3 rounded-2xl border border-[#B26A00]/30 bg-[#B26A00]/5 px-4 py-3 text-left text-sm"
          >
            <BellOff className="h-5 w-5 shrink-0 text-[#B26A00]" />
            <span>
              <span className="block font-semibold">
                {background === "interrupted" ? "Another app is using the sound" : "Background mode is off"}
              </span>
              <span className={`block text-xs ${MUTED}`}>
                Tap to turn it on{backgroundError ? ` · ${backgroundError}` : ""}
              </span>
            </span>
          </button>
        )}

        {setupCard}

        {recent[0] && <LatestAnnouncement payment={recent[0]} />}

        <h3 className="mt-1 text-sm font-bold">
          Today{recent.length > 0 && <span className={`font-normal ${MUTED}`}> · {recent.length}</span>}
        </h3>
        <RecentList recent={recent} />
      </div>
    </Screen>
  )
}
