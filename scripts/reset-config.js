const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Check existing configs
  const configs = await prisma.dashboardConfig.findMany();
  console.log('Existing configs:', JSON.stringify(configs, null, 2));

  // Delete the quicksilver config so DEFAULT_LAYOUT is used
  if (configs.length > 0) {
    const deleted = await prisma.dashboardConfig.deleteMany({
      where: { clientId: 'quicksilver' }
    });
    console.log('Deleted configs:', deleted.count);
  }

  // Verify deletion
  const remaining = await prisma.dashboardConfig.findMany();
  console.log('Remaining configs:', remaining.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
