import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const prefix = String(body?.prefix ?? "")
    const suffix = String(body?.suffix ?? "")

    if (!/^[A-F0-9]{5}$/.test(prefix) || !/^[A-F0-9]{35}$/.test(suffix)) {
      return NextResponse.json({ error: "Invalid hash parameters" }, { status: 400 })
    }

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

    if (!res.ok) {
      return NextResponse.json({ count: 0, compromised: false, unavailable: true }, { status: 200 })
    }

    const text = await res.text()
    const lines = text.split("\n")
    for (const line of lines) {
      const [hs, countStr] = line.split(":")
      if (!hs) continue
      if (hs.trim().toUpperCase() === suffix) {
        const cnt = Number((countStr ?? "0").trim())
        return NextResponse.json({
          count: Number.isFinite(cnt) ? cnt : 0,
          compromised: Number.isFinite(cnt) ? cnt > 0 : false,
        })
      }
    }

    return NextResponse.json({ count: 0, compromised: false })
  } catch (e) {
    console.error("[pwned-password] check failed", e)
    return NextResponse.json({ count: 0, compromised: false, unavailable: true }, { status: 200 })
  }
}

