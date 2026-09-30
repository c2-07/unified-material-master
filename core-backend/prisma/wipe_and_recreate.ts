import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Wiping demands...");
  await prisma.outboundDemand.deleteMany();
  await prisma.inboundSupplyRequest.deleteMany();
  await prisma.ministryOrderRouting.deleteMany();
  await prisma.ministryDemandItem.deleteMany();
  await prisma.ministryDemandBatch.deleteMany();

  console.log("Creating new clean requests...");
  // Let's create ONGC request for NAT-PVF-3002
  const b1 = await prisma.ministryDemandBatch.create({
    data: {
      requestingCpseId: 'ONGC',
      overallStatus: 'PROCESSING',
      items: {
        create: { nationalMaterialCode: 'NAT-PVF-3002', requestedQty: 100, status: 'SOURCING' }
      }
    }
  });
  // Also create ONGC OutboundDemand
  await prisma.outboundDemand.create({
    data: {
      tenantCpseId: 'ONGC',
      localMaterialCode: 'ONGC-V-1234',
      requestedQty: 100,
      ministryStatus: 'SUBMITTED'
    }
  });

  // Let's create SAIL request for NAT-CHM-6002
  const b2 = await prisma.ministryDemandBatch.create({
    data: {
      requestingCpseId: 'SAIL',
      overallStatus: 'PROCESSING',
      items: {
        create: { nationalMaterialCode: 'NAT-CHM-6002', requestedQty: 450, status: 'SOURCING' }
      }
    }
  });
  await prisma.outboundDemand.create({
    data: {
      tenantCpseId: 'SAIL',
      localMaterialCode: 'SAIL-CHEM-99',
      requestedQty: 450,
      ministryStatus: 'SUBMITTED'
    }
  });

  // Let's create IOCL request for NAT-FAS-2003
  const b3 = await prisma.ministryDemandBatch.create({
    data: {
      requestingCpseId: 'IOCL',
      overallStatus: 'PROCESSING',
      items: {
        create: { nationalMaterialCode: 'NAT-FAS-2003', requestedQty: 1200, status: 'SOURCING' }
      }
    }
  });
  await prisma.outboundDemand.create({
    data: {
      tenantCpseId: 'IOCL',
      localMaterialCode: 'IOCL-FAST-01',
      requestedQty: 1200,
      ministryStatus: 'SUBMITTED'
    }
  });

  console.log("Done!");
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
