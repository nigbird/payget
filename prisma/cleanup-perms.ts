import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Cleaning up obsolete permissions...')
  
  // Delete DASHBOARD_USER_VIEW if it exists
  const deleted = await prisma.permission.deleteMany({
    where: {
      name: 'DASHBOARD_USER_VIEW'
    }
  })
  
  console.log(`Deleted ${deleted.count} obsolete permissions.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
