import { NextResponse } from "next/server"

export function refreshTokenCookieName(): string {
  return process.env.REFRESH_TOKEN_COOKIE_NAME || "refresh_token"
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
}

export function setRefreshTokenCookie(
  res: NextResponse,
  value: string,
  expires: Date
): void {
  res.cookies.set({
    name: refreshTokenCookieName(),
    value,
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires
  })
}

export function clearRefreshTokenCookie(res: NextResponse): void {
  res.cookies.set({
    name: refreshTokenCookieName(),
    value: "",
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  })
}
