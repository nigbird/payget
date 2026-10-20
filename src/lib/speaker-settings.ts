"use client"

import { useSyncExternalStore } from "react"
import type { PaymentSound } from "@/lib/payment-announcer"

/**
 * Speaker preferences, kept in this browser's localStorage (the same options as
 * the Android app's Settings screen, minus the ones a web page can't control).
 */

export type SpeakerSettings = {
  /** Played before the spoken amount. */
  paymentSound: PaymentSound
  /** "Sound only": play the payment sound without speaking the amount. */
  soundOnly: boolean
  /** Play a warning tone once when the connection has been lost for 30 seconds. */
  offlineWarning: boolean
  /** Payments also arrive as notifications, which still alert when the phone has frozen the page. */
  paymentNotifications: boolean
  /** The user confirmed the phone's background / battery settings (can't be detected). */
  backgroundGuideDone: boolean
}

const STORAGE_KEY = "nibtera.speakerSettings"
/** The page's earlier chime-only switch ("off" = no speech). */
const LEGACY_SPEECH_KEY = "nibtera.soundDeviceSpeech"

const DEFAULTS: SpeakerSettings = {
  paymentSound: "chime",
  soundOnly: false,
  offlineWarning: true,
  paymentNotifications: true,
  backgroundGuideDone: false,
}

let current: SpeakerSettings | null = null
const listeners = new Set<() => void>()

function load(): SpeakerSettings {
  if (current) return current
  let stored: Partial<SpeakerSettings> = {}
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    if (localStorage.getItem(LEGACY_SPEECH_KEY) === "off" && stored.soundOnly === undefined) stored.soundOnly = true
  } catch {
    // storage blocked or corrupt: defaults
  }
  current = { ...DEFAULTS, ...stored }
  return current
}

export function getSpeakerSettings(): SpeakerSettings {
  return typeof window === "undefined" ? DEFAULTS : load()
}

export function updateSpeakerSettings(patch: Partial<SpeakerSettings>) {
  const next = { ...load(), ...patch }
  // "No sound" with "Sound only" would announce nothing.
  if (next.paymentSound === "none") next.soundOnly = false
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // private mode: kept for this visit only
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSpeakerSettings(): SpeakerSettings {
  return useSyncExternalStore(subscribe, getSpeakerSettings, () => DEFAULTS)
}
