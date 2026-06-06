"use client"

import { SessionProvider } from "next-auth/react"
import { Session } from "next-auth"

export function AuthSessionProvider({ 
  children,
  session 
}: { 
  children: React.ReactNode,
  session?: Session | null
}) {
  return (
    <SessionProvider
      session={session}
      refetchInterval={0} // Disable aggressive automatic refetching; SessionWatcher handles controlled updates
      refetchOnWindowFocus
    >
      {children}
    </SessionProvider>
  )
}
