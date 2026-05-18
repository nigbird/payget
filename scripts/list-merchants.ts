import { prisma } from '@/lib/prisma';

async function main() {
  console.log('=== Merchants in Database ===\n');
  
  const merchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      jweSecret: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (merchants.length === 0) {
    console.log('No merchants found.');
    return;
  }

  for (const merchant of merchants) {
    console.log(`ID:      ${merchant.id}`);
    console.log(`Name:    ${merchant.name}`);
    console.log(`Email:   ${merchant.email}`);
    console.log(`Status:  ${merchant.status}`);
    console.log(`Secret:  ${merchant.jweSecret.substring(0, 50)}...`);
    console.log('---');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
