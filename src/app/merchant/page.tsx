import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function MerchantRoot() {
  const session = await auth()
  const user = session?.user as any

  if (!user || user.role !== "MERCHANT") {
    redirect("/merchant/login")
  }

  if (user.merchantId) {
    redirect(`/merchant/${user.merchantId}`)
  }

  // Fallback if somehow no merchantId
  redirect("/merchant/login")
}
