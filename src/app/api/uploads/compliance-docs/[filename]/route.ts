import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

const extToContentType: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
}

function isSafeFilename(name: string) {
  if (!name) return false
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("%2f") || name.includes("%5c")) return false
  return /^[a-zA-Z0-9._-]+$/.test(name)
}

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
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
