import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { decryptAccessTokenFromCookie, accessTokenCookieName } from "@/lib/access-token-cookie"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAccessSecret() {
  const s = process.env.ACCESS_TOKEN_SECRET
  if (!s) throw new Error("Missing ACCESS_TOKEN_SECRET")
  return new TextEncoder().encode(s)
}

async function resolveUserFromRequest(req: NextRequest): Promise<{
  isLoggedIn: boolean
  role: string | null
  permissions: string[]
  sid: string | null
} | null> {
  try {
    const raw = req.cookies.get(accessTokenCookieName())?.value
    if (!raw) return null
    const jwt = await decryptAccessTokenFromCookie(raw)
    if (!jwt) return null
    const { payload } = await jwtVerify(jwt, getAccessSecret(), { algorithms: ["HS256"] })
    const role = typeof payload.role === "string" ? payload.role : null
    const permissions = Array.isArray(payload.permissions) ? (payload.permissions as string[]) : []
    const sid = typeof (payload as any).sid === "string" ? (payload as any).sid as string : null
    return { isLoggedIn: true, role, permissions, sid }
  } catch {
    return null
  }
}

async function validateSessionFromMiddleware(req: NextRequest): Promise<boolean> {
  try {
    const validateUrl = new URL("/api/auth/validate-session", req.url)
    const res = await fetch(validateUrl.toString(), {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    // Network error or timeout — fail open to avoid locking out users during transient errors.
    return true
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://placehold.co https://images.unsplash.com https://picsum.photos;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://api.provider.com;
    worker-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, " ").trim()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", cspHeader)

  const { nextUrl } = req
  const pathname = nextUrl.pathname

  const isMerchantRoute = pathname.startsWith("/merchant")
  const isAdminRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/maker") ||
    pathname.startsWith("/checker") ||
    pathname.startsWith("/head-office")

  // Routes reachable without a session, listed by path only.
  // blanket `searchParams.has("token")` clause: magic links are opaque /l/<token>
  // paths now (see generate*Link in lib/notifications.ts), and the two pages that
  // still take ?token= are named explicitly below. A query-param exemption would
  // let any URL skip the session-revocation check and page-level RBAC further down.
  const isAuthExemptRoute =
    pathname === "/merchant/review-update" ||
    pathname === "/merchant/setup-password" ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/l/")

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/l/")

  const auth = await resolveUserFromRequest(req)
  let isLoggedIn = auth?.isLoggedIn ?? false
  const userRole = auth?.role ?? null
  const userPermissions = auth?.permissions ?? []
  const userSid = auth?.sid ?? null

  // Validate the ActiveSession in the DB for every protected page navigation.
  // This ensures that when a session is revoked (e.g. concurrent login limit reached),
  // the old device is blocked from navigating even before its JWT expires.
  // SALES users have no ActiveSession; tokens without sid are legacy — both skip this check.
  if (isLoggedIn && userSid && !isAuthExemptRoute) {
    const sessionValid = await validateSessionFromMiddleware(req)
    if (!sessionValid) {
      isLoggedIn = false
    }
  }

  // Helpers for building redirect responses with security headers.
  function redirect(url: string) {
    const res = NextResponse.redirect(new URL(url, req.url))
    res.headers.set("Content-Security-Policy", cspHeader)
    res.headers.set("X-Frame-Options", "DENY")
    return res
  }

  if (isAdminRoute && !isLoggedIn && !isAuthExemptRoute) {
    if (pathname === "/login") return
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return redirect("/login")
  }

  if (isMerchantRoute && !isLoggedIn && !isAuthExemptRoute) {
    if (pathname === "/login/merchant") return
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const loginUrl = new URL("/login/merchant", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    const res = NextResponse.redirect(loginUrl)
    res.headers.set("Content-Security-Policy", cspHeader)
    res.headers.set("X-Frame-Options", "DENY")
    return res
  }

  if (!isLoggedIn && !isAuthRoute && !isAuthExemptRoute) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return redirect("/login")
  }

  if (isLoggedIn) {
    if (isAuthExemptRoute) {
      const res = NextResponse.next({ request: { headers: requestHeaders } })
      res.headers.set("Content-Security-Policy", cspHeader)
      res.headers.set("X-Frame-Options", "DENY")
      return res
    }

    const getAdminLandingPath = () => {
      if (userPermissions.includes("DASHBOARD_VIEW")) return "/admin"
      if (userPermissions.includes("MERCHANT_REGISTER")) return "/admin/onboarding"
      if (userPermissions.includes("MERCHANT_APPROVE")) return "/admin/review"
      if (userPermissions.includes("USER_CREATE")) return "/admin/users"
      if (userPermissions.includes("ROLE_CREATE")) return "/admin/roles"
      if (userPermissions.includes("CONFIGURATION_MANAGE")) return "/admin/configuration"
      if (userPermissions.includes("AUDIT_LOG_VIEW")) return "/admin/audit-logs"
      if (
        userPermissions.includes("payment.reconciliation.view") ||
        userPermissions.includes("payment.reconciliation.manage") ||
        userPermissions.includes("cashback.reconciliation.view") ||
        userPermissions.includes("cashback.reconciliation.manage")
      ) return "/admin/reconciliation"
      return null
    }

    if (pathname === "/login" || pathname === "/login/merchant" || pathname === "/") {
      if (userRole === "MERCHANT" || userRole === "SALES") {
        return redirect("/merchant")
      }
      const landing = getAdminLandingPath()
      if (landing) return redirect(landing)
      return
    }

    if (isAdminRoute) {
      const hasAdminAccess =
        userPermissions.includes("DASHBOARD_VIEW") ||
        userPermissions.includes("MERCHANT_REGISTER") ||
        userPermissions.includes("MERCHANT_APPROVE") ||
        userPermissions.includes("USER_CREATE") ||
        userPermissions.includes("ROLE_CREATE") ||
        userPermissions.includes("CONFIGURATION_MANAGE") ||
        userPermissions.includes("AUDIT_LOG_VIEW") ||
        userRole === "ADMIN" ||
        userRole === "MAKER" ||
        userRole === "CHECKER" ||
        userRole === "HEAD_OFFICE"

      if (!hasAdminAccess) {
        return redirect(userRole === "MERCHANT" || userRole === "SALES" ? "/merchant" : "/login")
      }

      if (pathname === "/admin" && !userPermissions.includes("DASHBOARD_VIEW")) {
        const landing = getAdminLandingPath()
        if (landing && landing !== "/admin") return redirect(landing)
        return redirect("/login")
      }

      const permissionChecks: [string, string][] = [
        ["/admin/onboarding", "MERCHANT_REGISTER"],
        ["/admin/review", "MERCHANT_APPROVE"],
        ["/admin/users", "USER_CREATE"],
        ["/admin/roles", "ROLE_CREATE"],
        ["/admin/configuration", "CONFIGURATION_MANAGE"],
        ["/admin/audit-logs", "AUDIT_LOG_VIEW"],
      ]

      for (const [prefix, perm] of permissionChecks) {
        if (pathname.startsWith(prefix) && !userPermissions.includes(perm)) {
          const landing = getAdminLandingPath()
          return redirect(landing ?? "/admin")
        }
      }
    }

    if (isMerchantRoute && userRole !== "MERCHANT" && userRole !== "SALES") {
      const landing = getAdminLandingPath()
      return redirect(landing ?? "/login")
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  const isStaticAsset =
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|json|map)$/.test(pathname) ||
    pathname.startsWith("/_next/")
  if (!isStaticAsset) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
  }

  response.headers.set("Content-Security-Policy", cspHeader)
  response.headers.set("X-Frame-Options", "DENY")
  return response
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|json|map)).*)",
  ],
}
