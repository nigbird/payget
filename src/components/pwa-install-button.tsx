"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PWAInstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }

    const installedHandler = () => {
      setInstalled(true)
      setInstallEvent(null)
    }

    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", installedHandler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [])

  if (!installEvent || installed) return null

  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === "accepted") {
      setInstallEvent(null)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleInstall}
      className="h-11 min-h-11 gap-2 rounded-xl px-2 text-[#754319] hover:bg-amber-50 hover:text-[#754319] md:px-3"
      title="Install App"
    >
      <Download className="h-4 w-4" />
      <span className="hidden md:inline text-sm font-semibold">Install App</span>
    </Button>
  )
}
