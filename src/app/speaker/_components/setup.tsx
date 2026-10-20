"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MUTED, NibCard, OUTLINE_BUTTON, PRIMARY_BUTTON } from "./ui"

/**
 * The steps that keep the speaker alive with the screen off: install it as an
 * app, allow notifications, and stop the phone putting the browser to sleep.
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

function notificationsDone(state: SetupState) {
  return state.notifications === "enabled" || state.notifications === "off"
}

export function setupComplete(state: SetupState) {
  return state.installed && notificationsDone(state) && state.backgroundGuideDone
}

type Guide = { title: string; steps: string[] }

function installGuide(state: SetupState): Guide {
  return state.ios
    ? { title: "Install on iPhone", steps: ["In Safari, tap Share → Add to Home Screen.", "Open the speaker from its icon and pair it there."] }
    : { title: "Install the app", steps: ["In Chrome, tap ⋮ → Install app.", "Open the speaker from its icon from now on."] }
}

function backgroundGuide(state: SetupState): Guide {
  if (state.ios) {
    return { title: "iPhone", steps: ["Keep the speaker open on screen, with the phone on its charger."] }
  }
  // The speaker runs inside Chrome, so the battery settings are Chrome's.
  if (state.samsung) {
    return {
      title: "Samsung",
      steps: [
        "Settings → Apps → Chrome → Battery → Unrestricted.",
        "Settings → Battery → Background usage limits → Never sleeping apps → add Chrome.",
        "Don't swipe the speaker away from recent apps.",
      ],
    }
  }
  return {
    title: "Keep it awake",
    steps: ["Settings → Apps → Chrome → Battery → Unrestricted.", "Don't swipe the speaker away from recent apps."],
  }
}

function GuideDialog({ guide, onDone, onClose }: { guide: Guide; onDone?: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-[#5b371f]">{guide.title}</DialogTitle>
          <DialogDescription asChild>
            <ol className="list-decimal space-y-2 pl-5 text-left text-[#5b371f]">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className={OUTLINE_BUTTON} onClick={onClose}>
            Close
          </Button>
          {onDone && (
            <Button className={PRIMARY_BUTTON} onClick={onDone}>
              Done
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
  doneLabel = "✓ Done",
  action,
  onAction,
}: {
  title: string
  description?: string
  done: boolean
  doneLabel?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {description && <p className={`text-xs ${MUTED}`}>{description}</p>}
      </div>
      {done ? (
        <span className="shrink-0 text-sm font-semibold text-[#3E7D4F]">{doneLabel}</span>
      ) : (
        action &&
        onAction && (
          <Button size="sm" onClick={onAction} className={`h-9 shrink-0 px-4 ${PRIMARY_BUTTON}`}>
            {action}
          </Button>
        )
      )}
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

  const notificationNote: Partial<Record<SetupState["notifications"], string>> = {
    denied: "Blocked: allow them in the browser's site settings",
    unsupported: state.ios ? "Install the app first" : "Not available in this browser",
  }

  return (
    <div className="space-y-4">
      {(showDone || !state.installed) && (
        <SetupItem
          title="Install the app"
          description="Opens straight into the speaker"
          done={state.installed}
          doneLabel="✓ Installed"
          action={state.canInstall ? "Install" : "How"}
          onAction={state.canInstall ? onInstall : () => setGuide("install")}
        />
      )}
      {(showDone || !notificationsDone(state)) && (
        <SetupItem
          title="Notifications"
          description={notificationNote[state.notifications] ?? "Alerts you when the screen is off"}
          done={notificationsDone(state)}
          doneLabel={state.notifications === "off" ? "Off" : "✓ Done"}
          action={state.notifications === "allow" ? "Allow" : undefined}
          onAction={onAllowNotifications}
        />
      )}
      {(showDone || !state.backgroundGuideDone) && (
        <SetupItem
          title="Battery settings"
          description="Stops the phone closing the speaker"
          done={state.backgroundGuideDone}
          action="How"
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
        <p className="text-base font-bold">Finish setup</p>
        <SetupItems {...props} showDone={false} />
      </div>
    </NibCard>
  )
}
