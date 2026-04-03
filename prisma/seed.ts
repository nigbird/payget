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
      resetTimeoutSeconds: 60,
    },
  })

  // 2. Initial Merchant (TechGear Solutions)
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
      status: MerchantStatus.APPROVED,
      businessDescription: 'E-commerce platform selling high-end tech accessories.',
      websiteUrl: 'https://techgear.io',
      callbackUrl: 'https://techgear.io/api/webhook',
      contactName: 'John Doe',
      contactPhone: '+1234567890',
      branchName: 'Downtown HQ',
      district: 'Central Business District',
      category: 'E-commerce',
      businessType: 'Retail',
      riskFactors: [],
      createdAt: new Date(),
    },
  })

  // 3. Create Users for different portals
  const users = [
    { email: 'admin@finflow.io', name: 'Super Admin', role: UserRole.ADMIN },
    { email: 'maker@finflow.io', name: 'Staff Maker', role: UserRole.MAKER },
    { email: 'checker@finflow.io', name: 'Staff Checker', role: UserRole.CHECKER },
    { email: 'ho@finflow.io', name: 'HO Officer', role: UserRole.HEAD_OFFICE },
    { email: 'onboarding@techgear.io', name: 'TechGear Owner', role: UserRole.MERCHANT, merchantId: 'm1' },
  ]

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        password: hashedDefaultPassword,
        role: u.role,
        merchantId: u.merchantId
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
