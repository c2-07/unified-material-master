import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const demands = await prisma.ministryDemandBatch.findMany({
    include: {
      items: {
        include: { routings: true }
      }
    }
  });
  console.log(JSON.stringify(demands, null, 2));
}
main();
