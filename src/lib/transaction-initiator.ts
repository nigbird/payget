import type { MerchantTeamMember, Transaction } from "@/app/lib/db"

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

export type SalesUserFilterOption = { value: string; label: string }

export function buildSalesUserFilterOptions(
  teamMembers: MerchantTeamMember[],
  transactions: Transaction[]
): SalesUserFilterOption[] {
  const options: SalesUserFilterOption[] = [{ value: "all", label: "All Users" }]

  const listableMembers = teamMembers.filter(
    (m) => m.status === "active" && (m.role === "payment_initiator" || m.role === "account_admin")
  )
  for (const member of listableMembers) {
    options.push({ value: `member:${member.id}`, label: member.name })
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
    if (!options.some((o) => o.value === value)) {
      options.push({ value, label })
    }
  }

  return options
}
