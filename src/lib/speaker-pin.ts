"use client"

/**
 * The speaker's PIN: needed to unpair, to change the PIN, and to replace the
 * pairing with another link, so nobody at the counter can quietly connect the
 * speaker to a different merchant account (same rules as the Android app).
 *
 * Only a salted PBKDF2 hash is kept, in localStorage. After 5 wrong tries each
 * further try waits 1, 2, 4 … up to 60 minutes. A forgotten PIN is recovered
 * by deleting the device in the merchant portal: the speaker then unpairs
 * itself and forgets the PIN.
 *
 * Limit: someone who can clear this site's data in the browser settings can
 * remove it too; the merchant still sees the device go quiet in the portal.
 */

export const MIN_PIN = 4
export const MAX_PIN = 6

const PIN_KEY = "nibtera.speakerPin"
const LOCK_KEY = "nibtera.speakerPinLock"
const ITERATIONS = 150_000
const MAX_FAILURES = 5
const BASE_LOCK_MS = 60_000
const MAX_LOCK_MS = 60 * 60_000

export type PinCheck = { ok: true } | { ok: false; attemptsLeft: number } | { ok: false; lockedSeconds: number }

type StoredPin = { salt: string; hash: string }
type LockState = { failures: number; lockedUntil: number }

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256)
  return toBase64(bits)
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked
  }
}

export function hasPin(): boolean {
  return read<StoredPin>(PIN_KEY) !== null
}

export async function setPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  write(PIN_KEY, { salt: toBase64(salt), hash: await derive(pin, salt) })
  write(LOCK_KEY, null)
}

export function clearPin() {
  write(PIN_KEY, null)
  write(LOCK_KEY, null)
}

export async function checkPin(pin: string): Promise<PinCheck> {
  const stored = read<StoredPin>(PIN_KEY)
  if (!stored) return { ok: true }

  const now = Date.now()
  const lock = read<LockState>(LOCK_KEY) ?? { failures: 0, lockedUntil: 0 }
  // Clamped, so moving the clock forward and back can't stretch a lock-out.
  const lockedUntil = Math.min(lock.lockedUntil, now + MAX_LOCK_MS)
  if (now < lockedUntil) return { ok: false, lockedSeconds: Math.ceil((lockedUntil - now) / 1000) }

  if ((await derive(pin, new Uint8Array(fromBase64(stored.salt)))) === stored.hash) {
    write(LOCK_KEY, null)
    return { ok: true }
  }

  const failures = lock.failures + 1
  if (failures < MAX_FAILURES) {
    write(LOCK_KEY, { failures, lockedUntil: 0 })
    return { ok: false, attemptsLeft: MAX_FAILURES - failures }
  }
  const lockMs = Math.min(BASE_LOCK_MS * 2 ** Math.min(failures - MAX_FAILURES, 6), MAX_LOCK_MS)
  write(LOCK_KEY, { failures, lockedUntil: now + lockMs })
  return { ok: false, lockedSeconds: lockMs / 1000 }
}
