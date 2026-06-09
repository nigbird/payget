"use client"

import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function isRunningAsInstalledPWA(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && (window.navigator as any).standalone === true)
  )
}

export function PWAInstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    setIsInstalled(isRunningAsInstalledPWA())

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }

    const installedHandler = () => {
      setIsInstalled(true)
      setInstallEvent(null)
      setShowGuide(false)
    }

    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", installedHandler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [])

  // Don't render on server or if already installed
  if (!isMounted || isInstalled) return null

  const handleClick = async () => {
    if (installEvent) {
      // Native browser install prompt is available — use it directly
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === "accepted") {
        setInstallEvent(null)
        setShowGuide(false)
      }
    } else {
      // No native prompt yet — show manual instructions
      setShowGuide((prev) => !prev)
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        className="h-11 min-h-11 gap-2 rounded-xl px-2 text-[#754319] hover:bg-amber-50 hover:text-[#754319] md:px-3"
        title="Install App"
      >
        <Download className="h-4 w-4" />
        <span className="hidden md:inline text-sm font-semibold">Install App</span>
      </Button>

      {showGuide && (
        <div className="absolute right-0 top-14 z-50 w-72 rounded-2xl border border-amber-100 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-[#5b371f]">Install NibTeraMerchant</p>
            <button
              onClick={() => setShowGuide(false)}
              className="shrink-0 rounded-lg p-0.5 text-[#754319]/50 hover:text-[#754319]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-xs text-[#754319]/70">
            {/* Android Chrome */}
            <p className="font-medium text-[#754319]">On Android (Chrome):</p>
            <p>Tap the <span className="font-semibold">⋮ menu</span> → <span className="font-semibold">"Add to Home screen"</span></p>

            {/* iOS Safari */}
            <p className="mt-2 font-medium text-[#754319]">On iPhone / iPad (Safari):</p>
            <p>Tap the <span className="font-semibold">Share ⬆ button</span> → <span className="font-semibold">"Add to Home Screen"</span></p>
          </div>
        </div>
      )}
    </div>
  )
}
