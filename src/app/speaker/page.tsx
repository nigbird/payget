"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Loader2, Share } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  announcePayment,
  audioState,
  ensureAudioRunning,
  isAudioRunning,
  onAudioStateChange,
  playOfflineWarning,
  unlockAudio,
  voiceDescription,
} from "@/lib/payment-announcer"
import {
  keepAliveError,
  keepAliveState,
  onKeepAliveChange,
  resumeKeepAlive,
  setKeepAliveMetadata,
  startKeepAlive,
  stopKeepAlive,
  type KeepAliveState,
} from "@/lib/speaker-keepalive"
import {
  disablePaymentPush,
  enablePaymentPush,
  notificationPermission,
  type PushStatus,
} from "@/lib/speaker-push"
import { getSpeakerSettings, updateSpeakerSettings, useSpeakerSettings } from "@/lib/speaker-settings"
import { clearPin, hasPin } from "@/lib/speaker-pin"
import { PairScreen } from "./_components/pair-screen"
import { PinDialog, SetPinScreen } from "./_components/pin"
import { SettingsScreen } from "./_components/settings-screen"
import { SetupCard, SetupItems, type SetupState } from "./_components/setup"
import { StatusScreen } from "./_components/status-screen"
import type { ConnectionState, Payment } from "./_components/ui"

/**
 * Counter speaker: a phone, tablet or PC left on at the till that announces
 * every payment the merchant receives. Paired from the merchant portal
 * (Configuration → Sound Devices), which opens /speaker#t=<device token>.
 * The token lives in this browser's localStorage and is independent of any
 * merchant login, so the page keeps working through session timeouts.
 *
 * Same screens and behaviour as the Android app (nibtera_speaker): Pair, a PIN,
 * Status, Settings. It starts by itself when opened; an installed app may play
 * sound straight away, a browser tab after the first tap.
 */

const TOKEN_STORAGE_KEY = "nibtera.soundDeviceToken"
const RECENT_STORAGE_KEY = "nibtera.speakerRecent"
const MAX_BACKOFF_MS = 30 * 1000
/** Announcements kept on the phone: today's only (the portal's Transactions page is the record). */
const RECENT_LIMIT = 200
/** The server pings every 20 s (api/devices/payment-stream). Silence for longer
 * than this means the connection died without closing — common after Wi-Fi
 * drops or a laptop sleeping — so drop it and reconnect. */
const STREAM_SILENCE_LIMIT_MS = 50 * 1000
const HEALTH_CHECK_MS = 10 * 1000
/** How long to wait for the stream's first message before switching to polling. */
const STREAM_READY_TIMEOUT_MS = 8 * 1000
/** Polling interval when the stream can't get through. */
const POLL_INTERVAL_MS = 3 * 1000
/** Without a connection this long, the speaker shows "Offline" and warns once. */
const OFFLINE_AFTER_MS = 30 * 1000

type StreamPayment = Omit<Payment, "receivedAt">

/** Chrome's install prompt (not in the DOM typings). */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** A PIN-protected action waiting for the PIN. */
type PinAction = { kind: "unpair" } | { kind: "change" } | { kind: "replace"; token: string }

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

function isToday(ms: number) {
  return new Date(ms).toDateString() === new Date().toDateString()
}

