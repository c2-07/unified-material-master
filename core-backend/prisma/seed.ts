import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import csv from 'csv-parser'
import path from 'path'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PASSWORD = 'password123'

/**
 * Wipes all transactional and catalog data, then rebuilds it.
 *
 * Unlike the previous seed this does NOT bail out when data already
 * exists — it clears first, so re-running always gives a known state.
 * That matters because the demo data is deliberately spread across
 * every stage of the demand flow, and stale rows from a previous run
 * make it impossible to tell which case you are looking at.
 */
async function reset() {
  // Order matters only for readability; there are no FK constraints
  // between the local and global halves of the schema.
  await prisma.inboundSupplyRequest.deleteMany()
  await prisma.ministryOrderRouting.deleteMany()
  await prisma.ministryDemandItem.deleteMany()
  await prisma.ministryDemandBatch.deleteMany()
  await prisma.outboundDemand.deleteMany()
  await prisma.globalAuditLog.deleteMany()
  await prisma.localAuditLog.deleteMany()
  await prisma.globalCatalogMapping.deleteMany()
  await prisma.localInventory.deleteMany()
  await prisma.user.deleteMany()
}

async function main() {
  console.log('Resetting database...')
  await reset()

  // ── 1. Catalog and inventory, from the real ML training data ────────────
  // The CSV lives at the repo root. Historically the only path checked was
  // core-backend/ML_Training_Data_Master.csv, a byte-identical duplicate, which
  // meant a fresh clone or a container image without that copy silently seeded
  // an empty catalog and the suppliers/demand endpoints returned nothing.
  const csvCandidates = [
    process.env.SEED_CSV_PATH,
    path.join(__dirname, '../ML_Training_Data_Master.csv'),
    path.join(__dirname, '../../../ML_Training_Data_Master.csv'),
  ].filter((p): p is string => Boolean(p))

  const csvPath = csvCandidates.find((p) => fs.existsSync(p))

  if (!csvPath && process.env.SEED_REQUIRE_CSV === '1') {
    throw new Error(
      `Catalog CSV not found and SEED_REQUIRE_CSV=1. Looked in:\n  ${csvCandidates.join('\n  ')}`
    )
  }

  const records: any[] = []

  if (csvPath) {
    console.log(`Reading catalog CSV from ${csvPath}`)
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (d) => records.push(d))
        .on('end', resolve)
        .on('error', reject)
    })
  } else {
    console.warn('Catalog CSV not found; the suppliers endpoint will return nothing.')
  }

  // Group by national code so the demand flow below can pick materials that
  // genuinely have stock in more than one CPSE.
  const byNatCode = new Map<string, { cpse: string; localCode: string; desc: string; qty: number; base: string; uom: string }[]>()
  const cpses = new Set<string>()
  const ROW_LIMIT = 10500

  for (const row of records.slice(0, ROW_LIMIT)) {
    const cpseId = (row['Tenant_CPSE'] || '').trim()
    const localCode = (row['Legacy_System_Code'] || '').trim()
    const natCode = (row['Target_National_Code'] || '').trim()
    if (!cpseId || !localCode || !natCode || natCode === 'PENDING-NEW-CODE') continue

    const qty = parseFloat(row['Quantity_In_Stock'] || '0')
    if (!Number.isFinite(qty) || qty <= 0) continue

    cpses.add(cpseId)
    if (!byNatCode.has(natCode)) byNatCode.set(natCode, [])
    const bucket = byNatCode.get(natCode)!
    // if (bucket.some((b) => b.cpse === cpseId)) continue
    bucket.push({
      cpse: cpseId,
      localCode,
      desc: row['Material_Description_Raw'] || 'Unknown Item',
      qty,
      base: row['Target_Base_Item'] || 'Misc',
      uom: row['UOM_Used_By_CPSE'] || 'NOS',
    })
  }

  const CACHE_PATH = path.join(__dirname, 'ai_confidence_cache.json')
  let aiCache: Record<string, number> = {}
  if (fs.existsSync(CACHE_PATH)) {
    try { aiCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) } catch (e) {}
  }
  let cacheUpdated = false

  let invCount = 0
  let mapCount = 0
  for (const [natCode, holders] of byNatCode) {
    for (const h of holders) {
      const inventory = await prisma.localInventory.create({
        data: {
          tenantCpseId: h.cpse,
          localMaterialCode: h.localCode,
          localDescription: h.desc,
          localBaseCategory: h.base,
          quantity: h.qty,
          uom: h.uom,
          statusTag: 'ACTIVE',
        },
      })
      invCount++

      // Keep confidence at 100 for a select few items to ensure the demand
      // routing fixtures work (the suppliers endpoint filters on 100).
      const isFixtureCode = Array.from(byNatCode.keys()).indexOf(natCode) < 10;
      let score = 100;

      if (!isFixtureCode) {
        if (Math.random() > 0.5) {
          // Use ML API
          try {
            const mlApiUrl = process.env.ML_API_URL || 'http://ml_api:8000/api/match-material';
            const res = await fetch(mlApiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ raw_description: h.desc })
            });
            const data = await res.json();
            if (data && data.confidence_score) {
              score = data.confidence_score;
            } else {
              score = 80 + Math.random() * 19.9;
            }
          } catch (err) {
            score = 80 + Math.random() * 19.9;
          }
        } else {
          // Randomize
          score = 80 + Math.random() * 19.9;
        }
      }

      await prisma.globalCatalogMapping.create({
        data: {
          cpseId: h.cpse,
          cpseLocalCode: h.localCode,
          nationalMaterialCode: natCode,
          aiConfidenceScore: parseFloat(score.toFixed(2)),
        },
      })
      mapCount++

      await prisma.localAuditLog.create({
        data: {
          inventoryId: inventory.id,
          actionType: 'INITIAL_IMPORT',
          quantityChanged: h.qty,
          workOrderRef: 'SEED-IMPORT',
        },
      })
    }
  }
  if (cacheUpdated) {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(aiCache, null, 2))
  }
  console.log(`Seeded ${invCount} inventory rows and ${mapCount} catalog mappings across ${byNatCode.size} national codes.`)

  // ── 2. Users ────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10)
  for (const cpse of cpses) {
    await prisma.user.create({
      data: { email: `admin@${cpse.toLowerCase()}.in`, passwordHash: hash, role: 'CPSE', tenantCpseId: cpse },
    })
  }
  await prisma.user.create({
    data: { email: 'admin@ministry.gov', passwordHash: hash, role: 'MINISTRY' },
  })
  console.log(`Created ${cpses.size} CPSE users + 1 ministry user (password: ${PASSWORD}).`)

  // ── 3. Demand flow fixtures ─────────────────────────────────────────────
  // One batch per stage of the flow, so every state the Ministry routing
  // page can filter on is represented:
  //
  //   NEEDS_SUPPLIER  requester asked, Ministry has not picked anyone yet
  //   ROUTED          Ministry routed, supplier has not answered
  //   SUPPLIER_ACCEPTED supplier said yes, Ministry has not told the requester
  //                   (this is the one that enables "Notify Requester")
  //   ACKNOWLEDGED    Ministry notified, requester sees the outcome
  //   DECLINED        supplier refused, so the Ministry must pick someone else
  //   UNAVAILABLE     no supplier had it

  // Prefer national codes with genuine multi-CPSE stock so the supplier
  // picker has something to choose between.
  const multi = [...byNatCode.entries()]
    .filter(([, h]) => h.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)

  const single = [...byNatCode.entries()].filter(([, h]) => h.length === 1)

  const made: string[] = []

  async function makeFlow(opts: {
    label: string
    requester: string
    natCode: string
    qty: number
    stage: 'NEEDS_SUPPLIER' | 'ROUTED' | 'SUPPLIER_ACCEPTED' | 'ACKNOWLEDGED' | 'DECLINED' | 'UNAVAILABLE' | 'NO_SUPPLIER_HAS_STOCK'
  }) {
    const holders = byNatCode.get(opts.natCode) ?? []
    // Requester must be a real user, and must not be its own supplier.
    const requester = cpses.has(opts.requester) ? opts.requester : [...cpses][0]
    const candidates = holders.filter((h) => h.cpse !== requester)
    const supplier = candidates[0]

    const batch = await prisma.ministryDemandBatch.create({
      data: { requestingCpseId: requester, overallStatus: 'PROCESSING' },
    })

    // status: what the Ministry sees on the demand item
    const statusMap = {
      NEEDS_SUPPLIER: 'SOURCING',
      ROUTED: 'ROUTED',
      SUPPLIER_ACCEPTED: 'SUPPLIER_ACCEPTED',
      ACKNOWLEDGED: 'ACKNOWLEDGED',
      DECLINED: 'ROUTED',
      UNAVAILABLE: 'UNAVAILABLE',
      NO_SUPPLIER_HAS_STOCK: 'SOURCING',
    } as const

    const item = await prisma.ministryDemandItem.create({
      data: {
        batchId: batch.id,
        nationalMaterialCode: opts.natCode,
        requestedQty: opts.qty,
        status: statusMap[opts.stage],
      },
    })

    // The requester's own record of the request. ministryDemandItemId is the
    // back-link send-ack uses to find the right row — without it the
    // requester never gets their status updated.
    const outbound = await prisma.outboundDemand.create({
      data: {
        tenantCpseId: requester,
        localMaterialCode: holders.find((h) => h.cpse === requester)?.localCode ?? 'UNMAPPED-REQ',
        requestedQty: opts.qty,
        ministryStatus: opts.stage === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'PENDING_MINISTRY',
        cpseFinalDecision: 'PENDING',
        ministryDemandItemId: item.id,
      },
    })

    if (opts.stage === 'NEEDS_SUPPLIER' || opts.stage === 'UNAVAILABLE') {
      if (opts.stage === 'UNAVAILABLE') {
        await prisma.outboundDemand.update({
          where: { id: outbound.id },
          data: { ministryStatus: 'UNAVAILABLE' },
        })
        await prisma.ministryDemandBatch.update({
          where: { id: batch.id },
          data: { overallStatus: 'UNAVAILABLE' },
        })
      }
      made.push(opts.label)
      return
    }

    // A code can have many suppliers and still be unsatisfiable if the
    // request exceeds what any single one holds. The suppliers endpoint
    // filters on quantity >= 3000, so a very large ask returns nothing.
    if (opts.stage === 'NO_SUPPLIER_HAS_STOCK') {
      made.push(opts.label)
      return
    }

    if (!supplier) {
      // No eligible supplier for this code; fall back to NEEDS_SUPPLIER so the
      // fixture is still valid rather than half-built.
      await prisma.ministryDemandItem.update({ where: { id: item.id }, data: { status: 'SOURCING' } })
      made.push(`${opts.label} (no eligible supplier — left at SOURCING)`)
      return
    }

    const routing = await prisma.ministryOrderRouting.create({
      data: {
        demandItemId: item.id,
        supplierCpseId: supplier.cpse,
        supplierStatus: opts.stage === 'DECLINED' ? 'REJECTED' : opts.stage === 'ROUTED' ? 'PENDING_SUPPLIER' : 'ACCEPTED',
        buyerStatus: opts.stage === 'ACKNOWLEDGED' ? 'NOTIFIED' : 'PENDING_BUYER',
      },
    })

    // The supplier's copy. routingId is what makes their approve/decline
    // call flow back into the Ministry's routing record.
    await prisma.inboundSupplyRequest.create({
      data: {
        tenantCpseId: supplier.cpse,
        localMaterialCode: supplier.localCode,
        qtyRequested: opts.qty,
        ourDecision: opts.stage === 'ROUTED' ? 'PENDING' : opts.stage === 'DECLINED' ? 'DECLINED' : 'APPROVED',
        routingId: routing.id,
      },
    })

    if (opts.stage === 'ACKNOWLEDGED') {
      await prisma.outboundDemand.update({
        where: { id: outbound.id },
        data: { ministryStatus: 'FOUND_AVAILABLE', cpseFinalDecision: 'CONFIRMED' },
      })
      await prisma.ministryDemandBatch.update({
        where: { id: batch.id },
        data: { overallStatus: 'COMPLETED' },
      })
    }

    made.push(opts.label)
  }

  const pick = (list: [string, any[]][], n: number) => list.slice(0, n)

  // Spread requests across different requester CPSEs so the Ministry
  // "filter by requester" dropdown has more than one value to show.
  const requesterPool = [...cpses]
  let rr = 0
  const nextRequester = () => requesterPool[rr++ % requesterPool.length]

  // 1. Ministry received it, no supplier chosen yet.
  for (const [natCode, _] of pick(multi, 2)) {
    await makeFlow({ label: `NEEDS_SUPPLIER  ${natCode}`, requester: nextRequester(), natCode, qty: 120, stage: 'NEEDS_SUPPLIER' })
  }
  for (const [natCode, _] of pick(single, 1)) {
    await makeFlow({ label: `NEEDS_SUPPLIER  ${natCode} (single-supplier code)`, requester: nextRequester(), natCode, qty: 60, stage: 'NEEDS_SUPPLIER' })
  }

  // 2. Ministry routed it, supplier has not answered.
  for (const [natCode] of pick(multi, 2)) {
    await makeFlow({ label: `ROUTED          ${natCode}`, requester: nextRequester(), natCode, qty: 250, stage: 'ROUTED' })
  }

  // 3. Supplier accepted — Ministry now has something to acknowledge.
  for (const [natCode] of pick(multi, 3).slice(2)) {
    await makeFlow({ label: `SUPPLIER_ACCEPTED ${natCode}`, requester: nextRequester(), natCode, qty: 75, stage: 'SUPPLIER_ACCEPTED' })
  }

  // 4. Fully closed loop.
  for (const [natCode] of pick(multi, 5).slice(3)) {
    await makeFlow({ label: `ACKNOWLEDGED    ${natCode}`, requester: nextRequester(), natCode, qty: 500, stage: 'ACKNOWLEDGED' })
  }

  // 5. Supplier refused — Ministry needs to re-route.
  for (const [natCode] of pick(multi, 1)) {
    await makeFlow({ label: `DECLINED        ${natCode}`, requester: nextRequester(), natCode, qty: 90, stage: 'DECLINED' })
  }

  // 6. Request is larger than any supplier can cover, so the supplier
  //    lookup returns nothing and the Ministry cannot route it. Every
  //    code in this dataset has 16+ holders, so an oversized qty is the
  //    only way to reach a genuine dead end.
  if (multi.length > 0) {
    const natCode = multi[0][0]
    await makeFlow({ label: `UNROUTABLE      ${natCode} (qty exceeds all stock)`, requester: nextRequester(), natCode, qty: 99_999_999, stage: 'NO_SUPPLIER_HAS_STOCK' })
  }

  console.log('\nDemand flow fixtures:')
  for (const m of made) console.log(`  - ${m}`)

  // ── 4. Audit trail, so the Ministry audit page is not empty ─────────────
  const demandItems = await prisma.ministryDemandItem.findMany({ include: { routings: true } })
  for (const item of demandItems) {
    const batch = await prisma.ministryDemandBatch.findUnique({ where: { id: item.batchId } })
    await prisma.globalAuditLog.create({
      data: {
        actorType: 'CPSE_SYSTEM',
        actorId: batch?.requestingCpseId ?? null,
        action: 'DEMAND_RAISED',
        targetTable: 'MinistryDemandItem',
        targetId: item.id,
        description: `${batch?.requestingCpseId} requested ${item.requestedQty} of ${item.nationalMaterialCode}`,
      },
    })
    for (const r of item.routings) {
      await prisma.globalAuditLog.create({
        data: {
          actorType: 'MINISTRY_ADMIN',
          actorId: 'admin@ministry.gov',
          action: 'DEMAND_ROUTED',
          targetTable: 'MinistryOrderRouting',
          targetId: r.id,
          description: `Ministry routed ${item.nationalMaterialCode} to ${r.supplierCpseId}`,
        },
      })
      if (r.supplierStatus === 'ACCEPTED' || r.supplierStatus === 'REJECTED') {
        await prisma.globalAuditLog.create({
          data: {
            actorType: 'CPSE_SYSTEM',
            actorId: r.supplierCpseId,
            action: r.supplierStatus === 'ACCEPTED' ? 'SUPPLIER_ACCEPTED' : 'SUPPLIER_DECLINED',
            targetTable: 'MinistryOrderRouting',
            targetId: r.id,
            description: `${r.supplierCpseId} ${r.supplierStatus === 'ACCEPTED' ? 'accepted' : 'declined'} the request for ${item.nationalMaterialCode}`,
          },
        })
      }
    }
    if (item.status === 'ACKNOWLEDGED') {
      await prisma.globalAuditLog.create({
        data: {
          actorType: 'MINISTRY_ADMIN',
          actorId: 'admin@ministry.gov',
          action: 'DEMAND_ACKNOWLEDGED',
          targetTable: 'MinistryDemandItem',
          targetId: item.id,
          description: `Ministry notified ${batch?.requestingCpseId} that ${item.nationalMaterialCode} was secured`,
        },
      })
    }
  }
  console.log(`Seeded ${await prisma.globalAuditLog.count()} global audit log entries.`)

  const counts = {
    inventory: await prisma.localInventory.count(),
    mappings: await prisma.globalCatalogMapping.count(),
    users: await prisma.user.count(),
    batches: await prisma.ministryDemandBatch.count(),
    demandItems: await prisma.ministryDemandItem.count(),
    routings: await prisma.ministryOrderRouting.count(),
    inbound: await prisma.inboundSupplyRequest.count(),
    outbound: await prisma.outboundDemand.count(),
  }
  console.log('\nSeed complete:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
