import { prisma } from "@/lib/prisma"

export const MAX_FILES_PER_REGISTRATION = 10
export const MAX_BYTES_PER_REGISTRATION = 50 * 1024 * 1024 // 50MB
export const REG_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Returns the combined file count and total bytes already uploaded
 * under a given registrationId (across both logo and compliance-doc uploads).
 */
export async function getRegistrationUploadTotals(
  registrationId: string
): Promise<{ fileCount: number; totalBytes: number }> {
  const [logoUploads, docUploads] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        AND: [
          { action: "MERCHANT_LOGO_UPLOAD" },
          { newValue: { path: ["result"], equals: "success" } },
          { newValue: { path: ["registrationId"], equals: registrationId } },
        ],
      },
      select: { newValue: true },
    }),
    prisma.auditLog.findMany({
      where: {
        AND: [
          { action: "COMPLIANCE_DOC_UPLOAD" },
          { newValue: { path: ["result"], equals: "success" } },
          { newValue: { path: ["registrationId"], equals: registrationId } },
        ],
      },
      select: { newValue: true },
    }),
  ])

  const fileCount =
    logoUploads.length +
    docUploads.reduce((sum, log) => {
      const val = log.newValue as any
      return sum + (typeof val?.count === "number" ? val.count : 0)
    }, 0)

  const totalBytes =
    logoUploads.reduce((sum, log) => {
      const val = log.newValue as any
      return sum + (typeof val?.fileSize === "number" ? val.fileSize : 0)
    }, 0) +
    docUploads.reduce((sum, log) => {
      const val = log.newValue as any
      return sum + (typeof val?.totalSize === "number" ? val.totalSize : 0)
    }, 0)

  return { fileCount, totalBytes }
}
