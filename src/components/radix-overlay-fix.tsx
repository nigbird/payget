"use client"

import { useEffect } from "react"

const OPEN_OVERLAY_SELECTOR =
  '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]'

/**
 * Radix's Dialog/DropdownMenu/Popover primitives lock `document.body`'s
 * pointer-events while open and restore it on close. When one overlay opens
 * another (e.g. a DropdownMenuItem triggering a Dialog) their mount/unmount
 * order can race, and the restore ends up writing back "none" instead of the
 * original value — leaving the whole page unclickable until a refresh.
 * This watchdog clears that stuck state whenever no overlay is actually open.
 */
export function RadixOverlayFix() {
  useEffect(() => {
    const clearIfStuck = () => {
      if (document.body.style.pointerEvents !== "none") return
      if (!document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        document.body.style.pointerEvents = ""
      }
    }

    const observer = new MutationObserver(clearIfStuck)
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] })

    // Fallback in case an overlay closes without a further body style mutation.
    const interval = setInterval(clearIfStuck, 400)

    return () => {
      observer.disconnect()
      clearInterval(interval)
    }
  }, [])

  return null
}
