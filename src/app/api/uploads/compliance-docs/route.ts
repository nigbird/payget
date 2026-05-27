import { NextResponse } from "next/server"
import { requireAuthUser, userHasAnyPermission } from "@/lib/request-auth"
import { requireCsrf } from '@/lib/request-security';
import crypto from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { writeAuditLog } from "@/lib/audit-log"
import { isDangerousExtension, extensionsMatch, validateFileUpload, hasAnyDangerousExtension } from "@/lib/file-validation"

const MAX_TOTAL_BYTES = 15 * 1024 * 1024 // 15MB total per application
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024 // 5MB per file

const allowedMimeToExt: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
}

// Magic number check for PDF
function looksLikePdf(buf: Buffer) {
  return buf.length > 4 && buf.toString("ascii", 0, 4) === "%PDF"
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

      if (!isMerchantUser && !hasStaffPermission) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { result: "failed", reason: "FORBIDDEN" },
        })
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const form = await request.formData()
    const files = form.getAll("files")
    
    if (files.length === 0) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "COMPLIANCE_DOC_UPLOAD",
        entityType: "DOCUMENT",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_FILES" },
      })
      return NextResponse.json({ error: "Missing files" }, { status: 400 })
    }

    let totalSize = 0
    const uploadedDocs = []
    const processedFileNames: string[] = []

    for (const file of files) {
      if (!(file instanceof File)) continue
      
      if (file.size <= 0) continue
      
      processedFileNames.push(file.name)
      
      if (file.size > MAX_SINGLE_FILE_BYTES) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { 
            result: "failed", 
            reason: "FILE_TOO_LARGE", 
            fileName: file.name, 
            fileSize: file.size 
          },
        })
        return NextResponse.json({ error: `File ${file.name} too large (max 5MB)` }, { status: 413 })
      }

      totalSize += file.size
      if (totalSize > MAX_TOTAL_BYTES) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { 
            result: "failed", 
            reason: "TOTAL_SIZE_EXCEEDED", 
            totalSize 
          },
        })
        return NextResponse.json({ error: "Total files size exceeds 15MB limit" }, { status: 413 })
      }

      const ext = allowedMimeToExt[file.type]
      if (!ext) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { 
            result: "failed", 
            reason: "UNSUPPORTED_FILE_TYPE", 
            fileName: file.name, 
            mimeType: file.type 
          },
        })
        return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
      }

      // Check if extension is dangerous (blocklist validation)
      if (isDangerousExtension(`.${ext}`)) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
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

      // Check for ANY dangerous extension anywhere in filename (double/triple extension check)
      if (hasAnyDangerousExtension(file.name)) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { 
            result: "failed", 
            reason: "MULTIPLE_EXTENSION_DETECTED", 
            fileName: file.name
          },
        })
        return NextResponse.json({ error: "File contains dangerous extensions" }, { status: 400 })
      }

      // Validate filename extension matches detected type and is not dangerous
      if (!extensionsMatch(file.name, ext)) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
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
      
      // Server-side content inspection (Magic Numbers)
      const signatureOk =
        (ext === "png" && looksLikePng(bytes)) ||
        (ext === "jpg" && looksLikeJpeg(bytes)) ||
        (ext === "webp" && looksLikeWebp(bytes)) ||
        (ext === "pdf" && looksLikePdf(bytes))

      if (!signatureOk) {
        console.warn('File content mismatch for %s (type: %s)', file.name, file.type)
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "COMPLIANCE_DOC_UPLOAD",
          entityType: "DOCUMENT",
          entityId: null,
          newValue: { 
            result: "failed", 
            reason: "CONTENT_MISMATCH", 
            fileName: file.name, 
            mimeType: file.type 
          },
        })
        return NextResponse.json({ error: `File content for ${file.name} does not match declared type` }, { status: 400 })
      }

      const filename = `${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex")}.${ext}`
      const uploadDir = path.join(process.cwd(), "uploads", "compliance-docs")
      await mkdir(uploadDir, { recursive: true })

      const filePath = path.join(uploadDir, filename)
      await writeFile(filePath, bytes)

      uploadedDocs.push({
        id: filename, // Use filename as ID for easier mapping
        name: file.name,
        type: file.type,
        size: file.size,
        url: `/api/uploads/compliance-docs/${filename}`,
        uploadedAt: new Date().toISOString()
      })
    }

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "COMPLIANCE_DOC_UPLOAD",
      entityType: "DOCUMENT",
      entityId: null,
      newValue: { 
        result: "success", 
        files: processedFileNames, 
        count: uploadedDocs.length,
        totalSize
      },
    })

    return NextResponse.json({ documents: uploadedDocs })
  } catch (error) {
    console.error("Upload error:", error)
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "COMPLIANCE_DOC_UPLOAD",
      entityType: "DOCUMENT",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
