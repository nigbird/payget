import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://placehold.co https://images.unsplash.com https://picsum.photos;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://api.provider.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', cspHeader)

  const isLoggedIn = !!req.auth
  const { nextUrl } = req
  const user = req.auth?.user as any
  const pathname = nextUrl.pathname
  
  const isMerchantRoute = nextUrl.pathname.startsWith("/merchant")
  const isAdminRoute = 
    nextUrl.pathname.startsWith("/admin") ||
    nextUrl.pathname.startsWith("/maker") ||
    nextUrl.pathname.startsWith("/checker") ||
    nextUrl.pathname.startsWith("/head-office")

  const isAuthExemptRoute =
    pathname === "/merchant/review-update" ||
    pathname === "/merchant/setup-password" ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/l/") ||
    nextUrl.searchParams.has("token");

  const isAuthRoute = 
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/l/")

  if (isAdminRoute && !isLoggedIn && !isAuthExemptRoute) {
    if (pathname === "/login") return
    return Response.redirect(new URL("/login", req.url))
  }

  if (isMerchantRoute && !isLoggedIn && !isAuthExemptRoute) {
    if (pathname === "/login/merchant") return
    const loginUrl = new URL("/login/merchant", req.url)
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return Response.redirect(loginUrl)
  }

  if (!isLoggedIn && !isAuthRoute) {
    return Response.redirect(new URL("/login", req.url))
  }

  const sessionExpiry = req.cookies.get("next-auth.session-token")?.expires
  if (sessionExpiry && new Date(sessionExpiry) < new Date()) {
    console.warn("Session expired. Redirecting to login.")
    return Response.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn) {
    if (isAuthExemptRoute) return
    const userPermissions = user?.permissions || []
    const userRole = user?.role

    const getAdminLandingPath = () => {
      if (userPermissions.includes("DASHBOARD_VIEW")) return "/admin"
      if (userPermissions.includes("MERCHANT_REGISTER")) return "/admin/onboarding"
      if (userPermissions.includes("MERCHANT_APPROVE")) return "/admin/review"
      if (userPermissions.includes("USER_CREATE")) return "/admin/users"
      if (userPermissions.includes("ROLE_CREATE")) return "/admin/roles"
      if (userPermissions.includes("CONFIGURATION_MANAGE")) return "/admin/configuration"
      if (userPermissions.includes("AUDIT_LOG_VIEW")) return "/admin/audit-logs"
      return null
    }

    if (pathname === "/login" || pathname === "/login/merchant" || pathname === "/") {
      if (userRole === "MERCHANT" || userRole === "SALES") {
        if (pathname === "/merchant") return
        return Response.redirect(new URL("/merchant", req.url))
      } else {
        const landing = getAdminLandingPath()
        if (landing && landing !== pathname) {
          return Response.redirect(new URL(landing, req.url))
        }
        if (userPermissions.includes("DASHBOARD_VIEW") && pathname !== "/admin") {
          return Response.redirect(new URL("/admin", req.url))
        }
        return
      }
    }

    if (isAdminRoute) {
      const hasAdminAccess = 
        userPermissions.includes('DASHBOARD_VIEW') || 
        userPermissions.includes('MERCHANT_REGISTER') || 
        userPermissions.includes('MERCHANT_APPROVE') ||
        userPermissions.includes('USER_CREATE') ||
        userPermissions.includes('ROLE_CREATE') ||
        userPermissions.includes('CONFIGURATION_MANAGE') ||
        userPermissions.includes('AUDIT_LOG_VIEW') ||
        userRole === 'ADMIN' || userRole === 'MAKER' || userRole === 'CHECKER' || userRole === 'HEAD_OFFICE'
      
      if (!hasAdminAccess) {
        return Response.redirect(new URL(userRole === "MERCHANT" || userRole === "SALES" ? "/merchant" : "/login", req.url))
      }

      if (pathname === "/admin" && !userPermissions.includes("DASHBOARD_VIEW")) {
        const landing = getAdminLandingPath()
        if (landing && landing !== "/admin") {
          return Response.redirect(new URL(landing, req.url))
        }
        return Response.redirect(new URL("/login", req.url))
      }

      if (pathname.startsWith("/admin/onboarding") && !userPermissions.includes("MERCHANT_REGISTER")) {
        const landing = getAdminLandingPath()
        if (landing) return Response.redirect(new URL(landing, req.url))
        return Response.redirect(new URL("/admin", req.url))
      }

      if (pathname.startsWith("/admin/review") && !userPermissions.includes("MERCHANT_APPROVE")) {
        const landing = getAdminLandingPath()
        if (landing) return Response.redirect(new URL(landing, req.url))
        return Response.redirect(new URL("/admin", req.url))
      }

      if (pathname.startsWith("/admin/users") && !userPermissions.includes("USER_CREATE")) {
        const landing = getAdminLandingPath()
        if (landing) return Response.redirect(new URL(landing, req.url))
        return Response.redirect(new URL("/admin", req.url))
      }

      if (pathname.startsWith("/admin/roles") && !userPermissions.includes("ROLE_CREATE")) {
        const landing = getAdminLandingPath()
        if (landing) return Response.redirect(new URL(landing, req.url))
        return Response.redirect(new URL("/admin", req.url))
      }

      if (pathname.startsWith("/admin/configuration") && !userPermissions.includes("CONFIGURATION_MANAGE")) {
        const landing = getAdminLandingPath()
        if (landing) return Response.redirect(new URL(landing, req.url))
        return Response.redirect(new URL("/admin", req.url))
      }

      if (pathname.startsWith("/admin/audit-logs") && !userPermissions.includes("AUDIT_LOG_VIEW")) {
        const landing = getAdminLandingPath()
        if (landing) return Response.redirect(new URL(landing, req.url))
        return Response.redirect(new URL("/admin", req.url))
      }
    }

    if (isMerchantRoute && userRole !== 'MERCHANT' && userRole !== 'SALES') {
      const landing = getAdminLandingPath()
      if (landing) return Response.redirect(new URL(landing, req.url))
      return Response.redirect(new URL("/login", req.url))
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Prevent caching of sensitive content
  const isStaticAsset = pathname.match(/\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|json|map)$/) || pathname.startsWith('/_next/')
  if (!isStaticAsset) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }

  response.headers.set('Content-Security-Policy', cspHeader)
  return response
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|json|map)).*)"],
}