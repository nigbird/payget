#!/usr/bin/env tsx

/**
 * Verifies a merchant's JWE secret by decrypting it from the database.
 * This helps you confirm that the secret you're using in external integrations
 * matches the one stored in the database.
 */

import { db } from '@/app/lib/db';
import { decryptMerchantSecretInMemory } from '@/lib/merchant-secret';

async function main() {
  const merchantId = process.argv[2];

  if (!merchantId) {
    console.error('Please provide a merchant ID as an argument.');
    console.error('Usage: npx tsx scripts/verify-merchant-secret.ts <merchant-id>');
    process.exit(1);
  }

  try {
    console.log(`Fetching merchant: ${merchantId}`);
    
    const merchant = await db.getMerchantById(merchantId, { includeSecret: true });
    
    if (!merchant) {
      console.error(`Merchant not found: ${merchantId}`);
      process.exit(1);
    }

    console.log(`Merchant found: ${merchant.name} (${merchant.id})`);
    console.log(`Stored secret (encrypted): ${merchant.jweSecret.substring(0, 20)}...`);

    const { plaintext } = decryptMerchantSecretInMemory(merchant.jweSecret);
    
    console.log('\n✅ DECRYPTED PLAINTEXT SECRET:');
    console.log('--------------------------------------------------');
    console.log(plaintext);
    console.log('--------------------------------------------------');
    console.log('\n💡 Use this EXACT secret in your external integration as PAYGET_JWE_SECRET!');
    console.log('   (Do not include any quotes or spaces around it in your .env file)');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
