"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NibCard } from "./ui"

/**
 * The steps that keep the speaker alive with the screen off (the web version
 * of the Android app's BackgroundSetup): install it as an app, allow
 * notifications, and stop the phone putting the browser to sleep.
 */

export type SetupState = {
  installed: boolean
  /** Chrome's install prompt is available. */
  canInstall: boolean
  ios: boolean
  /** Phone maker, when the browser tells us (Samsung guide). */
  samsung: boolean
  notifications: "enabled" | "off" | "allow" | "denied" | "unsupported"
  backgroundGuideDone: boolean
}

export function setupComplete(state: SetupState) {
  return state.installed && notificationsDone(state) && state.backgroundGuideDone
}

function notificationsDone(state: SetupState) {
  return state.notifications === "enabled" || state.notifications === "off"
}

type Guide = { title: string; steps: string[]; note?: string }

function installGuide(state: SetupState): Guide {
  if (state.ios) {
    return {
      title: "Install on iPhone",
      steps: [
        "Open this page in Safari.",
        "Tap the Share button (the square with an arrow).",
        "Tap Add to Home Screen, then Add.",
        "Open Nibtera Speaker from its new icon and pair it there with the link.",
      ],
    }
  }
  return {
    title: "Install the app",
    steps: [
      "Open this page in Chrome.",
      "Tap the ⋮ menu at the top right.",
      "Tap Install app (or Add to Home screen), then Install.",
      "From now on, open Nibtera Speaker from its icon.",
    ],
  }
}

function backgroundGuide(state: SetupState): Guide {
  if (state.ios) {
    return {
      title: "iPhone: keep the speaker on screen",
      steps: [
        "iPhone pauses web apps when the screen locks, so keep Nibtera Speaker open on screen.",
        "Keep the phone on its charger at the counter.",
        "Notifications still alert you when the speaker is paused.",
      ],
    }
  }
  if (state.samsung) {
    return {
      title: "Samsung: keep the speaker awake",
      steps: [
        "Open Settings → Apps → Chrome → Battery and choose Unrestricted.",
        "Open Settings → Battery → Background usage limits.",
        "Open Sleeping apps and Deep sleeping apps: if Chrome or Nibtera Speaker is listed, remove it.",
        "Open Never sleeping apps and add Chrome (and Nibtera Speaker if it's listed).",
        "Don't swipe Nibtera Speaker away in Recent apps.",
      ],
      note: "The speaker runs inside Chrome, so these settings are for Chrome. Menu names vary between models.",
    }
  }
  return {
    title: "Keep the speaker awake",
    steps: [
      "Open Settings → Apps → Chrome → Battery and choose Unrestricted (or allow background activity).",
      "Tecno / Infinix / itel: in Phone Master → Auto-start, turn on Chrome. Don't let \"clean\" or \"accelerate\" close it.",
      "Xiaomi / Redmi: in Security → Autostart, turn on Chrome; in Chrome's App info → Battery saver, choose No restrictions.",
      "Don't swipe Nibtera Speaker away in Recent apps.",
    ],
    note: "The speaker runs inside Chrome, so these settings are for Chrome. Menu names vary between phones.",
  }
}

function GuideDialog({ guide, onDone, onClose }: { guide: Guide; onDone?: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left text-[#3D291C]">
              <ol className="list-decimal space-y-2 pl-5">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {guide.note && <p className="text-xs text-[#8A7565]">{guide.note}</p>}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {onDone && (
            <Button className="bg-[#754319] text-white hover:bg-[#5B371F]" onClick={onDone}>
              I&apos;ve done this
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SetupItem({
  title,
  description,
  done,
  action,
  onAction,
  doneLabel = "✓ Done",
}: {
  title: string
  description: ReactNode
  done: boolean
  action?: string
  onAction?: () => void
  doneLabel?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-xs opacity-80">{description}</p>
      </div>
      {done ? (
        onAction && action ? (
          <button type="button" onClick={onAction} className="shrink-0 text-sm font-semibold text-[#3E7D4F]">
            ✓ {action}
          </button>
        ) : (
          <span className="shrink-0 text-sm font-semibold text-[#3E7D4F]">{doneLabel}</span>
        )
      ) : action && onAction ? (
        <Button
          size="sm"
          onClick={onAction}
          className="h-9 shrink-0 rounded-[14px] bg-[#754319] px-4 text-white hover:bg-[#5B371F]"
        >
          {action}
        </Button>
      ) : null}
    </div>
  )
}

export function SetupItems({
  state,
  showDone,
  onInstall,
  onAllowNotifications,
  onBackgroundDone,
}: {
  state: SetupState
  showDone: boolean
  onInstall: () => void
  onAllowNotifications: () => void
  onBackgroundDone: () => void
}) {
  const [guide, setGuide] = useState<"install" | "background" | null>(null)

  const notificationText: Record<SetupState["notifications"], string> = {
    enabled: "Payments also arrive as notifications, which still alert you if the phone stops the speaker.",
    off: "Turned off in Settings.",
    allow: "Alerts you even when the phone has stopped the speaker. Choose Allow when asked.",
    denied: "Blocked for this site. Open the browser's site settings → Notifications → Allow, then come back.",
    unsupported: state.ios
      ? "On iPhone, notifications only work in the installed app. Install it first."
      : "This browser can't show payment notifications. Use Chrome.",
  }

  return (
    <div className="space-y-4">
      {(showDone || !state.installed) && (
        <SetupItem
          title="Install the speaker app"
          description="Opens straight into the speaker, and plays sound without a tap when it starts."
          done={state.installed}
          action={state.canInstall ? "Install" : "Show steps"}
          onAction={state.installed ? undefined : state.canInstall ? onInstall : () => setGuide("install")}
          doneLabel="✓ Installed"
        />
      )}
      {(showDone || !notificationsDone(state)) && (
        <SetupItem
          title="Notifications"
          description={notificationText[state.notifications]}
          done={notificationsDone(state)}
          action={state.notifications === "allow" ? "Allow" : undefined}
          onAction={state.notifications === "allow" ? onAllowNotifications : undefined}
          doneLabel={state.notifications === "off" ? "Off" : "✓ Done"}
        />
      )}
      {(showDone || !state.backgroundGuideDone) && (
        <SetupItem
          title={state.samsung ? "Samsung settings" : "Run in the background"}
          description="Phones put the browser to sleep on their own and close the speaker. Follow the steps once."
          done={state.backgroundGuideDone}
          action="Show steps"
          onAction={() => setGuide("background")}
        />
      )}
      {guide === "install" && <GuideDialog guide={installGuide(state)} onClose={() => setGuide(null)} />}
      {guide === "background" && (
        <GuideDialog
          guide={backgroundGuide(state)}
          onClose={() => setGuide(null)}
          onDone={() => {
            onBackgroundDone()
            setGuide(null)
          }}
        />
      )}
    </div>
  )
}

/** On the Status screen: only the steps still to do. Red while notifications (the sleep fallback) are missing. */
export function SetupCard(props: Omit<Parameters<typeof SetupItems>[0], "showDone">) {
  if (setupComplete(props.state)) return null
  const urgent = props.state.notifications === "allow" || props.state.notifications === "denied"
  return (
    <NibCard tone={urgent ? "danger" : "gold"}>
      <div className="space-y-3 p-4">
        <p className="text-base font-semibold">
          {urgent ? "Payments may not be announced with the screen off" : "Finish setup"}
        </p>
        <SetupItems {...props} showDone={false} />
      </div>
    </NibCard>
  )
}
