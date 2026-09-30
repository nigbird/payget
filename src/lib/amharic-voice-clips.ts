/**
 * Recorded Amharic announcement clips, and how an amount is spoken with them.
 *
 * Each clip is one word recorded by a staff voice and served from
 * public/sounds/am/<name>.mp3. Recording instructions and the full word list
 * are in docs/amharic-voice-clips.md — keep that file in step with this list.
 */

export const AMHARIC_CLIP_DIR = "/sounds/am"

/** Clip file name (without .mp3) → the word recorded in it. */
export const AMHARIC_CLIPS: Record<string, string> = {
  "1": "አንድ",
  "2": "ሁለት",
  "3": "ሶስት",
  "4": "አራት",
  "5": "አምስት",
  "6": "ስድስት",
  "7": "ሰባት",
  "8": "ስምንት",
  "9": "ዘጠኝ",
  "10": "አስር",
  asra: "አስራ",
  "20": "ሃያ",
  "30": "ሰላሳ",
  "40": "አርባ",
  "50": "ሃምሳ",
  "60": "ስልሳ",
  "70": "ሰባ",
  "80": "ሰማንያ",
  "90": "ዘጠና",
  meto: "መቶ",
  shi: "ሺ",
  million: "ሚሊዮን",
  birr: "ብር",
  ke: "ከ",
  santim: "ሳንቲም",
  tekeblewal: "ተቀብለዋል",
}

/** 1–99 → clip names, e.g. 15 → ["asra", "5"], 42 → ["40", "2"]. */
function underHundred(n: number): string[] {
  if (n <= 0) return []
  if (n < 10) return [String(n)]
  if (n === 10) return ["10"]
  if (n < 20) return ["asra", String(n - 10)]
  const tens = Math.floor(n / 10) * 10
  const units = n % 10
  return units ? [String(tens), String(units)] : [String(tens)]
}

/** 1–999, e.g. 520 → ["5", "meto", "20"]. One hundred is said plainly as "መቶ". */
function underThousand(n: number): string[] {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds === 1) parts.push("meto")
  else if (hundreds > 1) parts.push(String(hundreds), "meto")
  return [...parts, ...underHundred(rest)]
}

/** Whole number → clip names, up to 999,999,999; null beyond that. */
function wholeNumber(n: number): string[] | null {
  if (n <= 0 || n >= 1_000_000_000) return null
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (millions) parts.push(...underThousand(millions), "million")
  if (thousands) parts.push(...underThousand(thousands), "shi")
  if (rest) parts.push(...underThousand(rest))
  return parts
}

/**
 * The clip sequence announcing an ETB amount, e.g. 1520.75 →
 * "አንድ ሺ አምስት መቶ ሃያ ብር ከ ሰባ አምስት ሳንቲም ተቀብለዋል".
 * Null when the amount can't be said with the recorded clips.
 */
export function amharicAnnouncementClips(amount: number): string[] | null {
  const totalCents = Math.round(amount * 100)
  const whole = Math.floor(totalCents / 100)
  const cents = totalCents % 100
  if (whole === 0 && cents === 0) return null

  const parts: string[] = []
  if (whole > 0) {
    const words = wholeNumber(whole)
    if (!words) return null
    parts.push(...words, "birr")
  }
  if (cents > 0) {
    if (whole > 0) parts.push("ke")
    parts.push(...underHundred(cents), "santim")
  }
  parts.push("tekeblewal")
  return parts
}
