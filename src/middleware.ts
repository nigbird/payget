import { auth } from "@/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { nextUrl } = req
  const user = req.auth?.user as any
  
  const isMerchantRoute = nextUrl.pathname.startsWith("/merchant")
  const isAdminRoute = 
    nextUrl.pathname.startsWith("/admin") ||
    nextUrl.pathname.startsWith("/maker") ||
    nextUrl.pathname.startsWith("/checker") ||
    nextUrl.pathname.startsWith("/head-office")

  if ((isMerchantRoute || isAdminRoute) && !isLoggedIn) {
    return Response.redirect(new URL("/", nextUrl))
  }

  if (isLoggedIn) {
    const userPermissions = user?.permissions || []
    const userRole = user?.role

    // Admin routes require admin-level permissions or roles
    if (isAdminRoute) {
      const hasAdminAccess = 
        userPermissions.includes('DASHBOARD_GLOBAL_VIEW') || 
        userPermissions.includes('MERCHANT_REGISTER') || 
        userPermissions.includes('MERCHANT_APPROVE') ||
        userRole === 'ADMIN' || userRole === 'MAKER' || userRole === 'CHECKER' || userRole === 'HEAD_OFFICE'
      
      if (!hasAdminAccess) {
        return Response.redirect(new URL("/merchant", nextUrl))
      }
    }

    // Merchant routes require MERCHANT role
    if (isMerchantRoute && userRole !== 'MERCHANT') {
      return Response.redirect(new URL("/admin", nextUrl))
    }
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
