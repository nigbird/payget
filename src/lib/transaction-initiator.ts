import type { MerchantTeamMember, Transaction } from "@/lib/db"

/** initiatedById used for payments made by a customer scanning a merchant's QR code (no logged-in team member). */
export const QR_CUSTOMER_INITIATOR_ID = "QR_CUSTOMER"

export function isQrCustomerTransaction(tx: Transaction): boolean {
  return tx.userCredentials.initiatedById === QR_CUSTOMER_INITIATOR_ID
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.endsWith(nb) || nb.endsWith(na)
}

function normalizeComparableName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

type TeamMemberForMatch = Pick<MerchantTeamMember, "id" | "name" | "phone"> & {
  linkedUserId?: string | null
}

/** Matches a transaction to a merchant team member (sales user). */
export function transactionMatchesTeamMember(tx: Transaction, member: TeamMemberForMatch): boolean {
  const byId = tx.userCredentials.initiatedById
  const byName = normalizeComparableName(tx.userCredentials.initiatedByName || "")
  const memberName = normalizeComparableName(member.name || "")

  if (byId && byId === member.id) return true
  if (member.linkedUserId && byId && byId === member.linkedUserId) return true
  if (byName && memberName && byName === memberName) return true

  if (member.phone) {
    const digits = normalizePhone(member.phone)
    if (byId && digits && (byId === digits || normalizePhone(byId) === digits)) return true
    if (byId?.startsWith("sales-")) {
      const idPhone = byId.slice("sales-".length)
      if (byId === `sales-${member.phone}`) return true
      if (phonesMatch(idPhone, member.phone)) return true
    }
  }

  return false
}

/** Matches a transaction to a filter token from the sales-user dropdown. */
export function transactionMatchesSalesUserFilter(
  tx: Transaction,
  filterValue: string,
  teamMembers: MerchantTeamMember[]
): boolean {
  if (filterValue === "all") return true

  if (filterValue.startsWith("member:")) {
    const memberId = filterValue.slice("member:".length)
    const member = teamMembers.find((m) => m.id === memberId)
    return member ? transactionMatchesTeamMember(tx, member) : false
  }

  if (filterValue.startsWith("id:")) {
    return tx.userCredentials.initiatedById === filterValue.slice("id:".length)
  }

  if (filterValue.startsWith("name:")) {
    const key = filterValue.slice("name:".length)
    return normalizeComparableName(tx.userCredentials.initiatedByName || "") === normalizeComparableName(key)
  }

  const member = teamMembers.find((m) => m.id === filterValue)
  if (member) return transactionMatchesTeamMember(tx, member)

  return tx.userCredentials.initiatedById === filterValue
}

/**
 * Resolves the merchant team member record that corresponds to the currently
 * authenticated SALES user, matching by team member id first (when the JWT
 * carries it) and falling back to phone matching against the virtual
 * `sales-<phone>` user id.
 */
export function findSelfTeamMember(
  teamMembers: MerchantTeamMember[],
  currentUser: { id: string; teamMemberId?: string | null }
): MerchantTeamMember | undefined {
  if (currentUser.teamMemberId) {
    const byId = teamMembers.find((m) => m.id === currentUser.teamMemberId)
    if (byId) return byId
  }
  return teamMembers.find(
    (m) =>
      m.phone &&
      (currentUser.id === `sales-${m.phone}` ||
        phonesMatch(currentUser.id.replace(/^sales-/, ""), m.phone))
  )
}

export type SalesUserFilterOption = { value: string; label: string }

export function buildSalesUserFilterOptions(
  teamMembers: MerchantTeamMember[],
  transactions: Transaction[],
  /** When set, restricts the listed team members to just this one (e.g. for a non-admin sales user who may only see their own transactions). */
  options?: { onlyMemberId?: string }
): SalesUserFilterOption[] {
  const opts: SalesUserFilterOption[] = [{ value: "all", label: "All Users" }]

  const onlyMemberId = options?.onlyMemberId
  const listableMembers = onlyMemberId
    ? teamMembers.filter((m) => m.id === onlyMemberId)
    : teamMembers.filter(
        (m) =>
          m.status === "active" &&
          (m.role === "payment_initiator" || m.role === "account_admin" || m.role === "sales_admin")
      )
  for (const member of listableMembers) {
    opts.push({ value: `member:${member.id}`, label: onlyMemberId ? "My Transactions" : member.name })
  }

  const covered = (tx: Transaction) =>
    teamMembers.some((m) => transactionMatchesTeamMember(tx, m))

  const extras = new Map<string, string>()
  for (const tx of transactions) {
    if (covered(tx)) continue
    const id = tx.userCredentials.initiatedById
    const name = tx.userCredentials.initiatedByName
    if (id) {
      extras.set(`id:${id}`, name || id)
    } else if (name) {
      extras.set(`name:${normalizeComparableName(name)}`, name)
    }
  }

  for (const [value, label] of extras) {
    if (!opts.some((o) => o.value === value)) {
      opts.push({ value, label })
    }
  }

  return opts
}
