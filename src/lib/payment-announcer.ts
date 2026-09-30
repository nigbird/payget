"use client"

import { AMHARIC_CLIP_DIR, AMHARIC_CLIPS, amharicAnnouncementClips } from "@/lib/amharic-voice-clips"

/**
 * Plays the "payment received" chime and speaks the amount on a sound device.
 *
 * Browsers refuse to play audio until the page has had a user gesture, so
 * unlockAudio() must be called from a click/tap handler before the first
 * announcement; the /speaker page does this with its Start button.
 *
 * Speech, in order of preference:
 *  1. Recorded Amharic clips (public/sounds/am, see lib/amharic-voice-clips) —
 *     same voice on every browser, phone and soundbox.
 *  2. The device's text-to-speech: Amharic if it has a voice (Edge does,
 *     Chrome and most phones don't), otherwise English.
 * The chime is synthesised, so there is no asset to ship for it.
 */

let audioContext: AudioContext | null = null
const clipBuffers = new Map<string, AudioBuffer>()
let clipsLoad: Promise<void> | null = null

export type VoiceSource = "recorded" | "device"

export function unlockAudio() {
  if (typeof window === "undefined") return
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
  if (!audioContext && Ctor) audioContext = new Ctor()
  void audioContext?.resume()
  // iOS Safari only lets speech play later if it was first triggered inside a gesture.
  if ("speechSynthesis" in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""))
  }
  void loadAmharicClips()
}

/**
 * Browsers suspend an AudioContext on their own — after the device sleeps, the
 * output device changes, or a long idle — and a suspended context plays
 * nothing without any error. Resuming works without a new tap as long as the
 * page was unlocked once; if the browser still refuses, the speaker page asks
 * for a tap (see isAudioRunning / onAudioStateChange).
 */
export async function ensureAudioRunning(): Promise<boolean> {
  if (!audioContext) return false
  if (audioContext.state !== "running") {
    try {
      await audioContext.resume()
    } catch {
      // needs a user gesture — reported through isAudioRunning()
    }
  }
  return audioContext.state === "running"
}

export function isAudioRunning() {
  return audioContext?.state === "running"
}

export function onAudioStateChange(listener: () => void): () => void {
  const ctx = audioContext
  if (!ctx) return () => {}
  ctx.addEventListener("statechange", listener)
  return () => ctx.removeEventListener("statechange", listener)
}

/**
 * Fetches and decodes every recorded clip once. Missing clips are skipped;
 * an announcement needing one of them falls back to the device voice, so a
 * partially recorded set still works for the amounts it covers.
 */
export function loadAmharicClips(): Promise<void> {
  if (clipsLoad) return clipsLoad
  const ctx = audioContext
  if (!ctx) return Promise.resolve()

  clipsLoad = Promise.all(
    Object.keys(AMHARIC_CLIPS).map(async (name) => {
      try {
        const res = await fetch(`${AMHARIC_CLIP_DIR}/${name}.mp3`)
        if (!res.ok) return
        clipBuffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // missing or undecodable — covered by the device-voice fallback
      }
    })
  ).then(() => {
    const missing = Object.keys(AMHARIC_CLIPS).filter((n) => !clipBuffers.has(n))
    if (missing.length) {
      console.info(`[speaker] Recorded Amharic clips missing (${missing.length}): ${missing.join(", ")}`)
    }
  })
  return clipsLoad
}

/** Whether announcements are using the recorded voice (every clip present). */
export async function currentVoiceSource(): Promise<VoiceSource> {
  await loadAmharicClips()
  return Object.keys(AMHARIC_CLIPS).every((n) => clipBuffers.has(n)) ? "recorded" : "device"
}

function playChime(): Promise<void> {
  const ctx = audioContext
  if (!ctx) return Promise.resolve()

  const notes = [
    { freq: 880, start: 0 },
    { freq: 1318.5, start: 0.16 },
  ]
  const now = ctx.currentTime
  for (const { freq, start } of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(0.6, now + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + start)
    osc.stop(now + start + 0.65)
  }
  return new Promise((resolve) => setTimeout(resolve, 750))
}

/** Gap between words; recordings are trimmed tight, so a little air keeps it natural. */
const CLIP_GAP_SECONDS = 0.06

function playClips(names: string[]): Promise<void> {
  const ctx = audioContext!
  let at = ctx.currentTime + 0.05
  for (const name of names) {
    const buffer = clipBuffers.get(name)!
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(at)
    at += buffer.duration + CLIP_GAP_SECONDS
  }
  return new Promise((resolve) => setTimeout(resolve, (at - ctx.currentTime) * 1000))
}

/** Chrome fills its voice list asynchronously; wait briefly for it on first use. */
function getVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices()
  if (voices.length) return Promise.resolve(voices)
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true })
    setTimeout(done, 1000)
  })
}

async function pickVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = await getVoices()
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("am")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    null
  )
}

function announcementText(amount: number, currency: string, voice: SpeechSynthesisVoice | null) {
  const whole = Math.floor(amount)
  const cents = Math.round((amount - whole) * 100)
  const isBirr = currency === "ETB"

  if (voice?.lang.toLowerCase().startsWith("am") && isBirr) {
    return cents > 0 ? `${whole} ብር ከ ${cents} ሳንቲም ተቀብለዋል` : `${whole} ብር ተቀብለዋል`
  }
  const unit = isBirr ? "birr" : currency
  // "500.50 birr" is read as "five hundred point five zero" — spell out the cents instead.
  return cents > 0
    ? `Payment received. ${whole} ${unit} and ${cents} cents.`
    : `Payment received. ${whole} ${unit}.`
}

function speak(text: string, voice: SpeechSynthesisVoice | null): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }
    utterance.rate = 0.95
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    // Chrome's speech engine can wedge after long idle — queued utterances never
    // start. Announcements are already serialised, so clearing is safe.
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()
    window.speechSynthesis.speak(utterance)
    // Some engines never fire onend; don't let one stuck utterance block the queue.
    setTimeout(resolve, 8000)
  })
}

async function speakAmount(amount: number, currency: string) {
  if (currency === "ETB" && audioContext) {
    await loadAmharicClips()
    const clips = amharicAnnouncementClips(amount)
    if (clips && clips.every((n) => clipBuffers.has(n))) {
      await playClips(clips)
      return
    }
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const voice = await pickVoice()
    await speak(announcementText(amount, currency, voice), voice)
  }
}

// Announcements are serialised so two payments landing together are read out
// one after the other instead of talking over each other.
let queue: Promise<void> = Promise.resolve()

export function announcePayment(amount: number, currency: string, options?: { speech?: boolean }) {
  queue = queue.then(async () => {
    await ensureAudioRunning()
    await playChime()
    if (options?.speech !== false) await speakAmount(amount, currency)
  })
  return queue
}
