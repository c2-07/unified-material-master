import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import csv from 'csv-parser'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log("Starting database seeding...")
  
  // Check if data already exists to prevent duplicates on restart
  const existingCount = await prisma.localInventory.count();
  if (existingCount > 0) {
    console.log(`Found ${existingCount} existing inventory items. Skipping seed to prevent duplicates.`);
    return;
  }

  // 1. Ingest real data from CSV
  const csvPath = path.join(__dirname, '../ML_Training_Data_Master.csv')
  const records: any[] = []

  if (fs.existsSync(csvPath)) {
    console.log(`Reading CSV from ${csvPath}`)
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (data) => records.push(data))
        .on('end', resolve)
        .on('error', reject)
    })
    
    const uniqueCpses = new Set<string>();

    // Process only first 500 rows for quick seeding
    for (const row of records.slice(0, 500)) {
      const cpseId = row['Tenant_CPSE'] || 'UNKNOWN_CPSE'
      const localCode = row['Legacy_System_Code'] || 'UNK-000'
      const description = row['Material_Description_Raw'] || 'Unknown Item'
      const uom = row['UOM_Used_By_CPSE'] || 'NOS'
      const quantity = parseFloat(row['Quantity_In_Stock'] || '0')
      const status = row['Entry_Status'] || 'ACTIVE_INTERNAL'
      const natCode = row['Target_National_Code'] || 'PENDING-NEW-CODE'
      
      uniqueCpses.add(cpseId);

      // Upsert local inventory
      const inventory = await prisma.localInventory.create({
        data: {
          tenantCpseId: cpseId,
          localMaterialCode: localCode,
          localDescription: description,
          localBaseCategory: row['Target_Base_Item'] || 'Misc',
          quantity: quantity,
          uom: uom,
          statusTag: status
        }
      })

      // Add Global Mapping
      await prisma.globalCatalogMapping.create({
        data: {
          cpseId: cpseId,
          cpseLocalCode: localCode,
          nationalMaterialCode: natCode,
          aiConfidenceScore: Math.random() * (100 - 80) + 80 // Dummy score > 80
        }
      })
      
      // Dummy Audit Log
      await prisma.localAuditLog.create({
        data: {
          inventoryId: inventory.id,
          actionType: 'INITIAL_IMPORT',
          quantityChanged: quantity,
          workOrderRef: 'MIGRATION-001'
        }
      })
    }
    console.log(`Seeded ${Math.min(500, records.length)} items from CSV.`)
    
    // Create User accounts for each unique CPSE
    console.log(`Creating User accounts for ${uniqueCpses.size} CPSEs...`);
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('password123', 10);
    
    for (const cpse of uniqueCpses) {
      await prisma.user.upsert({
        where: { email: `admin@${cpse.toLowerCase()}.in` },
        update: {},
        create: {
          email: `admin@${cpse.toLowerCase()}.in`,
          passwordHash: hash,
          role: 'CPSE',
          tenantCpseId: cpse
        }
      });
    }

    // Ministry User
    await prisma.user.upsert({
      where: { email: 'admin@ministry.gov' },
      update: {},
      create: {
        email: 'admin@ministry.gov',
        passwordHash: hash,
        role: 'MINISTRY'
      }
    });

  } else {
    console.log("CSV not found, skipping real data injection.")
  }

  // 2. Add Dummy Demands (Simulate ONGC asking for items)
  console.log("Adding Dummy Demands & Routings...")
  const batch = await prisma.ministryDemandBatch.create({
    data: {
      requestingCpseId: 'ONGC',
      overallStatus: 'PROCESSING'
    }
  })

  const item1 = await prisma.ministryDemandItem.create({
    data: {
      batchId: batch.id,
      nationalMaterialCode: 'NAT-PVF-3002',
      requestedQty: 100,
      status: 'SOURCED'
    }
  })

  // ONGC's outbound demand table
  await prisma.outboundDemand.create({
    data: {
      tenantCpseId: 'ONGC',
      localMaterialCode: 'ONGC-PIPE-REQ-01',
      requestedQty: 100,
      ministryStatus: 'FOUND_AVAILABLE',
      cpseFinalDecision: 'PENDING'
    }
  })

  // Ministry routed this to BHEL
  await prisma.ministryOrderRouting.create({
    data: {
      demandItemId: item1.id,
      supplierCpseId: 'BHEL',
      supplierStatus: 'ACCEPTED',
      buyerStatus: 'PENDING_BUYER'
    }
  })

  // BHEL sees this as an inbound supply request
  await prisma.inboundSupplyRequest.create({
    data: {
      tenantCpseId: 'BHEL',
      localMaterialCode: 'BHEL-PIPE-LOCAL-99',
      qtyRequested: 100,
      ourDecision: 'APPROVED'
    }
  })

  console.log("Database seeded successfully!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
