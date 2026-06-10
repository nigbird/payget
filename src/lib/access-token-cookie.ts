// Edge-compatible cookie encryption using the Web Crypto API.
// Works identically in Node.js 18+ and the Edge runtime.
// Cookie format: base64url(iv) . base64url(tag) . base64url(ciphertext)

import { NextRequest, NextResponse } from "next/server"
import { accessTokenTtlSeconds } from "@/lib/token-auth"

const IV_LENGTH = 12 // bytes (AES-GCM standard)
const TAG_LENGTH = 16 // bytes (AES-GCM auth tag)

function toB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function fromB64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/")
  const pad = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + "=".repeat(pad))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.ACCESS_TOKEN_SECRET
  if (!secret) throw new Error("Missing required env var: ACCESS_TOKEN_SECRET")
  const raw = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  )
  return globalThis.crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
}

export function accessTokenCookieName(): string {
  return process.env.ACCESS_TOKEN_COOKIE_NAME || "access_token"
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
}

export async function encryptAccessTokenForCookie(token: string): Promise<string> {
  const key = await getKey()
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token)
  )
  // Web Crypto AES-GCM appends the auth tag after the ciphertext.
  const ciphertext = new Uint8Array(encrypted, 0, encrypted.byteLength - TAG_LENGTH)
  const tag = new Uint8Array(encrypted, encrypted.byteLength - TAG_LENGTH, TAG_LENGTH)
  return `${toB64url(iv)}.${toB64url(tag)}.${toB64url(ciphertext)}`
}

export async function decryptAccessTokenFromCookie(value: string): Promise<string | null> {
  try {
    const parts = value.split(".")
    if (parts.length !== 3) return null
    const iv = fromB64url(parts[0])
    const tag = fromB64url(parts[1])
    const ciphertext = fromB64url(parts[2])
    // Web Crypto expects ciphertext + tag concatenated for decryption.
    const combined = new Uint8Array(ciphertext.length + tag.length)
    combined.set(ciphertext)
    combined.set(tag, ciphertext.length)
    const key = await getKey()
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      combined
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

export async function setAccessTokenCookie(
  res: NextResponse,
  accessToken: string,
  ttlSeconds?: number
): Promise<void> {
  const ttl = ttlSeconds ?? accessTokenTtlSeconds()
  res.cookies.set({
    name: accessTokenCookieName(),
    value: await encryptAccessTokenForCookie(accessToken),
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + ttl * 1000),
  })
}

export function clearAccessTokenCookie(res: NextResponse): void {
  res.cookies.set({
    name: accessTokenCookieName(),
    value: "",
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  })
}

export async function getAccessTokenFromCookie(request: Request): Promise<string | null> {
  const raw = (request as NextRequest).cookies.get(accessTokenCookieName())?.value
  if (!raw) return null
  return decryptAccessTokenFromCookie(raw)
}

export async function getAccessTokenFromServerCookies(): Promise<string | null> {
  const { cookies } = await import("next/headers")
  const store = await cookies()
  const raw = store.get(accessTokenCookieName())?.value
  if (!raw) return null
  return decryptAccessTokenFromCookie(raw)
}
