import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"
import { requireAuthUser, userHasAnyPermission, canAccessMerchant } from "@/lib/request-auth"
import { prisma } from "@/lib/prisma"
import { REG_ID_PATTERN } from "@/lib/registration-upload-guard"

const extToContentType: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
}

// Staff permissions that allow reviewing any merchant's compliance documents.
const STAFF_DOC_PERMISSIONS = [
  "MERCHANT_REGISTER",
  "TRANSACTION_LIMIT_SET",
  "TRANSACTION_LIMIT_OVERRIDE",
  "MERCHANT_APPROVE",
]

function isSafeFilename(name: string) {
  if (!name) return false
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("%2f") || name.includes("%5c")) return false
  return /^[a-zA-Z0-9._-]+$/.test(name)
}

async function isAuthorized(request: Request, filename: string): Promise<boolean> {
  const user = await requireAuthUser(request)

  if (user) {
    if (userHasAnyPermission(user, STAFF_DOC_PERMISSIONS)) return true

    // Once the document is linked to a merchant (registration submitted/approved),
    // scope access to users who can access that merchant.
    const doc = await prisma.merchantDocument.findUnique({
      where: { id: filename },
      select: { merchantId: true },
    })
    if (doc && canAccessMerchant(user, doc.merchantId)) return true

    // Not yet linked to a merchant (e.g. previewing during resubmission before
    // saving) — allow only the user who uploaded this exact file.
    const ownUpload = await prisma.auditLog.findFirst({
      where: {
        action: "COMPLIANCE_DOC_UPLOAD_FILE",
        entityId: filename,
        userId: user.id,
      },
      select: { id: true },
    })
    return !!ownUpload
  }

  // Unauthenticated: only the guest self-registration session that uploaded this
  // exact file (during the registration flow, before any account exists) may
  // preview it, scoped by the registrationId capability issued to that session.
  const url = new URL(request.url)
  const registrationId = url.searchParams.get("regId") ?? ""
  if (!REG_ID_PATTERN.test(registrationId)) return false

  const uploadRecord = await prisma.auditLog.findFirst({
    where: {
      action: "COMPLIANCE_DOC_UPLOAD_FILE",
      entityId: filename,
      newValue: { path: ["registrationId"], equals: registrationId },
    },
    select: { id: true },
  })
  return !!uploadRecord
}

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await params
    if (!isSafeFilename(filename)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
    }

    const ext = filename.split(".").pop()?.toLowerCase() ?? ""
    const contentType = extToContentType[ext]
    if (!contentType) {
      return NextResponse.json({ error: "Unsupported file extension" }, { status: 400 })
    }

    if (!(await isAuthorized(request, filename))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Double protection: resolve path and verify it's within uploads directory
    const uploadDir = path.join(process.cwd(), "uploads", "compliance-docs")
    const filePath = path.join(uploadDir, filename)
    const resolvedPath = path.resolve(filePath)

    // Verify the resolved path is still within the upload directory
    if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
    }

    const bytes = await readFile(resolvedPath)

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
