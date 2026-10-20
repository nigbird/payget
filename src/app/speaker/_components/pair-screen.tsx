"use client"

import { useState } from "react"
import { QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NibCard, Screen, TopBar } from "./ui"

function HelpStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FCEBC0] text-xs font-semibold">
        {number}
      </span>
      <span className="text-sm">{children}</span>
    </li>
  )
}

/** Not paired yet: scan the portal's QR with the phone camera, or paste the link. */
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
  const [showHelp, setShowHelp] = useState(false)

  return (
    <Screen>
      <TopBar title="Nibtera Speaker" />
      <div className="mx-auto flex max-w-xl flex-col items-center px-5 pb-10 pt-6 text-center">
        <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[#F8B513]/20">
          <QrCode className="h-12 w-12 text-[#754319]" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">Pair this phone</h2>
        <p className="mt-2 px-2 text-[15px] text-[#8A7565]">
          Scan the QR code from the merchant portal with this phone&apos;s camera to start announcing payments.
        </p>

        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="mt-5 text-sm font-semibold text-[#754319]"
        >
          {showHelp ? "Hide steps" : "How to pair"}
        </button>
        {showHelp && (
          <NibCard className="mt-3 w-full text-left">
            <ol className="space-y-3 p-4">
              <HelpStep number={1}>Open the Nibtera merchant portal on a computer.</HelpStep>
              <HelpStep number={2}>Go to Configuration → Sound Devices.</HelpStep>
              <HelpStep number={3}>Add a device. A QR code appears.</HelpStep>
              <HelpStep number={4}>
                Scan it with this phone&apos;s camera and open the link. On Android it opens in this app once
                it&apos;s installed.
              </HelpStep>
            </ol>
          </NibCard>
        )}

        <div className="my-6 flex w-full items-center gap-3 text-xs text-[#8A7565]">
          <span className="h-px flex-1 bg-[#EDE2CF]" />
          or
          <span className="h-px flex-1 bg-[#EDE2CF]" />
        </div>

        <NibCard className="w-full text-left">
          <form
            className="space-y-2 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (link.trim()) onPair(link)
            }}
          >
            <label htmlFor="pairing-link" className="text-sm font-medium text-[#8A7565]">
              Paste the pairing link
            </label>
            <Input
              id="pairing-link"
              value={link}
              onChange={(event) => {
                setLink(event.target.value)
                onClearError()
              }}
              placeholder="https://…/speaker#t=…"
              autoComplete="off"
              inputMode="url"
              className="h-12 border-[#EDE2CF] bg-white"
            />
            <div className="flex justify-end">
              <Button type="submit" variant="ghost" disabled={!link.trim()} className="font-semibold text-[#754319]">
                Pair with link
              </Button>
            </div>
          </form>
        </NibCard>
        {error && <p className="mt-4 text-sm text-[#C62828]">{error}</p>}

        {install && <div className="mt-8 w-full">{install}</div>}
      </div>
    </Screen>
  )
}
