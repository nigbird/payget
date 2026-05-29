import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { accessTokenTtlSeconds } from "@/lib/token-auth"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function getEncryptionKey(): Buffer {
  const secret = process.env.ACCESS_TOKEN_SECRET
  if (!secret) throw new Error("Missing required env var: ACCESS_TOKEN_SECRET")
  return crypto.createHash("sha256").update(secret).digest()
}

export function accessTokenCookieName() {
  return process.env.ACCESS_TOKEN_COOKIE_NAME || "access_token"
}

function isProd() {
  return process.env.NODE_ENV === "production"
}

export function encryptAccessTokenForCookie(token: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((b) => b.toString("base64url")).join(".")
}

export function decryptAccessTokenFromCookie(encrypted: string): string | null {
  try {
    const parts = encrypted.split(".")
    if (parts.length !== 3) return null
    const iv = Buffer.from(parts[0], "base64url")
    const tag = Buffer.from(parts[1], "base64url")
    const data = Buffer.from(parts[2], "base64url")
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function setAccessTokenCookie(res: NextResponse, accessToken: string) {
  res.cookies.set({
    name: accessTokenCookieName(),
    value: encryptAccessTokenForCookie(accessToken),
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + accessTokenTtlSeconds() * 1000),
  })
}

export function clearAccessTokenCookie(res: NextResponse) {
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

export function getAccessTokenFromCookie(request: Request): string | null {
  const raw = (request as NextRequest).cookies.get(accessTokenCookieName())?.value
  if (!raw) return null
  return decryptAccessTokenFromCookie(raw)
}
