import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cpseUsers = await prisma.user.findMany({ where: { role: 'CPSE' } });
  
  for (const user of cpseUsers) {
    if (!user.tenantCpseId) continue;
    const cpseId = user.tenantCpseId;
    
    console.log(`Seeding for ${cpseId}...`);
    
    // Clear old ones first to prevent infinite growth
    await prisma.outboundDemand.deleteMany({ where: { tenantCpseId: cpseId } });
    await prisma.inboundSupplyRequest.deleteMany({ where: { tenantCpseId: cpseId } });
    
    // Create 3 Material Requests (OutboundDemand)
    for (let i = 1; i <= 3; i++) {
      await prisma.outboundDemand.create({
        data: {
          tenantCpseId: cpseId,
          localMaterialCode: `REQ-${cpseId}-00${i}`,
          requestedQty: Math.floor(Math.random() * 50) + 10,
          ministryStatus: 'PENDING_MINISTRY',
          cpseFinalDecision: 'PENDING'
        }
      });
    }

    // Create 3 Orders to Fulfill (InboundSupplyRequest)
    for (let i = 1; i <= 3; i++) {
      await prisma.inboundSupplyRequest.create({
        data: {
          tenantCpseId: cpseId,
          localMaterialCode: `SUP-${cpseId}-00${i}`,
          qtyRequested: Math.floor(Math.random() * 200) + 50,
          ourDecision: 'PENDING'
        }
      });
    }
  }
  
  console.log("Seeding complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
