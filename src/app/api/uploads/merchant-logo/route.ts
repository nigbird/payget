import { NextResponse } from "next/server"
import { requireAuthUser, userHasAnyPermission } from "@/lib/request-auth"
import { requireCsrf } from '@/lib/request-security';
import crypto from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB

const allowedMimeToExt: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
}

function looksLikePng(buf: Buffer) {
  return (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
}

function looksLikeJpeg(buf: Buffer) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

function looksLikeWebp(buf: Buffer) {
  // "RIFF....WEBP"
  return (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
}

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    // allow: public self-registration OR admin/staff with merchant permissions
    const user = await requireAuthUser(request)
    if (user) {
      const isMerchantUser = user?.role === "MERCHANT"
      const hasStaffPermission = userHasAnyPermission(user, [
        "MERCHANT_REGISTER",
        "TRANSACTION_LIMIT_SET",
        "TRANSACTION_LIMIT_OVERRIDE",
        "MERCHANT_APPROVE",
      ])

      // Merchant account admins should be able to upload their own logo in configuration.
      if (!isMerchantUser && !hasStaffPermission) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 413 })
    }

    const ext = allowedMimeToExt[file.type]
    if (!ext) {
      return NextResponse.json({ error: "Unsupported file type (allowed: PNG, JPG, WEBP)" }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const signatureOk =
      (ext === "png" && looksLikePng(bytes)) ||
      (ext === "jpg" && looksLikeJpeg(bytes)) ||
      (ext === "webp" && looksLikeWebp(bytes))
    if (!signatureOk) {
      return NextResponse.json({ error: "File content does not match declared type" }, { status: 400 })
    }

    const name = `${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex")}.${ext}`

    // Don't write into /public at runtime; serve via API route instead.
    const uploadDir = path.join(process.cwd(), "uploads", "merchant-logos")
    await mkdir(uploadDir, { recursive: true })

    const filePath = path.join(uploadDir, name)
    await writeFile(filePath, bytes)

    const url = `/api/uploads/merchant-logos/${encodeURIComponent(name)}`
    return NextResponse.json({ url })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

