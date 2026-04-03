import { auth } from "@/auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { nextUrl } = req
  
  const isProtectedRoute = 
    nextUrl.pathname.startsWith("/admin") ||
    nextUrl.pathname.startsWith("/maker") ||
    nextUrl.pathname.startsWith("/checker") ||
    nextUrl.pathname.startsWith("/head-office") ||
    nextUrl.pathname.startsWith("/merchant")

  if (isProtectedRoute && !isLoggedIn) {
    return Response.redirect(new URL("/", nextUrl))
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
