"use client"

// Replaces the old NextAuth safeCredentialsSignIn wrapper.
// All auth flows now go through the custom JWT endpoints.

export type LoginResult = {
  ok: boolean
  error?: string
  code?: string
  retryAfterSeconds?: number
  user?: Record<string, unknown>
}

export async function loginWithCredentials(params: {
  identifier: string
  password: string
  portal: "admin" | "merchant"
}): Promise<LoginResult> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier: params.identifier, password: params.password, portal: params.portal }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return { ok: true, user: data.user }
    }

    // Translate API lockout codes to the LOCKOUT_IP_<sec> / LOCKOUT_IDENT_<sec> format
    // that parseLockoutFromCredentialsCode (login-lockout-ui.ts) understands.
    let code: string | undefined = data.code
    if (data.retryAfterSeconds && code) {
      if (code === "IP_LOCKOUT") code = `LOCKOUT_IP_${data.retryAfterSeconds}`
      else if (code === "IDENTIFIER_LOCKOUT") code = `LOCKOUT_IDENT_${data.retryAfterSeconds}`
    }

    return {
      ok: false,
      error: data.error ?? "Login failed",
      code,
      retryAfterSeconds: data.retryAfterSeconds,
    }
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." }
  }
}

export async function loginWithSalesOtp(params: {
  phone: string
  otp: string
  merchantId?: string
}): Promise<LoginResult> {
  try {
    const res = await fetch("/api/auth/login/sales-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone: params.phone, otp: params.otp, merchantId: params.merchantId }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return { ok: true, user: data.user }
    }
    return {
      ok: false,
      error: data.error ?? "OTP login failed",
      code: data.code,
    }
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." }
  }
}
