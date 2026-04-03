import { PrismaClient, MerchantStatus, TeamMemberRole, TeamMemberStatus, TransactionStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding...')

  // 1. System Configuration
  const systemConfig = await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
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
      password: 'password123',
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

  // 3. Merchant Documents
  await prisma.merchantDocument.upsert({
    where: { id: 'doc1' },
    update: {},
    create: {
      id: 'doc1',
      name: 'trade_license.pdf',
      type: 'application/pdf',
      size: 1572864, // 1.5MB
      uploadedAt: new Date(),
      merchantId: 'm1',
    },
  })

  // 4. Team Members
  await prisma.merchantTeamMember.upsert({
    where: { id: 'tm1' },
    update: {},
    create: {
      id: 'tm1',
      merchantId: 'm1',
      name: 'Aisha Payments',
      email: 'payments@techgear.io',
      phone: '+1234567890',
      role: TeamMemberRole.PAYMENT_INITIATOR,
      status: TeamMemberStatus.ACTIVE,
      createdAt: new Date(),
    },
  })

  await prisma.merchantTeamMember.upsert({
    where: { id: 'tm2' },
    update: {},
    create: {
      id: 'tm2',
      merchantId: 'm1',
      name: 'Morgan Admin',
      email: 'admin@techgear.io',
      role: TeamMemberRole.ACCOUNT_ADMIN,
      status: TeamMemberStatus.ACTIVE,
      createdAt: new Date(),
    },
  })

  // 5. Transactions
  await prisma.transaction.upsert({
    where: { id: 'tx1' },
    update: {},
    create: {
      id: 'tx1',
      merchantId: 'm1',
      amount: 450.00,
      status: TransactionStatus.SUCCESS,
      userPhone: '+1234567890',
      callbackUrl: 'https://techgear.io/api/webhook',
      description: 'Order #8821',
      timestamp: new Date().toISOString(),
      transactionReference: 'ref_demo_tx1',
      serviceDescription: 'Order #8821',
      transactionTimestamp: new Date().toISOString(),
      payerPhone: '+1234567890',

      
      userAuthToken: 'demo_auth_token_tx1',
    },
  })

  await prisma.transaction.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      merchantId: 'm1',
      amount: 1250.00,
      status: TransactionStatus.PENDING,
      userPhone: '+1 (555) 987-6543',
      callbackUrl: 'https://techgear.io/api/webhook',
      description: 'Invoice for Enterprise Support Package (Q3)',
      timestamp: new Date().toISOString(),
      transactionReference: 'ref_demo_tx2',
      serviceDescription: 'Invoice for Enterprise Support Package (Q3)',
      transactionTimestamp: new Date().toISOString(),
      payerPhone: '+1 (555) 987-6543',
      
      
      userAuthToken: 'demo_auth_token_tx2',
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
