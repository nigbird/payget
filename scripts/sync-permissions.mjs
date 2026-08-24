// Production-safe subset of prisma/seed.ts: upserts the Permission catalog and
// re-syncs the Super Admin / Final Approver / Merchant role grants to match it.
// Does NOT touch any other role, user, merchant, or transaction data.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const permissionsData = [
  { name: 'DASHBOARD_VIEW', category: 'DASHBOARD', description: 'Access to the administration dashboard' },
  { name: 'MERCHANT_REGISTER', category: 'MERCHANT', description: 'Register new merchants' },
  { name: 'MERCHANT_APPROVE', category: 'MERCHANT', description: 'Approve merchant registrations' },
  { name: 'SUBSIDIARY_ACCOUNT_REQUEST', category: 'MERCHANT', description: 'Request a subsidiary account for a merchant (maker)' },
  { name: 'SUBSIDIARY_ACCOUNT_APPROVE', category: 'MERCHANT', description: 'Approve or reject subsidiary account requests (checker)' },
  { name: 'PAYMENT_ELIGIBILITY_APPROVE', category: 'MERCHANT', description: 'Approve or reject merchant-submitted payment-eligible customer imports (checker)' },
  { name: 'USER_CREATE', category: 'USER_ROLE', description: 'Create and manage users' },
  { name: 'ROLE_CREATE', category: 'USER_ROLE', description: 'Create roles' },
  { name: 'ROLE_EDIT', category: 'USER_ROLE', description: 'Edit existing roles' },
  { name: 'ROLE_DELETE', category: 'USER_ROLE', description: 'Delete or deactivate roles' },
  { name: 'TRANSACTION_LIMIT_SET', category: 'TRANSACTION', description: 'Set transaction limits' },
  { name: 'TRANSACTION_LIMIT_OVERRIDE', category: 'TRANSACTION', description: 'Override transaction limits' },
  { name: 'CONFIGURATION_MANAGE', category: 'SYSTEM', description: 'Manage system-wide configurations (branches, districts, etc.)' },
  { name: 'AUDIT_LOG_VIEW', category: 'SYSTEM', description: 'View and search audit logs' },
  { name: 'cashback.reconciliation.view', category: 'CASHBACK', description: 'View cashback reconciliation dashboard' },
  { name: 'cashback.reconciliation.retry', category: 'CASHBACK', description: 'Retry failed cashback transactions' },
  { name: 'cashback.reconciliation.export', category: 'CASHBACK', description: 'Export cashback reconciliation reports' },
  { name: 'cashback.reconciliation.manual_review', category: 'CASHBACK', description: 'Move transactions to manual review' },
  { name: 'cashback.reconciliation.manage', category: 'CASHBACK', description: 'Manage cashback reconciliation operations' },
  { name: 'payment.reconciliation.view', category: 'TRANSACTION', description: 'View unresolved payments and reconciliation requests' },
  { name: 'payment.reconciliation.request', category: 'TRANSACTION', description: 'Submit an FT from a bank receipt to settle a payment (maker)' },
  { name: 'payment.reconciliation.manage', category: 'TRANSACTION', description: 'Approve or reject payment reconciliation requests (checker)' },
  { name: 'qr.generation.manage', category: 'MERCHANT', description: 'Manage QR code generation and merchant configuration' },
]

const roles = [
  {
    name: 'Super Admin',
    description: 'Full system access',
    perms: permissionsData.map((p) => p.name),
  },
  {
    name: 'Final Approver',
    description: 'Performs final review and activates merchant accounts',
    perms: ['DASHBOARD_VIEW', 'MERCHANT_APPROVE', 'SUBSIDIARY_ACCOUNT_APPROVE', 'PAYMENT_ELIGIBILITY_APPROVE'],
  },
  {
    name: 'Merchant',
    description: 'Standard merchant access',
    perms: ['DASHBOARD_VIEW'],
  },
]

async function main() {
  console.log('Syncing permission catalog...')
  let added = 0
  for (const p of permissionsData) {
    const existing = await prisma.permission.findUnique({ where: { name: p.name } })
    if (!existing) added++
    await prisma.permission.upsert({
      where: { name: p.name },
      update: { category: p.category, description: p.description },
      create: p,
    })
  }
  console.log(`  ${added} new permission(s) added, ${permissionsData.length - added} already present.`)

  for (const r of roles) {
    const rolePermissions = await prisma.permission.findMany({ where: { name: { in: r.perms } } })
    const existingRole = await prisma.role.findUnique({ where: { name: r.name } })
    await prisma.role.upsert({
      where: { name: r.name },
      update: {
        description: r.description,
        permissions: { deleteMany: {}, create: rolePermissions.map((p) => ({ permissionId: p.id })) },
      },
      create: {
        name: r.name,
        description: r.description,
        permissions: { create: rolePermissions.map((p) => ({ permissionId: p.id })) },
      },
    })
    console.log(`  Role "${r.name}" ${existingRole ? 'updated' : 'created'} with ${rolePermissions.length} permission(s).`)
  }

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
