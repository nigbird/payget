import { NextResponse } from "next/server"
import { requireAuthUser, userHasAnyPermission } from "@/lib/request-auth"
import { requireCsrf } from '@/lib/request-security';
import crypto from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { writeAuditLog } from "@/lib/audit-log"
import { isDangerousExtension, extensionsMatch } from "@/lib/file-validation"

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
  let actorUserId: string | null = null
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    // allow: public self-registration OR admin/staff with merchant permissions
    const user = await requireAuthUser(request)
    if (user) {
      actorUserId = user.id
      const isMerchantUser = user?.role === "MERCHANT"
      const hasStaffPermission = userHasAnyPermission(user, [
        "MERCHANT_REGISTER",
        "TRANSACTION_LIMIT_SET",
        "TRANSACTION_LIMIT_OVERRIDE",
        "MERCHANT_APPROVE",
      ])

      // Merchant account admins should be able to upload their own logo in configuration.
      if (!isMerchantUser && !hasStaffPermission) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "MERCHANT_LOGO_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { result: "failed", reason: "FORBIDDEN" },
        })
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_FILE" },
      })
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }

    if (file.size <= 0) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "EMPTY_FILE", 
          fileName: file.name 
        },
      })
      return NextResponse.json({ error: "Empty file" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "FILE_TOO_LARGE", 
          fileName: file.name, 
          fileSize: file.size 
        },
      })
      return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 413 })
    }

    const ext = allowedMimeToExt[file.type]
    if (!ext) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "UNSUPPORTED_FILE_TYPE", 
          fileName: file.name, 
          mimeType: file.type 
        },
      })
      return NextResponse.json({ error: "Unsupported file type (allowed: PNG, JPG, WEBP)" }, { status: 400 })
    }

    // Check if extension is dangerous (blocklist validation)
    if (isDangerousExtension(`.${ext}`)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "DANGEROUS_FILE_TYPE", 
          fileName: file.name, 
          extension: ext
        },
      })
      return NextResponse.json({ error: "File type not permitted" }, { status: 400 })
    }

    // Validate filename extension matches detected type
    if (!extensionsMatch(file.name, ext)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "EXTENSION_MISMATCH", 
          fileName: file.name, 
          declaredExtension: ext
        },
      })
      return NextResponse.json({ error: "File extension does not match file type" }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const signatureOk =
      (ext === "png" && looksLikePng(bytes)) ||
      (ext === "jpg" && looksLikeJpeg(bytes)) ||
      (ext === "webp" && looksLikeWebp(bytes))
    if (!signatureOk) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_LOGO_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "CONTENT_MISMATCH", 
          fileName: file.name, 
          mimeType: file.type 
        },
      })
      return NextResponse.json({ error: "File content does not match declared type" }, { status: 400 })
    }

    const name = `${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex")}.${ext}`

    // Don't write into /public at runtime; serve via API route instead.
    const uploadDir = path.join(process.cwd(), "uploads", "merchant-logos")
    await mkdir(uploadDir, { recursive: true })

    const filePath = path.join(uploadDir, name)
    await writeFile(filePath, bytes)

    const url = `/api/uploads/merchant-logos/${encodeURIComponent(name)}`
    
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "MERCHANT_LOGO_UPLOAD",
      entityType: "DOCUMENT",
      entityId: null,
      newValue: { 
        result: "success", 
        fileName: file.name, 
        fileSize: file.size,
        url
      },
    })

    return NextResponse.json({ url })
  } catch (e) {
    console.error(e)
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "MERCHANT_LOGO_UPLOAD",
      entityType: "DOCUMENT",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

