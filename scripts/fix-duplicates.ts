import { prisma } from '@/lib/prisma';

async function main() {
  console.log('Checking for duplicates in MerchantTeamMember...');

  // Get all team members
  const allMembers = await prisma.merchantTeamMember.findMany();

  // Find email duplicates
  const emailMap = new Map<string, any[]>();
  for (const member of allMembers) {
    const key = `${member.merchantId}-${member.email}`;
    if (!emailMap.has(key)) {
      emailMap.set(key, []);
    }
    emailMap.get(key)!.push(member);
  }

  const emailDuplicates = Array.from(emailMap.entries())
    .filter(([_, members]) => members.length > 1);

  console.log(`Found ${emailDuplicates.length} email duplicates:`);
  emailDuplicates.forEach(([key, members]) => {
    console.log(`  Key: ${key} - Count: ${members.length}`);
  });

  // Find phone duplicates (where phone is not null)
  const phoneMap = new Map<string, any[]>();
  for (const member of allMembers) {
    if (member.phone) {
      const key = `${member.merchantId}-${member.phone}`;
      if (!phoneMap.has(key)) {
        phoneMap.set(key, []);
      }
      phoneMap.get(key)!.push(member);
    }
  }

  const phoneDuplicates = Array.from(phoneMap.entries())
    .filter(([_, members]) => members.length > 1);

  console.log(`\nFound ${phoneDuplicates.length} phone duplicates:`);
  phoneDuplicates.forEach(([key, members]) => {
    console.log(`  Key: ${key} - Count: ${members.length}`);
  });

  // Now let's remove duplicates, keeping only the most recent one
  console.log('\nRemoving duplicates...');

  // Process email duplicates
  for (const [_, members] of emailDuplicates) {
    // Sort by createdAt descending (most recent first)
    members.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Keep the first (most recent) record, delete the rest
    const toDelete = members.slice(1);
    for (const record of toDelete) {
      await prisma.merchantTeamMember.delete({
        where: { id: record.id }
      });
      console.log(`  Deleted: ${record.id} (Merchant: ${record.merchantId}, Email: ${record.email})`);
    }
  }

  // Process phone duplicates
  for (const [_, members] of phoneDuplicates) {
    // Sort by createdAt descending (most recent first)
    members.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Keep the first (most recent) record, delete the rest
    const toDelete = members.slice(1);
    for (const record of toDelete) {
      await prisma.merchantTeamMember.delete({
        where: { id: record.id }
      });
      console.log(`  Deleted: ${record.id} (Merchant: ${record.merchantId}, Phone: ${record.phone})`);
    }
  }

  console.log('\nDuplicate removal complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
