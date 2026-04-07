import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function MerchantRoot() {
  const session = await auth()
  const user = session?.user as any

  if (!user || (user.role !== "MERCHANT" && user.role !== "SALES")) {
    redirect("/")
  }

  if (user.role === "SALES" && Array.isArray(user.assignedMerchantIds) && user.assignedMerchantIds.length > 0) {
    redirect(`/merchant/${user.assignedMerchantIds[0]}`)
  }

  if (user.merchantId) {
    redirect(`/merchant/${user.merchantId}`)
  }

  // Fallback if somehow no merchantId
  redirect("/")
}
