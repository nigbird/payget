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
    pathname === "/merchant/setup-password"

  if (isAdminRoute && !isLoggedIn && !isAuthExemptRoute) {
    return Response.redirect(new URL("/login", req.url))
  }

  if (isMerchantRoute && !isLoggedIn && !isAuthExemptRoute) {
    const loginUrl = new URL("/login/merchant", req.url)
    // Add callbackUrl so NextAuth knows where to redirect after login
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return Response.redirect(loginUrl)
  }

  if (isLoggedIn) {
    // If user is logged in, they shouldn't be accessing setup/review-update links
    // unless they logout first, but we can allow it for flexibility or redirect them.
    // For now, let's just make sure they can access them if they have the link.
    if (isAuthExemptRoute) return
    const userPermissions = user?.permissions || []
    const userRole = user?.role

    const getAdminLandingPath = () => {
      if (userPermissions.includes("DASHBOARD_GLOBAL_VIEW")) return "/admin"
      if (userPermissions.includes("MERCHANT_REGISTER")) return "/admin/onboarding"
      if (userPermissions.includes("MERCHANT_APPROVE")) return "/admin/review"
      if (userPermissions.includes("USER_CREATE")) return "/admin/users"
      if (userPermissions.includes("ROLE_CREATE")) return "/admin/roles"
      return null
    }

    if (pathname === "/login" || pathname === "/login/merchant" || pathname === "/") {
      if (userRole === "MERCHANT" || userRole === "SALES") {
        return Response.redirect(new URL("/merchant", req.url))
      } else {
        const landing = getAdminLandingPath() || "/admin"
        return Response.redirect(new URL(landing, req.url))
      }
    }

    // Admin routes require admin-level permissions or roles
    if (isAdminRoute) {
      const hasAdminAccess = 
        userPermissions.includes('DASHBOARD_GLOBAL_VIEW') || 
        userPermissions.includes('MERCHANT_REGISTER') || 
        userPermissions.includes('MERCHANT_APPROVE') ||
        userRole === 'ADMIN' || userRole === 'MAKER' || userRole === 'CHECKER' || userRole === 'HEAD_OFFICE'
      
      if (!hasAdminAccess) {
        // Don't send non-admin users to the global dashboard.
        // Default to merchant portal if applicable, otherwise home.
        return Response.redirect(new URL(userRole === "MERCHANT" || userRole === "SALES" ? "/merchant" : "/login", req.url))
      }

      // Special-case: `/admin` is the global dashboard and requires explicit permission.
      if (pathname === "/admin" && !userPermissions.includes("DASHBOARD_GLOBAL_VIEW")) {
        const landing = getAdminLandingPath()
        if (landing && landing !== "/admin") {
          return Response.redirect(new URL(landing, req.url))
        }
        return Response.redirect(new URL("/login", req.url))
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
