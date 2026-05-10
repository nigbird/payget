"use client"

import { signIn } from "next-auth/react"

export type SafeSignInResult = {
  error: string | undefined
  code: string | undefined
  status: number
  ok: boolean
  url: string | null
}

/**
 * Wraps next-auth `signIn` so failures never reject (the library can throw when
 * parsing relative redirect URLs). Maps thrown errors to a CredentialsSignin-shaped result.
 */
export async function safeCredentialsSignIn(
  ...args: Parameters<typeof signIn>
): Promise<SafeSignInResult | undefined> {
  try {
    const r = await signIn(...args)
    if (r === undefined) {
      return undefined
    }
    return r as SafeSignInResult
  } catch (e) {
    console.error("[safeCredentialsSignIn]", e)
    return {
      error: "CredentialsSignin",
      code: "credentials",
      status: 500,
      ok: false,
      url: null,
    }
  }
}
