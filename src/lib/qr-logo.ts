"use client"

import { useEffect, useMemo, useState } from "react"

export function resolveAbsoluteImageUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("/")) {
    if (typeof window !== "undefined") return `${window.location.origin}${url}`
    return url
  }
  if (typeof window !== "undefined") return `${window.location.origin}/${url}`
  return url
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(resolveAbsoluteImageUrl(url), { credentials: "include" })
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Preload logo for qrcode.react (avoids CORS/tainted-canvas issues with API-hosted images). */
export function useQrLogoImageSettings(logoSrc: string | null | undefined) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!logoSrc) {
      setDataUrl(null)
      return
    }

    let cancelled = false
    fetchImageAsDataUrl(logoSrc).then((result) => {
      if (!cancelled) setDataUrl(result)
    })

    return () => {
      cancelled = true
    }
  }, [logoSrc])

  return useMemo(() => {
    if (!dataUrl) return undefined
    return {
      src: dataUrl,
      height: 40,
      width: 40,
      excavate: true as const,
    }
  }, [dataUrl])
}
