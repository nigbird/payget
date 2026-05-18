import { prisma } from '@/lib/prisma';
import { generateJweSecret } from '@/lib/jwe';
import { encryptMerchantSecretAtRest } from '@/lib/merchant-secret';

const MERCHANT_ID = process.argv[2];

if (!MERCHANT_ID) {
  console.error('Please provide a merchant ID as an argument.');
  console.error('Usage: npx tsx scripts/rotate-merchant-secret.ts <merchant-id>');
  process.exit(1);
}

async function main() {
  console.log('=== Rotating Merchant Secret ===\n');
  
  const merchant = await prisma.merchant.findUnique({
    where: { id: MERCHANT_ID },
  });

  if (!merchant) {
    console.error(`Merchant with ID "${MERCHANT_ID}" not found.`);
    process.exit(1);
  }

  console.log(`Merchant found: ${merchant.name} (${merchant.email})`);
  console.log(`Current status: ${merchant.status}`);
  console.log();

  const newRawSecret = generateJweSecret();
  const encrypted = encryptMerchantSecretAtRest(newRawSecret);

  await prisma.merchant.update({
    where: { id: MERCHANT_ID },
    data: {
      jweSecret: encrypted.ciphertext,
    },
  });

  console.log('✅ Secret rotated successfully!');
  console.log();
  console.log('========================================');
  console.log('IMPORTANT: Save this secret immediately!');
  console.log('It will only be shown once.');
  console.log('========================================');
  console.log();
  console.log('PLAINTEXT JWE SECRET:');
  console.log(newRawSecret);
  console.log();
  console.log('Use this in your external integration as PAYGET_JWE_SECRET');
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
