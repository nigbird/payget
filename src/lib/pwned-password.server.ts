import crypto from "crypto"

async function sha1HexUpper(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex").toUpperCase()
}

export async function getPwnedCount(password: string): Promise<number> {
  try {
    const hash = await sha1HexUpper(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "payget-password-check",
        "Add-Padding": "true",
      },
    }).finally(() => clearTimeout(timeout))

    if (!res.ok) return 0
    const text = await res.text()

    for (const line of text.split("\n")) {
      const [hs, countStr] = line.split(":")
      if (!hs) continue
      if (hs.trim().toUpperCase() === suffix) {
        const cnt = Number((countStr ?? "0").trim())
        return Number.isFinite(cnt) ? cnt : 0
      }
    }

    return 0
  } catch (e) {
    console.error("[password-policy] pwned check failed", e)
    return 0
  }
}

