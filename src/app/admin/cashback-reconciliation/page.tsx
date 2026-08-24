import { redirect } from 'next/navigation'

/** Folded into the unified reconciliation console; kept so existing links work. */
export default function CashbackReconciliationRedirect() {
  redirect('/admin/reconciliation')
}
