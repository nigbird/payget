"use client"

import { useState } from "react"
import { QrCode, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { QrScanner } from "./qr-scanner"
import { MUTED, NibCard, OUTLINE_BUTTON, PRIMARY_BUTTON, Screen, TopBar } from "./ui"

/** Not paired yet: scan the portal's QR code, or paste the link. */
export function PairScreen({
  onPair,
  error,
  onClearError,
  install,
}: {
  onPair: (link: string) => void
  error: string | null
  onClearError: () => void
  /** Install button / hint, when the speaker isn't installed as an app yet. */
  install: React.ReactNode
}) {
  const [link, setLink] = useState("")
  const [scanning, setScanning] = useState(false)
  const onScanned = (text: string) => {
    setScanning(false)
    onPair(text)
  }

  if (scanning) return <QrScanner onScanned={onScanned} onClose={() => setScanning(false)} />

  return (
    <Screen>
      <TopBar title="Nibtera Speaker" />
      <div className="mx-auto flex max-w-xl flex-col items-center px-5 pb-10 pt-8 text-center md:mt-12 md:max-w-md md:rounded-3xl md:border md:border-[#eddcc0] md:p-8 md:shadow-xs">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-[#f8b513]/25 to-[#754319]/15">
          <QrCode className="h-11 w-11 text-[#754319]" />
        </div>
        <h2 className="mt-5 text-2xl font-bold">Pair this device</h2>
        <p className={`mt-2 text-[15px] ${MUTED}`}>
          Scan the QR code in the merchant portal under Configuration → Sound Devices.
        </p>
        <Button
          onClick={() => {
            onClearError()
            setScanning(true)
          }}
          className={`mt-6 h-12 w-full text-base font-semibold ${PRIMARY_BUTTON}`}
        >
          <ScanLine className="mr-2 h-5 w-5" /> Scan QR code
        </Button>

        <div className={`my-6 flex w-full items-center gap-3 text-xs ${MUTED}`}>
          <span className="h-px flex-1 bg-[#eddcc0]" />
          or paste the link
          <span className="h-px flex-1 bg-[#eddcc0]" />
        </div>

        {/* On larger screens the whole screen is already a card: no card inside it. */}
        <NibCard className="w-full md:border-0 md:shadow-none">
          <form
            className="flex flex-col gap-3 p-4 md:p-0"
            onSubmit={(event) => {
              event.preventDefault()
              if (link.trim()) onPair(link)
            }}
          >
            <Input
              value={link}
              onChange={(event) => {
                setLink(event.target.value)
                onClearError()
              }}
              placeholder="https://…/speaker#t=…"
              aria-label="Pairing link"
              autoComplete="off"
              inputMode="url"
              className="h-12 border-[#eddcc0] bg-white"
            />
            <Button type="submit" variant="outline" disabled={!link.trim()} className={`h-12 text-base font-semibold ${OUTLINE_BUTTON}`}>
              Pair with link
            </Button>
          </form>
        </NibCard>
        {error && <p className="mt-4 text-sm text-[#C62828]">{error}</p>}

        {install && <div className="mt-8 w-full">{install}</div>}
      </div>
    </Screen>
  )
}
