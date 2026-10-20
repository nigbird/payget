"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { PaymentSound } from "@/lib/payment-announcer"
import type { SpeakerSettings } from "@/lib/speaker-settings"
import { InfoRow, MUTED, OUTLINE_BUTTON, PRIMARY_BUTTON, Screen, SectionTitle, SwitchRow, TopBar } from "./ui"

const SOUND_OPTIONS: { value: PaymentSound; title: string }[] = [
  { value: "chime", title: "Chime, then the amount" },
  { value: "none", title: "Amount only" },
]

/** A settings group: plain on phones, a card on larger screens. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-[#eddcc0] py-5 first:pt-0 last:border-0 md:rounded-2xl md:border md:bg-white md:p-6 md:shadow-sm md:first:pt-6 md:last:border">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
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
  onChangePin: () => void
  onUnpair: () => void
  onBack: () => void
}) {
  return (
    <Screen>
      <TopBar
        title="Settings"
        left={
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="text-white hover:bg-white/15 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
      />
      <div className="mx-auto max-w-xl px-6 pb-12 pt-4 md:max-w-2xl md:space-y-5 md:px-5 md:pt-6 lg:grid lg:max-w-6xl lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0 lg:px-6 lg:pt-8">
        <Section title="Sound">
        <RadioGroup
          value={settings.paymentSound}
          onValueChange={(value) => onChange({ paymentSound: value as PaymentSound })}
          className="gap-2"
        >
          {SOUND_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-3">
              <RadioGroupItem value={option.value} className="border-[#754319] text-[#754319]" />
              <span className="text-[15px]">{option.title}</span>
            </label>
          ))}
        </RadioGroup>

        <SwitchRow
          title="Chime only"
          description="Don't say the amount"
          checked={settings.soundOnly}
          onChange={(soundOnly) => onChange({ soundOnly })}
          disabled={settings.paymentSound === "none"}
        />
        <SwitchRow
          title="Warn when offline"
          description="Beep if the connection is lost"
          checked={settings.offlineWarning}
          onChange={(offlineWarning) => onChange({ offlineWarning })}
        />
        <SwitchRow
          title="Notifications"
          description="A notification for each payment"
          checked={settings.paymentNotifications}
          onChange={onTogglePaymentNotifications}
          disabled={!notificationsAvailable}
        />
        {voice && <p className={`text-xs ${MUTED}`}>Voice: {voice}</p>}

        <Button onClick={onTestSound} className={`mt-1 h-12 text-base font-semibold ${PRIMARY_BUTTON}`}>
          Test sound
        </Button>
        </Section>

        <div className="md:space-y-5 lg:space-y-6">
        <Section title="Setup">{setup}</Section>

        <Section title="Paired to">
        <InfoRow label="Merchant" value={merchantName} />
        <InfoRow label="Device" value={deviceName} />

        <div className="mt-2 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onChangePin} className={`h-11 ${OUTLINE_BUTTON}`}>
            Change PIN
          </Button>
          <Button
            variant="outline"
            onClick={onUnpair}
            className="h-11 rounded-xl border-[#F5C6C0] bg-white text-[#C62828] hover:bg-[#FDECEA] hover:text-[#C62828]"
          >
            Unpair
          </Button>
        </div>
        </Section>
        </div>
      </div>
    </Screen>
  )
}
