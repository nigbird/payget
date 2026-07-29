import { redirect } from 'next/navigation'

/** Folded into the unified reconciliation console; kept so existing links work. */
export default function PaymentReconciliationRedirect() {
  redirect('/admin/reconciliation')
}
