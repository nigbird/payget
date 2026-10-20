"use client"

/**
 * Keeps the /speaker page running with the screen off.
 *
 * Phones freeze a background tab, which stops the payment stream and every
 * announcement. A tab that is playing media is left running (it gets a media
 * notification, like a music app), so the speaker loops a near-silent track:
 * a 30 Hz tone at about -53 dBFS (public/sounds/keepalive.mp3). A fully silent
 * track would not do: Chrome treats digital silence as "not playing". Phone
 * and laptop speakers can't reproduce 30 Hz, so nobody hears it.
 *
 * MP3 at 44.1 kHz, 20 s long: Chrome on Android refused the earlier 8 kHz WAV
 * (NotSupportedError), and treats media under about 5 s as a short sound that
 * gets no media notification.
 *
 * Best effort: aggressive battery managers can still kill the browser, and
 * iOS suspends the page anyway. Web Push (lib/speaker-push) covers those.
 *
 * Never resumed automatically. The phone may be the merchant's own, and when
 * their music or video app takes the audio focus, restarting would pause it
 * again and again. The page offers "tap to resume" instead, and push still
 * alerts while the track is off. (After a phone call Chrome resumes it itself.)
 */

const KEEPALIVE_SRC = "/sounds/keepalive.mp3"

/**
 * - paused: from the phone's media controls.
 * - interrupted: another app took the audio focus.
 * - blocked: the browser refused to play without a tap.
 */
export type KeepAliveState = "off" | "playing" | "paused" | "interrupted" | "blocked"

let audio: HTMLAudioElement | null = null
/** Set when the user pauses from the media notification. */
let pausedByUser = false
let state: KeepAliveState = "off"
let lastError: string | null = null
const listeners = new Set<() => void>()

function setState(next: KeepAliveState) {
  if (state === next) return
  state = next
  listeners.forEach((listener) => listener())
}

function setPlaybackState(playing: boolean) {
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused"
}

async function play(): Promise<boolean> {
  if (!audio) return false
  try {
    await audio.play()
    pausedByUser = false
    lastError = null
    setPlaybackState(true)
    setState("playing")
    return true
  } catch (err) {
    // Needs a tap (autoplay policy), another app holds the audio focus, or the
    // track failed to load. The name is shown on screen for diagnosis.
    lastError = err instanceof Error ? err.name : String(err)
    // MediaError 4 = the file couldn't be loaded or decoded.
    if (audio?.error) lastError += ` (media ${audio.error.code})`
    console.warn("[speaker] Keep-alive track didn't start:", err)
    setState("blocked")
    return false
  }
}

/** Why the track last failed to start (e.g. NotAllowedError), for the status screen. */
export function keepAliveError(): string | null {
  return lastError
}

/** Starts the keep-alive track. Call from a tap: browsers only allow it then. */
export function startKeepAlive(metadata: { title: string; artist: string }): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (!audio) {
    audio = new Audio(KEEPALIVE_SRC)
    audio.loop = true
    audio.preload = "auto"
    audio.addEventListener("pause", () => {
      setPlaybackState(false)
      if (state !== "off") setState(pausedByUser ? "paused" : "interrupted")
    })
    audio.addEventListener("playing", () => setState("playing"))

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => void play())
      navigator.mediaSession.setActionHandler("pause", () => {
        pausedByUser = true
        audio?.pause()
      })
    }
  }
  setKeepAliveMetadata(metadata)
  return play()
}

/** What the lock screen / media notification shows. */
export function setKeepAliveMetadata({ title, artist }: { title: string; artist: string }) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    artwork: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  })
}

/** Resumes after a pause or interruption. Call from a tap. */
export function resumeKeepAlive(): Promise<boolean> {
  pausedByUser = false
  return play()
}

export function stopKeepAlive() {
  if (!audio) return
  setState("off")
  audio.pause()
}

export function keepAliveState(): KeepAliveState {
  return state
}

export function onKeepAliveChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
