"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MAX_PIN, MIN_PIN, checkPin, setPin } from "@/lib/speaker-pin"
import { MUTED, OUTLINE_BUTTON, PRIMARY_BUTTON, Screen, TopBar } from "./ui"

function PinInput({
  value,
  onChange,
  label,
  invalid,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  invalid?: boolean
  autoFocus?: boolean
}) {
  return (
    <label className="block">
      <span className={`mb-1 block text-sm font-medium ${MUTED}`}>{label}</span>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, MAX_PIN))}
        aria-invalid={invalid}
        className={`h-12 bg-white text-lg tracking-[0.4em] ${invalid ? "border-[#C62828]" : "border-[#eddcc0]"}`}
      />
    </label>
  )
}

function waitText(seconds: number) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

/** Shown while paired without a PIN: right after pairing, and once for speakers paired before PINs existed. */
export function SetPinScreen({ onSaved }: { onSaved: () => void }) {
  const [pin, setPinValue] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (pin.length < MIN_PIN) return setError(`The PIN needs at least ${MIN_PIN} digits.`)
    if (pin !== confirm) return setError("The two PINs are different. Type the same PIN twice.")
    setSaving(true)
    await setPin(pin)
    onSaved()
  }

  return (
    <Screen>
      <TopBar title="Set a PIN" />
      <form
        className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-4 md:mt-12 md:max-w-md md:rounded-3xl md:border md:border-[#eddcc0] md:p-8 md:shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <p className={`text-[15px] ${MUTED}`}>
          {MIN_PIN} to {MAX_PIN} digits. Needed to unpair this phone.
        </p>
        <PinInput
          label="PIN"
          value={pin}
          onChange={(v) => {
            setPinValue(v)
            setError(null)
          }}
          invalid={!!error}
          autoFocus
        />
        <PinInput
          label="Type the PIN again"
          value={confirm}
          onChange={(v) => {
            setConfirm(v)
            setError(null)
          }}
          invalid={!!error}
        />
        {error && <p className="text-sm text-[#C62828]">{error}</p>}
        <Button
          type="submit"
          disabled={!pin || !confirm || saving}
          className={`h-12 text-base font-semibold ${PRIMARY_BUTTON}`}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save PIN
        </Button>
      </form>
    </Screen>
  )
}

/** Asks for the PIN before a protected action; counts wrong tries. */
export function PinDialog({
  title,
  message,
  confirmLabel,
  danger,
  onSuccess,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onSuccess: () => void
  onCancel: () => void
}) {
  const [pin, setPinValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = async () => {
    setChecking(true)
    const result = await checkPin(pin)
    setChecking(false)
    setPinValue("")
    if (result.ok) return onSuccess()
    if ("lockedSeconds" in result) {
      setError(`Too many wrong PINs. Try again in ${waitText(result.lockedSeconds)}.`)
    } else {
      const tries = result.attemptsLeft === 1 ? "try" : "tries"
      setError(`Wrong PIN. ${result.attemptsLeft} more ${tries} before a pause.`)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm rounded-2xl bg-white">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle className="text-[#5b371f]">{title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line text-left">{message}</DialogDescription>
          </DialogHeader>
          <PinInput
            label="PIN"
            value={pin}
            onChange={(v) => {
              setPinValue(v)
              setError(null)
            }}
            invalid={!!error}
            autoFocus
          />
          {error && <p className="text-sm text-[#C62828]">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className={OUTLINE_BUTTON} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pin.length < MIN_PIN || checking}
              className={danger ? "rounded-xl bg-[#C62828] text-white hover:bg-[#A51F1F]" : PRIMARY_BUTTON}
            >
              {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
