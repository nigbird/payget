import { requireAuthUserFromContext } from "@/lib/request-auth"
import { redirect } from "next/navigation"

export default async function MerchantRoot() {
  const user = await requireAuthUserFromContext()

  if (!user || (user.role !== "MERCHANT" && user.role !== "SALES")) {
    redirect("/")
  }

  if (user.merchantId) {
    redirect(`/merchant/${user.merchantId}`)
  }

  if (user.role === "SALES" && Array.isArray(user.assignedMerchantIds) && user.assignedMerchantIds.length > 0) {
    redirect(`/merchant/${user.assignedMerchantIds[0]}`)
  }

  redirect("/")
}
