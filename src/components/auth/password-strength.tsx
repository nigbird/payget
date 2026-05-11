"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { PASSWORD_POLICY_TEXT, scorePassword, validatePassword } from "@/lib/password-policy"
import { sha1HexUpper } from "@/lib/pwned-password"

type Props = {
  password: string
  className?: string
  showHint?: boolean
}

const barColor = (score: number) => {
  if (score <= 1) return "bg-rose-500"
  if (score === 2) return "bg-amber-500"
  if (score === 3) return "bg-yellow-500"
  return "bg-emerald-500"
}

export function PasswordStrength({ password, className, showHint = true }: Props) {
  const [pwned, setPwned] = useState<{ status: "idle" | "checking" | "safe" | "pwned" | "unavailable"; count?: number }>({
    status: "idle",
  })
  const lastChecked = useRef<string>("")
  const base = useMemo(() => validatePassword(password), [password])
  const strength = useMemo(() => scorePassword(password), [password])
  const value = (strength.score / 4) * 100

  useEffect(() => {
    let cancelled = false
    if (!password) {
      setPwned({ status: "idle" })
      lastChecked.current = ""
      return
    }

    // only run HIBP check once base requirements are met (otherwise we spam requests)
    if (!base.valid) {
      setPwned({ status: "idle" })
      lastChecked.current = ""
      return
    }

    const run = async () => {
      if (lastChecked.current === password) return
      lastChecked.current = password
      setPwned({ status: "checking" })

      try {
        const hash = await sha1HexUpper(password)
        const prefix = hash.slice(0, 5)
        const suffix = hash.slice(5)
        const res = await fetch("/api/security/pwned-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix, suffix }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (data?.unavailable) {
          setPwned({ status: "unavailable" })
          return
        }

        const count = Number(data?.count ?? 0)
        if (Number.isFinite(count) && count > 0) {
          setPwned({ status: "pwned", count })
        } else {
          setPwned({ status: "safe", count: 0 })
        }
      } catch {
        if (!cancelled) setPwned({ status: "unavailable" })
      }
    }

    const t = setTimeout(() => void run(), 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [password, base.valid])

  if (!password) {
    return showHint ? (
      <div className={cn("space-y-1.5", className)}>
        <p className="text-[11px] text-slate-500">{PASSWORD_POLICY_TEXT}</p>
      </div>
    ) : null
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-slate-600">Password strength</span>
        <span
          className={cn(
            "text-[11px] font-semibold",
            strength.score <= 1
              ? "text-rose-600"
              : strength.score === 2
                ? "text-amber-600"
                : strength.score === 3
                  ? "text-yellow-700"
                  : "text-emerald-600"
          )}
        >
          {strength.label}
        </span>
      </div>
      <Progress
        value={value}
        className="h-2 rounded-full bg-slate-100"
        indicatorClassName={barColor(strength.score)}
      />
      {base.errors.length > 0 ? (
        <p className="text-[11px] font-medium text-rose-600">{base.errors[0]}</p>
      ) : null}
      {base.valid ? (
        pwned.status === "checking" ? (
          <p className="text-[11px] text-slate-500">Checking against breached passwords…</p>
        ) : pwned.status === "pwned" ? (
          <p className="text-[11px] font-medium text-rose-600">
            For your security, this password isn’t safe to use. Please choose a different one.
          </p>
        ) : pwned.status === "unavailable" ? (
          <p className="text-[11px] text-slate-500">Breach check unavailable right now.</p>
        ) : null
      ) : null}
      {showHint ? (
        <p className="text-[11px] text-slate-500">{PASSWORD_POLICY_TEXT}</p>
      ) : null}
    </div>
  )
}