function readRecent(): Payment[] {
  try {
    const parsed = JSON.parse(readStorage(RECENT_STORAGE_KEY) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter((p: Payment) => isToday(p.receivedAt)).slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

/**
 * Token from a pasted pairing link (https://<this server>/speaker#t=sdv_…) or a
 * bare token. On iPhone a home-screen app doesn't share Safari's storage, so a
 * pairing opened in Safari never reaches it: pasting the link is how it pairs.
 */
function tokenFromPairingInput(input: string): { token: string } | { error: string } {
  const text = input.trim()
  if (/^sdv_[A-Za-z0-9_-]+$/.test(text)) return { token: text }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { error: "That isn't a pairing link. Copy the whole link from the merchant portal." }
  }
  // The token only works on the server that issued it.
  if (url.host !== window.location.host) {
    return { error: `This link is for a different server (${url.host}).` }
  }
  const match = url.hash.match(/[#&]t=([^&]+)/)
  const token = match ? decodeURIComponent(match[1]) : ""
  return token.startsWith("sdv_") ? { token } : { error: "This link has no pairing code in it." }
}

function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export default function SpeakerPage() {
  const settings = useSpeakerSettings()
  const [token, setToken] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pinSet, setPinSet] = useState(false)
  const [pinAction, setPinAction] = useState<PinAction | null>(null)
  const [view, setView] = useState<"status" | "settings">("status")
  const [baseConnection, setBaseConnection] = useState<"connecting" | "live" | "reconnecting">("connecting")
  const [transport, setTransport] = useState<"stream" | "polling">("stream")
  const [offline, setOffline] = useState(false)
  const [info, setInfo] = useState<{ deviceName: string; merchantName: string } | null>(null)
  const [recent, setRecent] = useState<Payment[]>([])
  const [voice, setVoice] = useState<string | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [tappedForSound, setTappedForSound] = useState(false)
  const [keepAlive, setKeepAlive] = useState<KeepAliveState>("off")
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [env, setEnv] = useState({ installed: false, ios: false, samsung: false })
  const [pairingError, setPairingError] = useState<string | null>(null)

  const active = !!token

  // Pick up a fresh pairing from the link's #fragment (never sent to the
  // server or written to access logs), then drop it from the address bar.
  // Replacing an existing pairing needs the PIN, so a link someone else sends
  // can't move the speaker to another merchant account.
  useEffect(() => {
    const existing = readStorage(TOKEN_STORAGE_KEY)
    const match = window.location.hash.match(/[#&]t=([^&]+)/)
    if (match) history.replaceState(null, "", window.location.pathname)
    const fresh = match ? decodeURIComponent(match[1]) : null

    if (fresh && existing && fresh !== existing && hasPin()) {
      setToken(existing)
      setPinAction({ kind: "replace", token: fresh })
    } else if (fresh && fresh !== existing) {
      writeStorage(TOKEN_STORAGE_KEY, fresh)
      writeStorage(RECENT_STORAGE_KEY, null)
      clearPin()
      setToken(fresh)
    } else {
      setToken(existing)
    }
    setPinSet(hasPin())
    setRecent(readRecent())
    setPermission(notificationPermission())
    setEnv({ installed: isInstalledApp(), ios: isIos(), samsung: /SM-|Samsung/i.test(navigator.userAgent) })
    // Chrome hides the phone model from the user agent; ask for it (Samsung guide).
    const uaData = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues: (hints: string[]) => Promise<{ model?: string }> }
    }).userAgentData
    uaData
      ?.getHighEntropyValues(["model"])
      .then(({ model }) => {
        if (model && /^SM-/i.test(model)) setEnv((e) => ({ ...e, samsung: true }))
      })
      .catch(() => {})
    setLoaded(true)
  }, [])

  // A new day starts with an empty list.
  useEffect(() => {
    const timer = setInterval(() => {
      setRecent((prev) => (prev.length && !isToday(prev[0].receivedAt) ? readRecent() : prev))
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  // Offer to install the speaker as its own app (speaker-manifest.json).
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setEnv((e) => ({ ...e, installed: true }))
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  const forget = useCallback(() => {
    writeStorage(TOKEN_STORAGE_KEY, null)
    writeStorage(RECENT_STORAGE_KEY, null)
    clearPin()
    stopKeepAlive()
    setToken(null)
    setPinSet(false)
    setRecent([])
    setInfo(null)
    setView("status")
    setBaseConnection("connecting")
  }, [])

  /** The device was removed in the portal: forget everything, including the PIN. */
  const onRevoked = useCallback(() => {
    void navigator.serviceWorker
      ?.getRegistration("/")
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => s?.unsubscribe())
      .catch(() => {})
    forget()
  }, [forget])

  const pairWithLink = (link: string) => {
    const result = tokenFromPairingInput(link)
    if ("error" in result) return setPairingError(result.error)
    writeStorage(TOKEN_STORAGE_KEY, result.token)
    clearPin()
    setPinSet(false)
    setPairingError(null)
    setToken(result.token)
  }

  const handlePayment = useCallback((payment: StreamPayment) => {
    setRecent((prev) => {
      if (prev.some((p) => p.id === payment.id)) return prev
      const today = prev.filter((p) => isToday(p.receivedAt))
      const next = [{ ...payment, receivedAt: Date.now() }, ...today].slice(0, RECENT_LIMIT)
      writeStorage(RECENT_STORAGE_KEY, JSON.stringify(next))
      return next
    })
    const { paymentSound, soundOnly } = getSpeakerSettings()
    void announcePayment(payment.amount, payment.currency, { sound: paymentSound, speech: !soundOnly })
  }, [])

  // Start by itself whenever the page opens paired. Audio and the keep-alive
  // track play straight away in an installed app; in a browser tab they wait
  // for the first tap (see the tap handler below).
  useEffect(() => {
    if (!token) return
    unlockAudio()
    void startKeepAlive({ title: "Listening for payments", artist: "Nibtera Speaker" }).then(() =>
      setKeepAlive(keepAliveState())
    )
    void voiceDescription().then(setVoice)
    // Re-sync the push subscription; the permission prompt itself needs a tap (Setup card).
    if (notificationPermission() === "granted" && getSpeakerSettings().paymentNotifications) {
      void enablePaymentPush(token).then(setPushStatus)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    setKeepAliveMetadata({ title: "Listening for payments", artist: info?.merchantName ?? "Nibtera Speaker" })
  }, [token, info?.merchantName])

  // Receiving payments. Prefer the live stream (instant); fall back to polling
  // when the network holds the stream back. fetch() rather than EventSource
  // because EventSource can't send an Authorization header, and the token must
  // not go in the URL.
  useEffect(() => {
    if (!token) return

    let stopped = false
    let controller: AbortController | null = null
    let lastEventId = 0
    let attempt = 0
    let lastDataAt = Date.now()
    let usePolling = false
    const seen = new Set<number>(readRecent().map((p) => p.id))
    const auth = { Authorization: `Bearer ${token}` }

    const deliver = (payment: StreamPayment) => {
      lastEventId = Math.max(lastEventId, payment.id)
      if (seen.has(payment.id)) return
      seen.add(payment.id)
      handlePayment(payment)
    }

    // The service worker hands over pushed payments (public/sw.js) and asks
    // whether we announced them aloud; if we did, its notification stays silent.
    // A push can overtake the stream, so it must not move lastEventId: a
    // reconnect would then skip earlier payments still in the replay window.
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "nibtera-payment") return
      const payment = event.data.payment as StreamPayment
      if (!seen.has(payment.id)) {
        seen.add(payment.id)
        handlePayment(payment)
      }
      event.ports[0]?.postMessage({ announced: isAudioRunning() })
    }
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage)
    navigator.serviceWorker?.startMessages()

    const onReady = (ready: { deviceName: string; merchantName: string; cursor?: number }) => {
      attempt = 0
      setBaseConnection("live")
      setInfo({ deviceName: ready.deviceName, merchantName: ready.merchantName })
      // Without a position, a speaker that drops before its first payment would
      // reconnect without Last-Event-ID and miss everything published while away.
      if (!lastEventId && typeof ready.cursor === "number") lastEventId = ready.cursor
    }

    /** One stream connection. Resolves when it ends; returns false if the device was unpaired. */
    const streamOnce = async (): Promise<boolean> => {
      let gotReady = false
      // Some proxies and WAFs buffer a response until it ends, so a stream never
      // arrives. If even the first message doesn't come through, switch to polling.
      const readyTimer = setTimeout(() => {
        if (!gotReady) {
          usePolling = true
          controller?.abort()
        }
      }, STREAM_READY_TIMEOUT_MS)
      try {
        const res = await fetch("/api/devices/payment-stream", {
          headers: { ...auth, ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {}) },
          cache: "no-store",
          signal: controller!.signal,
        })
        if (res.status === 401) return false
        if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          lastDataAt = Date.now()
          buffer += decoder.decode(value, { stream: true })

          let boundary: number
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)

            let event = "message"
            let data = ""
            for (const line of raw.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim()
              else if (line.startsWith("data:")) data += line.slice(5).trim()
            }

            try {
              if (event === "ready") {
                gotReady = true
                onReady(JSON.parse(data))
              } else if (event === "revoked") {
                return false
              } else if (event === "payment" || event === "test") {
                deliver(JSON.parse(data))
              }
            } catch {}
          }
        }
      } catch {
        // dropped, timed out or aborted — the caller decides what happens next
      } finally {
        clearTimeout(readyTimer)
      }
      return true
    }

    /** One poll. Returns false if the device was unpaired; throws on network errors. */
    const pollOnce = async (): Promise<boolean> => {
      const res = await fetch(`/api/devices/payment-events${lastEventId ? `?after=${lastEventId}` : ""}`, {
        headers: auth,
        cache: "no-store",
        signal: controller!.signal,
      })
      if (res.status === 401) return false
      if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
      const body = await res.json()
      lastDataAt = Date.now()
      onReady(body)
      setTransport("polling")
      for (const payment of body.events ?? []) deliver(payment)
      lastEventId = Math.max(lastEventId, body.cursor ?? 0)
      return true
    }

    const run = async () => {
      while (!stopped) {
        controller = new AbortController()
        lastDataAt = Date.now()
        if (attempt > 0) setBaseConnection("reconnecting")

        if (!usePolling) {
          setTransport("stream")
          if (!(await streamOnce())) return onRevoked()
          if (stopped) return
          if (usePolling) continue // stream was held back: go straight to polling
        } else {
          try {
            if (!(await pollOnce())) return onRevoked()
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
            continue
          } catch {
            if (stopped) return
          }
        }

        attempt += 1
        setBaseConnection("reconnecting")
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), MAX_BACKOFF_MS)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    void run()

    // A device waking from sleep, or coming back online, usually holds a dead
    // socket that will never deliver another byte; reconnect right away.
    const reconnectNow = () => {
      lastDataAt = Date.now()
      controller?.abort()
    }
    let lastTick = Date.now()
    const health = setInterval(() => {
      const now = Date.now()
      const slept = now - lastTick > HEALTH_CHECK_MS * 3
      lastTick = now
      if (slept || now - lastDataAt > STREAM_SILENCE_LIMIT_MS) reconnectNow()
    }, HEALTH_CHECK_MS)
    window.addEventListener("online", reconnectNow)
    return () => {
      stopped = true
      clearInterval(health)
      controller?.abort()
      window.removeEventListener("online", reconnectNow)
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage)
    }
  }, [token, onRevoked, handlePayment])

  // "Offline" after 30 s without a connection, with one warning tone (Settings → Warn when offline).
  const offlineSince = useRef<number | null>(null)
  const warned = useRef(false)
  useEffect(() => {
    if (!token) return
    if (baseConnection === "live") {
      offlineSince.current = null
      warned.current = false
      setOffline(false)
      return
    }
    offlineSince.current ??= Date.now()
    const check = () => {
      if (offlineSince.current === null || Date.now() - offlineSince.current < OFFLINE_AFTER_MS) return
      setOffline(true)
      if (!warned.current && getSpeakerSettings().offlineWarning) {
        warned.current = true
        void playOfflineWarning()
      }
    }
    check()
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
  }, [token, baseConnection])

  // Keep the screen (and therefore the page) awake while running.
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen")
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
      void lock?.release()
    }
  }, [active])

  // Keep audio alive. The browser can suspend it silently at any time; try to
  // resume on our own, and if it insists on a tap, say so on screen instead of
  // letting payments go unannounced.
  useEffect(() => {
    if (!active) return
    const check = async () => {
      const running = isAudioRunning() || (await ensureAudioRunning())
      setAudioBlocked(!running)
      setKeepAlive(keepAliveState())
    }
    void check()
    const offState = onAudioStateChange(() => void check())
    const offKeepAlive = onKeepAliveChange(() => setKeepAlive(keepAliveState()))
    const timer = setInterval(() => void check(), HEALTH_CHECK_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    // Any tap lets the browser play sound. It also starts the keep-alive track
    // if the browser refused it without one, but never takes the sound back
    // from another app (that needs the explicit banner). "click", not
    // "pointerdown": on phones a touch only counts once the finger lifts.
    const onTap = () => {
      unlockAudio()
      if (keepAliveState() === "blocked") void resumeKeepAlive()
      void check()
    }
    document.addEventListener("visibilitychange", onVisible)
    document.addEventListener("click", onTap, true)
    document.addEventListener("keydown", onTap, true)
    return () => {
      offState()
      offKeepAlive()
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      document.removeEventListener("click", onTap, true)
      document.removeEventListener("keydown", onTap, true)
    }
  }, [active])

  // Holding a Web Lock tells Chrome this page is doing live work, so its
  // Memory Saver / tab freezing leaves it alone. Released when the speaker stops.
  useEffect(() => {
    if (!active || !("locks" in navigator)) return
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    navigator.locks.request("nibtera-payment-speaker", () => held).catch(() => {})
    return () => release()
  }, [active])

  const allowNotifications = async () => {
    if (!token) return
    updateSpeakerSettings({ paymentNotifications: true })
    setPushStatus(await enablePaymentPush(token))
    setPermission(notificationPermission())
  }

  const togglePaymentNotifications = async (on: boolean) => {
    if (!token) return
    if (on) return allowNotifications()
    updateSpeakerSettings({ paymentNotifications: false })
    await disablePaymentPush(token)
    setPushStatus(null)
  }

  const runPinAction = async (action: PinAction) => {
    setPinAction(null)
    if (action.kind === "change") {
      clearPin()
      setPinSet(false) // the Set PIN screen takes over
    } else if (action.kind === "unpair") {
      if (token) await disablePaymentPush(token)
      forget()
    } else {
      // Paired with another link: a new device, so a new PIN and history.
      writeStorage(TOKEN_STORAGE_KEY, action.token)
      writeStorage(RECENT_STORAGE_KEY, null)
      clearPin()
      setPinSet(false)
      setRecent([])
      setInfo(null)
      setToken(action.token)
    }
  }

  if (!loaded) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#754319]" />
      </main>
    )
  }

  const installUi = env.installed ? null : installPrompt ? (
    <Button
      variant="outline"
      onClick={() => void install()}
      className="h-12 w-full rounded-xl border-[#eddcc0] bg-white text-[#754319] hover:bg-[#fff8ea]"
    >
      <Download className="mr-2 h-5 w-5" /> Install the app
    </Button>
  ) : env.ios ? (
    <p className="text-sm text-[#754319]/70">
      To install: <Share className="inline h-4 w-4 align-text-bottom" /> Share → <strong>Add to Home Screen</strong>
    </p>
  ) : null

  if (!token) {
    return (
      <PairScreen
        onPair={pairWithLink}
        error={pairingError}
        onClearError={() => setPairingError(null)}
        install={installUi}
      />
    )
  }

  if (!pinSet) {
    return <SetPinScreen onSaved={() => setPinSet(true)} />
  }

  const notificationsState: SetupState["notifications"] = !settings.paymentNotifications
    ? "off"
    : permission === "unsupported"
      ? "unsupported"
      : permission === "denied"
        ? "denied"
        : permission === "granted" && pushStatus === "enabled"
          ? "enabled"
          : "allow"
  const setupState: SetupState = {
    installed: env.installed,
    canInstall: !!installPrompt,
    ios: env.ios,
    samsung: env.samsung,
    notifications: notificationsState,
    backgroundGuideDone: settings.backgroundGuideDone,
  }
  const setupProps = {
    state: setupState,
    onInstall: () => void install(),
    onAllowNotifications: () => void allowNotifications(),
    onBackgroundDone: () => updateSpeakerSettings({ backgroundGuideDone: true }),
  }

  const connection: ConnectionState = offline
    ? "offline"
    : baseConnection === "live"
      ? transport === "polling"
        ? "polling"
        : "live"
      : baseConnection
  const merchantName = info?.merchantName ?? ""
  const deviceName = info?.deviceName ?? ""

  const pinDialog =
    pinAction &&
    (pinAction.kind === "unpair" ? (
      <PinDialog
        title="Unpair this phone?"
        message="Forgot the PIN? Remove this device in the merchant portal."
        confirmLabel="Unpair"
        danger
        onSuccess={() => void runPinAction(pinAction)}
        onCancel={() => setPinAction(null)}
      />
    ) : pinAction.kind === "change" ? (
      <PinDialog
        title="Change PIN"
        message="Enter the current PIN."
        confirmLabel="Next"
        onSuccess={() => void runPinAction(pinAction)}
        onCancel={() => setPinAction(null)}
      />
    ) : (
      <PinDialog
        title="Pair with a new link?"
        message={`This phone is paired to ${merchantName || "a merchant"}. Enter the PIN to switch.`}
        confirmLabel="Switch"
        danger
        onSuccess={() => void runPinAction(pinAction)}
        onCancel={() => setPinAction(null)}
      />
    ))

  return (
    <>
      {view === "settings" ? (
        <SettingsScreen
          settings={{ ...settings, paymentNotifications: notificationsState === "enabled" }}
          onChange={updateSpeakerSettings}
          onTogglePaymentNotifications={(on) => void togglePaymentNotifications(on)}
          notificationsAvailable={permission !== "unsupported"}
          voice={voice}
          onTestSound={() => {
            unlockAudio()
            void announcePayment(1, "ETB", { sound: settings.paymentSound, speech: !settings.soundOnly })
          }}
          setup={<SetupItems {...setupProps} showDone />}
          merchantName={merchantName}
          deviceName={deviceName}
          onChangePin={() => setPinAction({ kind: "change" })}
          onUnpair={() => setPinAction({ kind: "unpair" })}
          onBack={() => setView("status")}
        />
      ) : (
        <StatusScreen
          merchantName={merchantName}
          deviceName={deviceName}
          connection={connection}
          // Only the sound that plays announcements; the keep-alive track has its own notice.
          soundBlocked={audioBlocked}
          soundDiagnosis={tappedForSound && audioBlocked ? `Still blocked (audio: ${audioState()})` : null}
          // The tap itself unlocks sound (document click listener above).
          onTurnOnSound={() => setTappedForSound(true)}
          background={keepAlive === "paused" || keepAlive === "interrupted" || keepAlive === "blocked" ? keepAlive : null}
          backgroundError={keepAlive === "blocked" ? keepAliveError() : null}
          onResumeBackground={() => void resumeKeepAlive().then(() => setKeepAlive(keepAliveState()))}
          setupCard={<SetupCard {...setupProps} />}
          recent={recent}
          onOpenSettings={() => setView("settings")}
        />
      )}
      {pinDialog}
    </>
  )
}
