import { PrismaClient, MerchantStatus, TeamRole, TeamMemberStatus, TransactionStatus, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding...')

  const hashedDefaultPassword = await bcrypt.hash('password123', 10)

  // 1. System Configuration
  const systemConfig = await prisma.systemConfig.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      maxFileSizeMB: 5,
      allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
      districts: ['Central Business District', 'North Industrial', 'South Residential', 'East Port', 'West Hills'],
      branches: ['Downtown HQ', 'North Hub', 'South Plaza', 'East Wing', 'West Station'],
      categories: ['Retail', 'E-commerce', 'Services', 'Healthcare', 'Education', 'Hospitality', 'Technology', 'Manufacturing'],
      businessTypes: ['Sole Proprietorship', 'Partnership', 'Private Limited', 'Public Limited', 'Non-Profit Organization'],
      resetTimeoutSeconds: 60,
    },
  })

  // 2. Permissions
  const permissionsData = [
    { name: 'DASHBOARD_GLOBAL_VIEW', category: 'DASHBOARD', description: 'Global admin oversight' },
    { name: 'DASHBOARD_USER_VIEW', category: 'DASHBOARD', description: 'User-specific view' },
    { name: 'MERCHANT_REGISTER', category: 'MERCHANT', description: 'Register new merchants' },
    { name: 'MERCHANT_APPROVE', category: 'MERCHANT', description: 'Approve merchant registrations' },
    { name: 'USER_CREATE', category: 'USER_ROLE', description: 'Create and manage users' },
    { name: 'ROLE_CREATE', category: 'USER_ROLE', description: 'Create roles' },
    { name: 'ROLE_EDIT', category: 'USER_ROLE', description: 'Edit existing roles' },
    { name: 'ROLE_DELETE', category: 'USER_ROLE', description: 'Delete or deactivate roles' },
    { name: 'TRANSACTION_LIMIT_SET', category: 'TRANSACTION', description: 'Set transaction limits' },
    { name: 'TRANSACTION_LIMIT_OVERRIDE', category: 'TRANSACTION', description: 'Override transaction limits' },
  ]

  const permissions = []
  for (const p of permissionsData) {
    const perm = await prisma.permission.upsert({
      where: { name: p.name },
      update: { category: p.category, description: p.description },
      create: p,
    })
    permissions.push(perm)
  }

  // 3. Default Roles
  const roles = [
    {
      name: 'Super Admin',
      description: 'Full system access',
      perms: ['DASHBOARD_GLOBAL_VIEW', 'DASHBOARD_USER_VIEW', 'MERCHANT_REGISTER', 'MERCHANT_APPROVE', 'USER_CREATE', 'ROLE_CREATE', 'ROLE_EDIT', 'ROLE_DELETE', 'TRANSACTION_LIMIT_SET', 'TRANSACTION_LIMIT_OVERRIDE']
    },
    
    {
      name: 'Final Approver',
      description: 'Performs final review and activates merchant accounts',
      perms: ['DASHBOARD_GLOBAL_VIEW', 'DASHBOARD_USER_VIEW', 'MERCHANT_APPROVE']
    },
    {
      name: 'Merchant',
      description: 'Standard merchant access',
      perms: ['DASHBOARD_USER_VIEW']
    }
  ]

  for (const r of roles) {
    const rolePermissions = await prisma.permission.findMany({
      where: { name: { in: r.perms } }
    })

    await prisma.role.upsert({
      where: { name: r.name },
      update: {
        description: r.description,
        permissions: {
          deleteMany: {},
          create: rolePermissions.map(p => ({ permissionId: p.id }))
        }
      },
      create: {
        name: r.name,
        description: r.description,
        permissions: {
          create: rolePermissions.map(p => ({ permissionId: p.id }))
        }
      }
    })
  }

  // 4. Initial Merchant (TechGear Solutions)
  const merchant = await prisma.merchant.upsert({
    where: { id: 'm1' },
    update: {},
    create: {
      id: 'm1',
      name: 'TechGear Solutions',
      email: 'onboarding@techgear.io',
      password: hashedDefaultPassword,
      jweSecret: 'demo_jwe_secret_m1',
      accountNumber: '1234567890',
      dailyLimit: 50000,
      transactionLimit: 5000,
      dailyCountLimit: 100,
      status: MerchantStatus.ACTIVE,
      businessDescription: 'E-commerce platform selling high-end tech accessories.',
      websiteUrl: 'https://techgear.io',
      callbackUrl: 'https://techgear.io/api/webhook',
      contactName: 'Abebe Kebede',
      contactUsername: '0934567890',
      branchName: 'Downtown HQ',
      district: 'Central Business District',
      category: 'E-commerce',
      businessType: 'Retail',
      riskFactors: [],
      createdAt: new Date(),
    },
  })

  // 5. Create Users for different portals
  const usersToSeed = [
    { email: 'admin@finflow.io', name: 'Super Admin', role: UserRole.ADMIN, customRoleName: 'Super Admin' },
    { email: 'approver@finflow.io', name: 'Final Approver', role: UserRole.HEAD_OFFICE, customRoleName: 'Final Approver' },
    { email: 'onboarding@techgear.io', name: 'TechGear Owner', role: UserRole.MERCHANT, merchantId: 'm1', customRoleName: 'Merchant' },
  ]

  for (const u of usersToSeed) {
    let customRoleId = null
    if (u.customRoleName) {
      const role = await prisma.role.findUnique({ where: { name: u.customRoleName } })
      customRoleId = role?.id
    }

    await prisma.user.upsert({
      where: { email: u.email },
      update: { customRoleId },
      create: {
        email: u.email,
        name: u.name,
        password: hashedDefaultPassword,
        role: u.role,
        merchantId: u.merchantId,
        customRoleId
      }
    })
  }

  // 4. Transactions
  await prisma.transaction.upsert({
    where: { transactionReference: 'ref_demo_tx1' },
    update: {},
    create: {
      id: 'tx1',
      merchantId: 'm1',
      amount: 450.00,
      status: TransactionStatus.SUCCESS,
      callbackUrl: 'https://techgear.io/api/webhook',
      description: 'Order #8821',
      timestamp: new Date(),
      transactionReference: 'ref_demo_tx1',
      serviceDescription: 'Order #8821',
      transactionTimestamp: new Date(),
      payerPhone: '+1234567890',
      userCredentials: { phone: '+1234567890', authToken: 'demo_auth_token_tx1' },
    },
  })

  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
