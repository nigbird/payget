import { SignJWT, jwtVerify } from "jose"
import crypto from "crypto"

// Session lifetimes (hardcoded; not controlled by env).
// Adjust these values in code if you want different behavior.
export const ACCESS_TOKEN_TTL_SECONDS = 60
export const REFRESH_TOKEN_TTL_SECONDS = 60

export type AccessTokenClaims = {
  sub: string
  role?: string
  merchantId?: string | null
  permissions?: string[]
  isHeadOffice?: boolean
  district?: string | null
  branch?: string | null
  assignedMerchantIds?: string[]
}

function getEnvOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function getAccessSecret() {
  return new TextEncoder().encode(getEnvOrThrow("ACCESS_TOKEN_SECRET"))
}

export function accessTokenTtlSeconds() {
  return ACCESS_TOKEN_TTL_SECONDS
}

export function computeRefreshTokenExpiresAt(nowMs = Date.now()) {
  return new Date(nowMs + REFRESH_TOKEN_TTL_SECONDS * 1000)
}

export async function signAccessToken(claims: AccessTokenClaims) {
  const ttl = accessTokenTtlSeconds()
  return new SignJWT({
    role: claims.role,
    merchantId: claims.merchantId ?? null,
    permissions: claims.permissions ?? [],
    isHeadOffice: claims.isHeadOffice ?? false,
    district: claims.district ?? null,
    branch: claims.branch ?? null
    ,assignedMerchantIds: claims.assignedMerchantIds ?? []
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getAccessSecret())
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, getAccessSecret(), { algorithms: ["HS256"] })
  return payload
}

export function generateRefreshTokenValue() {
  return crypto.randomBytes(48).toString("base64url")
}

export function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function getBearerTokenFromHeaders(headers: Headers) {
  const h = headers.get("authorization") || headers.get("Authorization")
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

