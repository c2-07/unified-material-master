import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const mappings = await prisma.globalCatalogMapping.findMany({
    take: 15,
    orderBy: { aiConfidenceScore: 'desc' }
  });
  
  for (const m of mappings) {
    await prisma.globalCatalogMapping.update({
      where: { id: m.id },
      data: { aiConfidenceScore: 100 }
    });
  }
  
  console.log('Approved 15 mappings.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.();
});
