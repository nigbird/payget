import { auth } from "@/auth"

export default auth((req) => {
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
    nextUrl.searchParams.has("token"); // If URL has a token, it is a magic link and should be exempt

  const isAuthRoute = 
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/pay/")

  if (isAdminRoute && !isLoggedIn && !isAuthExemptRoute) {
    if (pathname === "/login") return
    return Response.redirect(new URL("/login", req.url))
  }

  if (isMerchantRoute && !isLoggedIn && !isAuthExemptRoute) {
    if (pathname === "/login/merchant") return
    const loginUrl = new URL("/login/merchant", req.url)
    // Add callbackUrl so NextAuth knows where to redirect after login
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return Response.redirect(loginUrl)
  }

  if (!isLoggedIn && !isAuthRoute) {
    // Redirect to login if not authenticated
    return Response.redirect(new URL("/login", req.url))
  }

  // Check if session is expired
  const sessionExpiry = req.cookies.get("next-auth.session-token")?.expires
  if (sessionExpiry && new Date(sessionExpiry) < new Date()) {
    console.warn("Session expired. Redirecting to login.")
    return Response.redirect(new URL("/login", req.url))
  }

  if (isLoggedIn) {
    // If user is logged in, they shouldn't be accessing setup/review-update links
    // unless they logout first, but we can allow it for flexibility or redirect them.
    // For now, let's just make sure they can access them if they have the link.
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
        // If logged in as admin but no specific landing found, 
        // only redirect to /admin if they have dashboard view permission
        if (userPermissions.includes("DASHBOARD_VIEW") && pathname !== "/admin") {
          return Response.redirect(new URL("/admin", req.url))
        }
        // Otherwise, don't redirect to avoid potential loops
        return
      }
    }

    // Admin routes require admin-level permissions or roles
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
        // Don't send non-admin users to the global dashboard.
        // Default to merchant portal if applicable, otherwise home.
        return Response.redirect(new URL(userRole === "MERCHANT" || userRole === "SALES" ? "/merchant" : "/login", req.url))
      }

      // Special-case: `/admin` is the global dashboard and requires explicit permission.
      if (pathname === "/admin" && !userPermissions.includes("DASHBOARD_VIEW")) {
        const landing = getAdminLandingPath()
        if (landing && landing !== "/admin") {
          return Response.redirect(new URL(landing, req.url))
        }
        return Response.redirect(new URL("/login", req.url))
      }

      // Special-case: `/admin/configuration` requires explicit permission.
      if (pathname.startsWith("/admin/configuration") && !userPermissions.includes("CONFIGURATION_MANAGE")) {
        const landing = getAdminLandingPath()
        if (landing) {
          return Response.redirect(new URL(landing, req.url))
        }
        return Response.redirect(new URL("/admin", req.url))
      }

      // Special-case: `/admin/audit-logs` requires explicit permission.
      if (pathname.startsWith("/admin/audit-logs") && !userPermissions.includes("AUDIT_LOG_VIEW")) {
        const landing = getAdminLandingPath()
        if (landing) {
          return Response.redirect(new URL(landing, req.url))
        }
        return Response.redirect(new URL("/admin", req.url))
      }
    }

    // Merchant routes require MERCHANT or SALES role
    if (isMerchantRoute && userRole !== 'MERCHANT' && userRole !== 'SALES') {
      // Don't redirect to the global admin dashboard unless permitted.
      const landing = getAdminLandingPath()
      if (landing) return Response.redirect(new URL(landing, req.url))
      return Response.redirect(new URL("/login", req.url))
    }
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|json|map)).*)"],
}
