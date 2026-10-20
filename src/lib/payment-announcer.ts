"use client"

import { AMHARIC_CLIP_DIR, AMHARIC_CLIPS, amharicAnnouncementClips } from "@/lib/amharic-voice-clips"

/**
 * Plays the "payment received" chime and speaks the amount on a sound device.
 *
 * Browsers refuse to play audio until the page has had a user gesture, so
 * the /speaker page calls unlockAudio() again on the first tap. An installed
 * speaker app (Android home-screen app) may play without one.
 *
 * Speech, in order of preference:
 *  1. Recorded Amharic clips (public/sounds/am/<name>.wav or .mp3, see
 *     lib/amharic-voice-clips) — same voice on every browser, phone and soundbox.
 *  2. The device's text-to-speech: Amharic if it has a voice (Edge does,
 *     Chrome and most phones don't), otherwise English.
 * The chime and the offline warning are synthesised, so there are no assets for them.
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
      // One file per word, WAV or MP3 (the same recordings as the Android app).
      for (const ext of ["wav", "mp3"]) {
        try {
          const res = await fetch(`${AMHARIC_CLIP_DIR}/${name}.${ext}`)
          if (!res.ok) continue
          clipBuffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()))
          return
        } catch {
          // missing or undecodable — covered by the device-voice fallback
        }
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

/** Which voice announces amounts, for the Settings screen. */
export async function voiceDescription(): Promise<string> {
  await loadAmharicClips()
  const total = Object.keys(AMHARIC_CLIPS).length
  const recorded = Object.keys(AMHARIC_CLIPS).filter((n) => clipBuffers.has(n)).length
  if (recorded >= total) return "Recorded Amharic voice"
  if (recorded > 0) return `Recorded Amharic (${recorded} of ${total} words), otherwise the phone's voice`
  return "The phone's voice"
}

/** Sine notes with a fast attack and an exponential decay (the same tones as the Android app). */
function playTone(
  notes: { freq: number; start: number }[],
  attack: number,
  decayEnd: number,
  noteLength: number
): Promise<void> {
  const ctx = audioContext
  if (!ctx) return Promise.resolve()
  const now = ctx.currentTime
  for (const { freq, start } of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(0.6, now + start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + decayEnd)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now + start)
    osc.stop(now + start + noteLength)
  }
  const end = Math.max(...notes.map((n) => n.start)) + noteLength
  return new Promise((resolve) => setTimeout(resolve, end * 1000 + 100))
}

/** "Payment received": two rising notes. */
function playChime(): Promise<void> {
  return playTone(
    [
      { freq: 880, start: 0 },
      { freq: 1318.5, start: 0.16 },
    ],
    0.02,
    0.6,
    0.65
  )
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

export type PaymentSound = "chime" | "none"

/**
 * sound: the chime, or nothing before the voice. speech: false is "Sound only"
 * (no spoken amount); ignored with sound "none", which would announce nothing.
 */
export function announcePayment(
  amount: number,
  currency: string,
  options?: { sound?: PaymentSound; speech?: boolean }
) {
  const sound = options?.sound ?? "chime"
  queue = queue.then(async () => {
    await ensureAudioRunning()
    if (sound === "chime") await playChime()
    if (options?.speech !== false || sound === "none") await speakAmount(amount, currency)
  })
  return queue
}

/** "Connection lost": three short falling beeps, unlike the rising chime. Queued with announcements. */
export function playOfflineWarning() {
  queue = queue.then(async () => {
    await ensureAudioRunning()
    await playTone(
      [
        { freq: 988, start: 0 },
        { freq: 784, start: 0.25 },
        { freq: 587, start: 0.5 },
      ],
      0.01,
      0.22,
      0.25
    )
  })
  return queue
}
