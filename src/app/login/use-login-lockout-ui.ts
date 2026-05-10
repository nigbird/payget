"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { normalizeLoginIdentifierForLockout } from "@/lib/login-identifier-normalize"
import {
  formatLockoutCountdown,
  parseLockoutFromSignInResult,
  type ParsedCredentialsLockout,
} from "@/lib/login-lockout-ui"

export function useLoginLockoutUi() {
  const [tick, setTick] = useState(0)
  const [ipCooldownUntil, setIpCooldownUntil] = useState<number | null>(null)
  const [identCooldownUntil, setIdentCooldownUntil] = useState<number | null>(null)
  const [identCooldownKey, setIdentCooldownKey] = useState<string | null>(null)
  const [identInline, setIdentInline] = useState<string | null>(null)
  const [ipBanner, setIpBanner] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const now = Date.now()
    if (ipCooldownUntil !== null && now >= ipCooldownUntil) {
      setIpCooldownUntil(null)
      setIpBanner(null)
    }
    if (identCooldownUntil !== null && now >= identCooldownUntil) {
      setIdentCooldownUntil(null)
      setIdentCooldownKey(null)
      setIdentInline(null)
    }
  }, [tick, ipCooldownUntil, identCooldownUntil])

  const ipSecondsLeft = useMemo(() => {
    if (!ipCooldownUntil) return 0
    return Math.max(0, Math.ceil((ipCooldownUntil - Date.now()) / 1000))
  }, [ipCooldownUntil, tick])

  const identSecondsLeftFor = useCallback(
    (identifier: string) => {
      const nk = normalizeLoginIdentifierForLockout(identifier)
      if (!identCooldownUntil || identCooldownKey !== nk) return 0
      return Math.max(0, Math.ceil((identCooldownUntil - Date.now()) / 1000))
    },
    [identCooldownUntil, identCooldownKey, tick]
  )

  const applyLockoutFromSignInResult = useCallback(
    (
      result: { code?: string | null; error?: string | null },
      currentIdentifier: string
    ): ParsedCredentialsLockout | null => {
      const parsed = parseLockoutFromSignInResult(result)
      if (!parsed) return null
      const nk = normalizeLoginIdentifierForLockout(currentIdentifier)
      const until = Date.now() + parsed.retryAfterSeconds * 1000
      if (parsed.kind === "ip") {
        setIpCooldownUntil(until)
        setIpBanner(
          `Too many failed attempts from this network. Try again in ${formatLockoutCountdown(parsed.retryAfterSeconds)}.`
        )
      } else {
        setIdentCooldownUntil(until)
        setIdentCooldownKey(nk)
        setIdentInline(
          `Too many failed attempts for this login. Try again in ${formatLockoutCountdown(parsed.retryAfterSeconds)}.`
        )
      }
      return parsed
    },
    []
  )

  const onIdentifierFieldChange = useCallback(
    (nextIdentifier: string) => {
      const nk = normalizeLoginIdentifierForLockout(nextIdentifier)
      if (identCooldownKey !== null && nk !== identCooldownKey) {
        setIdentCooldownUntil(null)
        setIdentCooldownKey(null)
        setIdentInline(null)
      }
    },
    [identCooldownKey]
  )

  const submitBlockedFor = useCallback(
    (identifier: string) => ipSecondsLeft > 0 || identSecondsLeftFor(identifier) > 0,
    [ipSecondsLeft, identSecondsLeftFor]
  )

  return {
    ipSecondsLeft,
    identSecondsLeftFor,
    submitBlockedFor,
    identInline,
    ipBanner,
    applyLockoutFromSignInResult,
    onIdentifierFieldChange,
  }
}
