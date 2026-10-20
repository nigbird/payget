"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { PaymentSound } from "@/lib/payment-announcer"
import type { SpeakerSettings } from "@/lib/speaker-settings"
import { InfoRow, Screen, SectionTitle, SwitchRow, TopBar } from "./ui"

const SOUND_OPTIONS: { value: PaymentSound; title: string; subtitle: string }[] = [
  { value: "chime", title: "Nibtera chime", subtitle: "Two short notes" },
  { value: "none", title: "No sound (voice only)", subtitle: "Only the spoken amount" },
]

function Divider() {
  return <hr className="my-3 border-[#EDE2CF]" />
}

export function SettingsScreen({
  settings,
  onChange,
  onTogglePaymentNotifications,
  notificationsAvailable,
  voice,
  onTestSound,
  setup,
  merchantName,
  deviceName,
  host,
  onChangePin,
  onUnpair,
  onBack,
}: {
  settings: SpeakerSettings
  onChange: (patch: Partial<SpeakerSettings>) => void
  onTogglePaymentNotifications: (on: boolean) => void
  /** False where the browser can't receive push (then the switch is disabled). */
  notificationsAvailable: boolean
  voice: string | null
  onTestSound: () => void
  setup: ReactNode
  merchantName: string
  deviceName: string
  host: string
  onChangePin: () => void
  onUnpair: () => void
  onBack: () => void
}) {
  return (
    <Screen>
      <TopBar
        title="Settings"
        left={
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
      />
      <div className="mx-auto flex max-w-xl flex-col gap-3 px-6 pb-12 pt-2">
        <SectionTitle>Sound</SectionTitle>
        <p className="text-sm text-[#8A7565]">
          Announcements play at media volume: use the phone&apos;s volume buttons while this screen is open.
        </p>

        <p className="mt-1 text-sm font-medium">Payment sound</p>
        <RadioGroup
          value={settings.paymentSound}
          onValueChange={(value) => onChange({ paymentSound: value as PaymentSound })}
          className="gap-1"
        >
          {SOUND_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-3 py-1">
              <RadioGroupItem value={option.value} />
              <span>
                <span className="block text-[15px]">{option.title}</span>
                <span className="block text-xs text-[#8A7565]">{option.subtitle}</span>
              </span>
            </label>
          ))}
        </RadioGroup>

        <SwitchRow
          title="Sound only"
          description={
            settings.paymentSound === "none"
              ? 'Not available with "No sound"'
              : "Play the payment sound without speaking the amount"
          }
          checked={settings.soundOnly}
          onChange={(soundOnly) => onChange({ soundOnly })}
          disabled={settings.paymentSound === "none"}
        />
        <SwitchRow
          title="Warn when offline"
          description="Play a warning tone once when the connection has been lost for 30 seconds"
          checked={settings.offlineWarning}
          onChange={(offlineWarning) => onChange({ offlineWarning })}
        />
        <SwitchRow
          title="Payment notifications"
          description={
            notificationsAvailable
              ? "A notification for each payment: silent while this screen announces it, with the phone's sound when the phone has stopped the speaker"
              : "Not available in this browser"
          }
          checked={settings.paymentNotifications && notificationsAvailable}
          onChange={onTogglePaymentNotifications}
          disabled={!notificationsAvailable}
        />

        {voice && <InfoRow label="Voice" value={voice} />}

        <Button
          onClick={onTestSound}
          className="mt-1 h-12 rounded-[14px] bg-[#754319] text-base font-semibold text-white hover:bg-[#5B371F]"
        >
          Test sound
        </Button>

        <Divider />
        <SectionTitle>Keep running with the screen off</SectionTitle>
        {setup}

        <Divider />
        <SectionTitle>Paired to</SectionTitle>
        <InfoRow label="Merchant" value={merchantName} />
        <InfoRow label="Device name" value={deviceName} />
        <InfoRow label="Server" value={host} />

        <Button variant="outline" onClick={onChangePin} className="mt-2 h-11 rounded-[14px] border-[#CDBBA5]">
          Change PIN
        </Button>
        <Button
          variant="outline"
          onClick={onUnpair}
          className="h-11 rounded-[14px] border-[#CDBBA5] text-[#C62828] hover:text-[#C62828]"
        >
          Unpair this phone
        </Button>
      </div>
    </Screen>
  )
}
