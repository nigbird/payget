"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Loader2, Volume2, VolumeX, Wifi, WifiOff, BellRing, Unplug } from "lucide-react"
import { Button } from "@/components/ui/button"
import { announcePayment, currentVoiceSource, unlockAudio, type VoiceSource } from "@/lib/payment-announcer"

/**
 * Counter speaker: a phone, tablet or PC left on at the till that announces
 * every payment the merchant receives. Paired from the merchant portal
 * (Configuration → Sound Devices), which opens /speaker#t=<device token>.
 * The token lives in this browser's localStorage and is independent of any
 * merchant login, so the page keeps working through session timeouts.
 */

const TOKEN_STORAGE_KEY = "nibtera.soundDeviceToken"
const SPEECH_STORAGE_KEY = "nibtera.soundDeviceSpeech"
const MAX_BACKOFF_MS = 30 * 1000
const RECENT_LIMIT = 20

type StreamPayment = {
  id: number
  type: "payment" | "test"
  amount: number
  currency: string
  payerName: string | null
  channel: string | null
  occurredAt: string
}

type ConnectionState = "connecting" | "live" | "reconnecting" | "unpaired"

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode / storage blocked — the page still works for this visit
  }
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export default function SpeakerPage() {
  const [token, setToken] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [started, setStarted] = useState(false)
  const [speech, setSpeech] = useState(true)
  const [connection, setConnection] = useState<ConnectionState>("connecting")
  const [info, setInfo] = useState<{ deviceName: string; merchantName: string } | null>(null)
  const [recent, setRecent] = useState<StreamPayment[]>([])
  const [flash, setFlash] = useState<StreamPayment | null>(null)
  const [voiceSource, setVoiceSource] = useState<VoiceSource | null>(null)

  const speechRef = useRef(speech)
  speechRef.current = speech

  // Pick up a fresh pairing from the link's #fragment (never sent to the
  // server or written to access logs), then drop it from the address bar.
  useEffect(() => {
    const match = window.location.hash.match(/[#&]t=([^&]+)/)
    if (match) {
      const fresh = decodeURIComponent(match[1])
      writeStorage(TOKEN_STORAGE_KEY, fresh)
      history.replaceState(null, "", window.location.pathname)
    }
    setToken(readStorage(TOKEN_STORAGE_KEY))
    setSpeech(readStorage(SPEECH_STORAGE_KEY) !== "off")
    setLoaded(true)
  }, [])

  const unpair = useCallback(() => {
    writeStorage(TOKEN_STORAGE_KEY, null)
    setToken(null)
    setStarted(false)
    setConnection("unpaired")
  }, [])

  const handlePayment = useCallback((payment: StreamPayment) => {
    setRecent((prev) =>
      prev.some((p) => p.id === payment.id) ? prev : [payment, ...prev].slice(0, RECENT_LIMIT)
    )
    setFlash(payment)
    void announcePayment(payment.amount, payment.currency, { speech: speechRef.current })
  }, [])

  // The stream. fetch() rather than EventSource because EventSource can't send
  // an Authorization header, and the token must not go in the URL.
  useEffect(() => {
    if (!started || !token) return

    let stopped = false
    let controller: AbortController | null = null
    let lastEventId = 0
    let attempt = 0
    const seen = new Set<number>()

    const run = async () => {
      while (!stopped) {
        controller = new AbortController()
        setConnection(attempt === 0 ? "connecting" : "reconnecting")
        try {
          const res = await fetch("/api/devices/payment-stream", {
            headers: {
              Authorization: `Bearer ${token}`,
              ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {}),
            },
            cache: "no-store",
            signal: controller.signal,
          })
          if (res.status === 401) {
            unpair()
            return
          }
          if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`)

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          while (!stopped) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            let boundary: number
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
              const raw = buffer.slice(0, boundary)
              buffer = buffer.slice(boundary + 2)

              let event = "message"
              let data = ""
              let id: number | null = null
              for (const line of raw.split("\n")) {
                if (line.startsWith("event:")) event = line.slice(6).trim()
                else if (line.startsWith("data:")) data += line.slice(5).trim()
                else if (line.startsWith("id:")) id = Number(line.slice(3).trim())
              }

              if (event === "ready") {
                attempt = 0
                setConnection("live")
                try {
                  setInfo(JSON.parse(data))
                } catch {}
              } else if (event === "revoked") {
                unpair()
                return
              } else if ((event === "payment" || event === "test") && id !== null) {
                lastEventId = Math.max(lastEventId, id)
                if (seen.has(id)) continue
                seen.add(id)
                try {
                  handlePayment(JSON.parse(data))
                } catch {}
              }
            }
          }
        } catch {
          if (stopped) return
        }
        if (stopped) return

        attempt += 1
        setConnection("reconnecting")
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), MAX_BACKOFF_MS)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    void run()
    // A phone waking from sleep often holds a dead socket; reconnect right away.
    const onOnline = () => controller?.abort()
    window.addEventListener("online", onOnline)
    return () => {
      stopped = true
      controller?.abort()
      window.removeEventListener("online", onOnline)
    }
  }, [started, token, unpair, handlePayment])

  // Keep the screen (and therefore the page) awake while running.
  useEffect(() => {
    if (!started || !("wakeLock" in navigator)) return
    let lock: any = null
    const acquire = async () => {
      try {
        lock = await (navigator as any).wakeLock.request("screen")
      } catch {
        // denied (battery saver etc.) — the stream still works while the screen is on
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      void lock?.release?.()
    }
  }, [started])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 6000)
    return () => clearTimeout(t)
  }, [flash])

  const start = () => {
    unlockAudio()
    setStarted(true)
    void currentVoiceSource().then(setVoiceSource)
  }

  const toggleSpeech = () => {
    const next = !speech
    setSpeech(next)
    writeStorage(SPEECH_STORAGE_KEY, next ? "on" : "off")
  }

  if (!loaded) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#fdf7ea]">
        <Loader2 className="h-8 w-8 animate-spin text-[#754319]" />
      </main>
    )
  }

  if (!token) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#fdf7ea] px-6 text-center">
        <Unplug className="h-12 w-12 text-[#754319]" />
        <h1 className="text-2xl font-bold text-[#5b371f]">This device isn&apos;t paired</h1>
        <p className="max-w-md text-[#754319]/80">
          In the merchant portal, go to <strong>Configuration → Sound Devices</strong>, add a device, and open its
          pairing link or scan its QR code on this device.
        </p>
      </main>
    )
  }

  if (!started) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#fdf7ea] px-6 text-center">
        <Image src="/niblogo.png" alt="" width={72} height={72} />
        <h1 className="text-2xl font-bold text-[#5b371f]">Payment speaker</h1>
        <p className="max-w-md text-[#754319]/80">
          Tap start to begin announcing payments. Keep this page open and the volume up.
        </p>
        <Button
          size="lg"
          onClick={start}
          className="h-16 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] px-10 text-lg font-semibold text-white"
        >
          <Volume2 className="mr-2 h-6 w-6" /> Start speaker
        </Button>
      </main>
    )
  }

  const statusLabel =
    connection === "live" ? "Listening" : connection === "connecting" ? "Connecting…" : "Reconnecting…"

  return (
    <main className="flex min-h-dvh flex-col bg-[#fdf7ea]">
      <header className="flex items-center justify-between gap-3 border-b border-[#754319]/10 bg-white/70 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#5b371f]">{info?.merchantName ?? "Payment speaker"}</p>
          <p className="truncate text-xs text-[#754319]/70">
            {info?.deviceName}
            {voiceSource && (voiceSource === "recorded" ? " · Recorded Amharic voice" : " · Device voice")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              connection === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {connection === "live" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {statusLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleSpeech}
            title={speech ? "Chime and voice" : "Chime only"}
            aria-label={speech ? "Switch to chime only" : "Switch to chime and voice"}
          >
            {speech ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        {flash ? (
          <div className="animate-in zoom-in-95 fade-in duration-300">
            <BellRing className="mx-auto mb-4 h-14 w-14 text-emerald-600" />
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {flash.type === "test" ? "Test announcement" : "Payment received"}
            </p>
            <p className="mt-2 text-5xl font-bold tabular-nums text-[#5b371f] sm:text-6xl">
              {formatAmount(flash.amount, flash.currency)}
            </p>
            {flash.payerName && <p className="mt-3 text-lg text-[#754319]/80">from {flash.payerName}</p>}
          </div>
        ) : (
          <div className="text-[#754319]/60">
            <Volume2 className="mx-auto mb-3 h-12 w-12" />
            <p>Waiting for payments…</p>
          </div>
        )}
      </section>

      <section className="border-t border-[#754319]/10 bg-white/60 px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#5b371f]">Announced on this device</h2>
          <Button variant="ghost" size="sm" onClick={() => announcePayment(1, "ETB", { speech })}>
            Test sound
          </Button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-[#754319]/60">Nothing yet.</p>
        ) : (
          <ul className="max-h-60 divide-y divide-[#754319]/10 overflow-y-auto">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-[#754319]/80">
                  {new Date(p.occurredAt).toLocaleTimeString()}
                  {p.type === "test" ? " · test" : p.payerName ? ` · ${p.payerName}` : ""}
                  {p.channel ? ` · ${p.channel}` : ""}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[#5b371f]">
                  {formatAmount(p.amount, p.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
