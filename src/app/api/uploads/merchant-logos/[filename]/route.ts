import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

const extToContentType: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
}

function isSafeFilename(name: string) {
  // deny path traversal and weird characters; allow uuid-ish filenames plus dot/underscore/dash
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

    const filePath = path.join(process.cwd(), "uploads", "merchant-logos", filename)
    const bytes = await readFile(filePath)

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}

