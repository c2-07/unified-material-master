import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-sih-key';

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  const { email, password, role, tenantCpseId } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role || 'CPSE',
        tenantCpseId: role === 'MINISTRY' ? null : tenantCpseId
      }
    });
    res.json({ message: 'User registered successfully', userId: user.id });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists or invalid data' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, tenantCpseId: user.tenantCpseId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { email: user.email, role: user.role, tenantCpseId: user.tenantCpseId }
  });
});

// ==========================================
// DEV / PROTOTYPE ENDPOINTS
// ==========================================
app.get('/api/dev/users', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { email: true, role: true, tenantCpseId: true }
  });
  res.json(users);
});

app.post('/api/dev/login-as', async (req, res) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const token = jwt.sign(
    { userId: user.id, role: user.role, tenantCpseId: user.tenantCpseId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { email: user.email, role: user.role, tenantCpseId: user.tenantCpseId }
  });
});

// Middleware to protect routes
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Middleware to ensure CPSEs can only access their own data
const requireCpseMatch = (req: any, res: any, next: any) => {
  if (req.user.role !== 'MINISTRY' && req.user.tenantCpseId !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden: You can only access your own CPSE data' });
  }
  next();
};

// Middleware for Ministry only
const requireMinistry = (req: any, res: any, next: any) => {
  if (req.user.role !== 'MINISTRY') {
    return res.status(403).json({ error: 'Forbidden: Ministry access required' });
  }
  next();
};

// ==========================================
// CPSE ENDPOINTS (Local DB Access)
// ==========================================

// 1. Get Inventory for a specific CPSE
app.get('/api/cpse/:id/inventory', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id } = req.params;
  const inventory = await prisma.localInventory.findMany({
    where: { tenantCpseId: id },
    include: { auditLogs: true },
    orderBy: { createdAt: 'desc' }
  });

  const globalMappings = await prisma.globalCatalogMapping.findMany({
    where: { cpseId: id }
  });

  const inventoryWithNationalCode = inventory.map(item => {
    const mapping = globalMappings.find(m => m.cpseLocalCode === item.localMaterialCode);
    return {
      ...item,
      nationalMaterialCode: mapping ? mapping.nationalMaterialCode : "PENDING REVIEW"
    };
  });

  res.json(inventoryWithNationalCode);
});

// 2. Add New Inventory Item
app.post('/api/cpse/:id/inventory', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id } = req.params;
  const { localMaterialCode, localDescription, quantity, uom, statusTag } = req.body;
  
  const newItem = await prisma.localInventory.create({
    data: {
      tenantCpseId: id,
      localMaterialCode,
      localDescription,
      quantity,
      uom,
      statusTag
    }
  });

  // Track in Audit
  await prisma.localAuditLog.create({
    data: {
      inventoryId: newItem.id,
      actionType: 'MANUAL_ENTRY',
      quantityChanged: quantity,
      workOrderRef: 'USER_INPUT'
    }
  });

  res.json(newItem);
});

// 3. Update Inventory Item
app.patch('/api/cpse/:id/inventory/:invId', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id, invId } = req.params;
  const { localDescription, quantity, uom, statusTag } = req.body;

  // Verify item belongs to CPSE
  const existing = await prisma.localInventory.findFirst({ where: { id: invId, tenantCpseId: id } });
  if (!existing) return res.status(404).json({ error: 'Inventory not found' });

  const updatedItem = await prisma.localInventory.update({
    where: { id: invId },
    data: { localDescription, quantity, uom, statusTag }
  });

  if (quantity !== undefined && quantity !== existing.quantity) {
    await prisma.localAuditLog.create({
      data: {
        inventoryId: invId,
        actionType: 'MANUAL_UPDATE',
        quantityChanged: quantity - existing.quantity,
        workOrderRef: 'USER_EDIT'
      }
    });
  }

  res.json(updatedItem);
});

// 4. Delete Inventory Item

// ROLLBACK SYNC ENDPOINT
app.post('/api/cpse/:id/inventory/bulk-rollback', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id } = req.params;
  const { inventoryIds } = req.body;
  if (!inventoryIds || !Array.isArray(inventoryIds)) {
    return res.status(400).json({ error: 'Missing inventoryIds' });
  }

  try {
    // Delete local audit logs first due to FK constraints
    await prisma.localAuditLog.deleteMany({
      where: {
        inventoryId: { in: inventoryIds }
      }
    });

    // Delete inventory items
    const deleted = await prisma.localInventory.deleteMany({
      where: {
        id: { in: inventoryIds },
        tenantCpseId: id
      }
    });

    res.json({ message: 'Rollback successful', deletedCount: deleted.count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Rollback failed' });
  }
});


app.delete('/api/cpse/:id/inventory/:invId', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id, invId } = req.params;

  const existing = await prisma.localInventory.findFirst({ where: { id: invId, tenantCpseId: id } });
  if (!existing) return res.status(404).json({ error: 'Inventory not found' });

  await prisma.$transaction(async (tx) => {
    await tx.localAuditLog.deleteMany({ where: { inventoryId: invId } });
    
    // Log the deletion to GlobalAuditLog before deleting the item
    await tx.globalAuditLog.create({
      data: {
        actorType: 'CPSE_SYSTEM',
        actorId: id,
        action: 'INVENTORY_DELETED',
        targetTable: 'LocalInventory',
        targetId: invId,
        description: `Deleted inventory item ${existing.localMaterialCode} (${existing.localDescription})`
      }
    });

    await tx.localInventory.delete({ where: { id: invId } });
  });

  res.json({ message: 'Inventory item deleted' });
});

// 5. Bulk Upload Inventory via CSV
app.post('/api/cpse/:id/inventory/bulk-upload', authenticateToken, requireCpseMatch, upload.single('file'), (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const results: any[] = [];
  const stream = Readable.from(req.file.buffer);

  stream
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        let importedCount = 0;
        const importedIds: string[] = [];
        for (const row of results) {
          if (!row.localMaterialCode) continue;

          const newItem = await prisma.localInventory.create({
            data: {
              tenantCpseId: id,
              localMaterialCode: row.localMaterialCode,
              localDescription: row.localDescription || 'No Description',
              localBaseCategory: row.localBaseCategory || 'Other',
              quantity: parseInt(row.quantity) || 0,
              uom: row.uom || 'EA',
              statusTag: 'ACTIVE'
            }
          });

          await prisma.localAuditLog.create({
            data: {
              inventoryId: newItem.id,
              actionType: 'INITIAL_IMPORT',
              quantityChanged: newItem.quantity,
              workOrderRef: 'BULK_CSV_UPLOAD'
            }
          });
          importedCount++;
          importedIds.push(newItem.id);
        }
        res.json({ message: 'Bulk upload successful', rowsImported: importedCount, importedIds });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database insertion error during bulk upload' });
      }
    });
});

// GET Outbound Demands
app.get('/api/cpse/:id/demands', authenticateToken, requireCpseMatch, async (req, res) => {
  const demands = await prisma.outboundDemand.findMany({
    where: { tenantCpseId: req.params.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json(demands);
});

// GET Inbound Supply Requests
app.get('/api/cpse/:id/inbound-requests', authenticateToken, requireCpseMatch, async (req, res) => {
  const reqs = await prisma.inboundSupplyRequest.findMany({
    where: { tenantCpseId: req.params.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json(reqs);
});

// 4. Make an Outbound Demand to the Ministry
app.post('/api/cpse/:id/demands', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id } = req.params;
  const { localMaterialCode, requestedQty } = req.body;

  let demand = await prisma.outboundDemand.create({
    data: { tenantCpseId: id, localMaterialCode, requestedQty }
  });

  // Sync to Ministry
  const mapping = await prisma.globalCatalogMapping.findFirst({
    where: { cpseId: id, cpseLocalCode: localMaterialCode }
  });
  
  const nationalCode = mapping && mapping.nationalMaterialCode 
    ? mapping.nationalMaterialCode 
    : `UNMAPPED-${localMaterialCode}`;

  const batch = await prisma.ministryDemandBatch.create({
    data: { requestingCpseId: id }
  });
  const demandItem = await prisma.ministryDemandItem.create({
    data: {
      batchId: batch.id,
      nationalMaterialCode: nationalCode,
      requestedQty
    }
  });

  demand = await prisma.outboundDemand.update({
    where: { id: demand.id },
    data: { ministryDemandItemId: demandItem.id }
  });

  res.json(demand);
});

// 7. Update an Outbound Demand (Only if not yet processed)
app.patch('/api/cpse/:id/demands/:demandId', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id, demandId } = req.params;
  const { requestedQty } = req.body;

  const existing = await prisma.outboundDemand.findFirst({ where: { id: demandId, tenantCpseId: id } });
  if (!existing) return res.status(404).json({ error: 'Demand not found' });
  if (existing.ministryStatus !== 'PENDING_MINISTRY') return res.status(403).json({ error: 'Cannot edit a processed demand' });

  const updated = await prisma.outboundDemand.update({
    where: { id: demandId },
    data: { requestedQty }
  });
  res.json(updated);
});

// 8. Cancel an Outbound Demand
app.delete('/api/cpse/:id/demands/:demandId', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id, demandId } = req.params;

  const existing = await prisma.outboundDemand.findFirst({ where: { id: demandId, tenantCpseId: id } });
  if (!existing) return res.status(404).json({ error: 'Demand not found' });
  if (existing.ministryStatus !== 'PENDING_MINISTRY') return res.status(403).json({ error: 'Cannot delete a processed demand' });

  await prisma.outboundDemand.delete({ where: { id: demandId } });
  res.json({ message: 'Demand cancelled successfully' });
});

// 9. Respond to a Ministry supply request (Seller approving transfer)
app.patch('/api/cpse/:id/inbound-requests/:reqId', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id, reqId } = req.params;
  const { decision } = req.body; // 'APPROVED' or 'DECLINED'

  if (decision !== 'APPROVED' && decision !== 'DECLINED') {
    return res.status(400).json({ error: "decision must be APPROVED or DECLINED" });
  }

  const request = await prisma.inboundSupplyRequest.update({
    where: { id: reqId, tenantCpseId: id },
    data: { ourDecision: decision }
  });

  if (request.routingId) {
    const routing = await prisma.ministryOrderRouting.update({
      where: { id: request.routingId },
      data: { supplierStatus: decision === 'APPROVED' ? 'ACCEPTED' : 'REJECTED' }
    });

    if (decision === 'APPROVED') {
      // Supplier has agreed, but the Ministry still has to notify the
      // requester. Mark the item SUPPLIER_ACCEPTED so the Ministry's
      // "Notify Requester" action stays available, and leave the buyer's
      // OutboundDemand untouched until send-ack runs. Setting the buyer
      // to FOUND_AVAILABLE here would tell them the outcome before the
      // Ministry has actually sent it.
      await prisma.ministryDemandItem.update({
        where: { id: routing.demandItemId },
        data: { status: 'SUPPLIER_ACCEPTED' }
      });
    }
  }

  res.json(request);
});


// CPSE Audit Logs (Inventory actions + Demands)
app.get('/api/cpse/:id/audit-logs', authenticateToken, requireCpseMatch, async (req, res) => {
  const { id } = req.params;
  
  const inventoryLogs = await prisma.localAuditLog.findMany({
    where: { inventory: { tenantCpseId: id } },
    include: { inventory: true },
    orderBy: { timestamp: 'desc' },
    take: 100
  });

  const outbound = await prisma.outboundDemand.findMany({
    where: { tenantCpseId: id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const inbound = await prisma.inboundSupplyRequest.findMany({
    where: { tenantCpseId: id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const globalDeletions = await prisma.globalAuditLog.findMany({
    where: { actorId: id, action: 'INVENTORY_DELETED' },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const combined = [
    ...globalDeletions.map(g => ({
      id: g.id,
      inventoryId: g.targetId,
      actionType: g.action,
      quantityChanged: 0,
      workOrderRef: 'USER_DELETION',
      timestamp: g.createdAt,
      inventory: {
        localMaterialCode: 'DELETED',
        localDescription: g.description
      }
    })),
    ...inventoryLogs.map(log => ({
      id: log.id,
      inventoryId: log.inventoryId,
      actionType: log.actionType,
      quantityChanged: log.quantityChanged,
      workOrderRef: log.workOrderRef,
      timestamp: log.timestamp,
      inventory: log.inventory
    })),
    ...outbound.map(out => ({
      id: out.id,
      inventoryId: 'outbound',
      actionType: `OUTBOUND_${out.ministryStatus}`,
      quantityChanged: out.requestedQty,
      workOrderRef: 'DEMAND_REQUEST',
      timestamp: out.createdAt,
      inventory: {
        localMaterialCode: out.localMaterialCode,
        localDescription: 'Outbound Demand Request'
      }
    })),
    ...inbound.map(inb => ({
      id: inb.id,
      inventoryId: 'inbound',
      actionType: `INBOUND_${inb.ourDecision}`,
      quantityChanged: inb.qtyRequested,
      workOrderRef: 'SUPPLY_REQUEST',
      timestamp: inb.createdAt,
      inventory: {
        localMaterialCode: inb.localMaterialCode,
        localDescription: 'Inbound Supply Request'
      }
    }))
  ];

  combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json(combined.slice(0, 100));
});

// ==========================================
// MINISTRY ENDPOINTS (Global DB Access)
// ==========================================

// 1. Get Global Catalog Mapping (AI Review)

// ==========================================
// CPSE OVERVIEW ENDPOINT
// ==========================================
app.get('/api/cpse/:id/overview', authenticateToken, requireCpseMatch, async (req, res) => {
  try {
    const cpseId = req.params.id;
    
    const [
      activeRequestsCount,
      pendingOrdersCount,
      recentRequests,
      recentOrders,
      recentAuditLogs
    ] = await Promise.all([
      prisma.outboundDemand.count({ where: { tenantCpseId: cpseId, cpseFinalDecision: 'PENDING' } }),
      prisma.inboundSupplyRequest.count({ where: { tenantCpseId: cpseId, ourDecision: 'PENDING' } }),
      prisma.outboundDemand.findMany({ 
        where: { tenantCpseId: cpseId },
        orderBy: { createdAt: 'desc' },
        take: 3
      }),
      prisma.inboundSupplyRequest.findMany({ 
        where: { tenantCpseId: cpseId },
        orderBy: { createdAt: 'desc' },
        take: 3
      }),
      prisma.localAuditLog.findMany({
        where: { inventory: { tenantCpseId: cpseId } },
        orderBy: { timestamp: 'desc' },
        take: 3,
        include: { inventory: true }
      })
    ]);

    res.json({
      activeRequestsCount,
      pendingOrdersCount,
      recentRequests,
      recentOrders,
      recentAuditLogs
    });
  } catch (error) {
    console.error("Overview fetch error:", error);
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

// ==========================================
// MINISTRY OVERVIEW ENDPOINT
// ==========================================
app.get('/api/ministry/overview', authenticateToken, requireMinistry, async (req, res) => {
  try {
    const [
      connectedCpsesCount,
      globalItemsCount,
      highPriorityCount,
      recentSearches,
      recentRouting,
      recentAuditLogs
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CPSE' } }),
      prisma.globalCatalogMapping.count(),
      prisma.ministryDemandItem.count({ where: { status: 'SOURCING' } }),
      prisma.ministryDemandItem.findMany({ take: 3 }),
      prisma.ministryOrderRouting.findMany({ orderBy: { createdAt: 'desc' }, take: 3 }),
      prisma.globalAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 3 })
    ]);

    res.json({
      connectedCpsesCount,
      globalItemsCount,
      highPriorityCount,
      recentSearches,
      recentRouting,
      recentAuditLogs
    });
  } catch (error) {
    console.error(error); res.status(500).json({ error: "Failed to fetch ministry overview" });
  }
});

app.get('/api/ministry/catalog', authenticateToken, requireMinistry, async (req, res) => {
  const catalog = await prisma.globalCatalogMapping.findMany();
  const inventory = await prisma.localInventory.findMany({
    select: { tenantCpseId: true, localMaterialCode: true, localDescription: true, localBaseCategory: true }
  });
  
  // Fast lookup map
  const invMap = new Map();
  for (const inv of inventory) {
    invMap.set(`${inv.tenantCpseId}-${inv.localMaterialCode}`, {
      desc: inv.localDescription,
      cat: inv.localBaseCategory
    });
  }

  const enhancedCatalog = catalog.map(c => {
    const localData = invMap.get(`${c.cpseId}-${c.cpseLocalCode}`);
    return {
      ...c,
      localDescription: localData?.desc || "Unknown Description",
      localBaseCategory: localData?.cat || "Unknown Category"
    };
  });

  res.json(enhancedCatalog);
});

// 2. Update Global Catalog Mapping (Override AI)
app.patch('/api/ministry/catalog/:mappingId', authenticateToken, requireMinistry, async (req, res) => {
  const { mappingId } = req.params;
  const { nationalMaterialCode } = req.body;
  const updated = await prisma.globalCatalogMapping.update({
    where: { id: mappingId },
    data: { nationalMaterialCode, aiConfidenceScore: 100 } // Manual override implies 100% confidence
  });
  res.json(updated);
});

// 2b. Bulk Approve Mappings
app.post('/api/ministry/catalog/bulk-approve', authenticateToken, requireMinistry, async (req, res) => {
  const { mappingIds } = req.body;
  if (!mappingIds || !Array.isArray(mappingIds)) {
    return res.status(400).json({ error: "mappingIds array required" });
  }
  
  await prisma.globalCatalogMapping.updateMany({
    where: { id: { in: mappingIds } },
    data: { aiConfidenceScore: 100 }
  });
  
  res.json({ message: `Successfully approved ${mappingIds.length} mappings.` });
});

app.post('/api/ministry/catalog/clear-approvals', authenticateToken, requireMinistry, async (req, res) => {
  const result = await prisma.globalCatalogMapping.updateMany({
    where: { aiConfidenceScore: 100 },
    data: { aiConfidenceScore: 95 }
  });
  res.json({ success: true, count: result.count });
});

app.post('/api/ministry/catalog/bulk-override', authenticateToken, requireMinistry, async (req, res) => {
  const { overrides } = req.body;
  if (!overrides || !Array.isArray(overrides)) {
    return res.status(400).json({ error: "overrides array required" });
  }
  
  const updates = overrides.map((o: any) => 
    prisma.globalCatalogMapping.update({
      where: { id: o.id },
      data: { nationalMaterialCode: o.nationalMaterialCode, aiConfidenceScore: 100 }
    })
  );
  
  await prisma.$transaction(updates);
  res.json({ success: true, count: overrides.length });
});

app.post('/api/ministry/catalog/revert', authenticateToken, requireMinistry, async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: "items array required" });
  }
  
  const updates = items.map((o: any) => 
    prisma.globalCatalogMapping.update({
      where: { id: o.id },
      data: { nationalMaterialCode: o.nationalMaterialCode, aiConfidenceScore: o.aiConfidenceScore }
    })
  );
  
  await prisma.$transaction(updates);
  res.json({ success: true, count: items.length });
});

// 2c. View All Network Inventory (The True Global Catalog)
app.get('/api/ministry/global-inventory', authenticateToken, requireMinistry, async (req, res) => {
  const allInventory = await prisma.localInventory.findMany({
    orderBy: { tenantCpseId: 'asc' }
  });

  const mappings = await prisma.globalCatalogMapping.findMany({
    where: { aiConfidenceScore: 100 } // Only show fully approved codes
  });

  const mappingDict = new Map();
  for (const m of mappings) {
    mappingDict.set(`${m.cpseId}_${m.cpseLocalCode}`, m.nationalMaterialCode);
  }

  const enrichedInventory = allInventory.map(item => ({
    ...item,
    nationalMaterialCode: mappingDict.get(`${item.tenantCpseId}_${item.localMaterialCode}`) || "PENDING REVIEW"
  }));

  res.json(enrichedInventory);
});

// Find suppliers for a specific national material code
app.get('/api/ministry/suppliers/:nationalCode', authenticateToken, requireMinistry, async (req, res) => {
  const { nationalCode } = req.params;
  const excludeCpse = req.query.exclude as string;
  
  const mappings = await prisma.globalCatalogMapping.findMany({
    where: { nationalMaterialCode: nationalCode, aiConfidenceScore: 100 }
  });
  
  if (mappings.length === 0) {
    return res.json([]);
  }

  const orConditions = mappings.map(m => ({
    tenantCpseId: m.cpseId,
    localMaterialCode: m.cpseLocalCode
  }));

  // Only offer suppliers who can actually cover the requested quantity.
  // Falls back to the historical 3000-unit threshold when the caller does
  // not specify one, so existing callers keep working.
  const reqQty = Number(req.query.qty);
  const minQty = Number.isFinite(reqQty) && reqQty > 0 ? reqQty : 3000;

  const inventory = await prisma.localInventory.findMany({
    where: {
      OR: orConditions,
      quantity: { gte: minQty },
      ...(excludeCpse ? { tenantCpseId: { not: excludeCpse } } : {})
    },
    select: { tenantCpseId: true, quantity: true }
  });

  const suppliers = inventory.map(i => ({ cpse: i.tenantCpseId, qty: i.quantity }));
  res.json(suppliers);
});

// 3. Delete Global Catalog Mapping
app.delete('/api/ministry/catalog/:mappingId', authenticateToken, requireMinistry, async (req, res) => {
  const { mappingId } = req.params;
  await prisma.globalCatalogMapping.delete({ where: { id: mappingId } });
  res.json({ message: 'Catalog mapping removed' });
});

// 4. View all Demand Batches
app.get('/api/ministry/demands', authenticateToken, requireMinistry, async (req, res) => {
  const demands = await prisma.ministryDemandBatch.findMany({
    include: {
      items: {
        include: { routings: true }
      }
    }
  });
  res.json(demands);
});

// 3. Route an order to a CPSE (Ministry finds surplus and asks CPSE)
app.post('/api/ministry/route-order', authenticateToken, requireMinistry, async (req, res) => {
  const { demandItemId, nationalMaterialCode, supplierCpseId } = req.body;

  // Prevent routing if the item is already accepted by a supplier
  const acceptedRouting = await prisma.ministryOrderRouting.findFirst({
    where: { demandItemId, supplierStatus: 'ACCEPTED' }
  });
  if (acceptedRouting) {
    return res.status(400).json({ error: "This item has already been successfully fulfilled." });
  }

  // Prevent duplicate routings to the same CPSE for the same demand
  const existing = await prisma.ministryOrderRouting.findFirst({
    where: { demandItemId, supplierCpseId }
  });
  if (existing) {
    return res.status(400).json({ error: "Order already routed to this CPSE" });
  }

  const demandItem = await prisma.ministryDemandItem.findUnique({
    where: { id: demandItemId },
    include: { batch: true }
  });

  // Map backwards from NAT code to Supplier's Local code
  const supplierMapping = await prisma.globalCatalogMapping.findFirst({
    where: { nationalMaterialCode, cpseId: supplierCpseId, aiConfidenceScore: 100 }
  });
  const localCode = supplierMapping ? supplierMapping.cpseLocalCode : 'UNKNOWN';

  const routing = await prisma.ministryOrderRouting.create({
    data: { demandItemId, supplierCpseId }
  });

  // Update demand item status
  await prisma.ministryDemandItem.update({
    where: { id: demandItemId },
    data: { status: 'ROUTED' }
  });

  // Propagate to Supplier's local database
  await prisma.inboundSupplyRequest.create({
    data: {
      tenantCpseId: supplierCpseId,
      localMaterialCode: localCode,
      qtyRequested: demandItem?.requestedQty || 0,
      routingId: routing.id
    }
  });

  res.json(routing);
});

// Send Acknowledgement to Requester
app.post('/api/ministry/send-ack', authenticateToken, requireMinistry, async (req, res) => {
  const { demandItemId, requesterCpseId, requestedQty } = req.body;

  const acceptedRouting = await prisma.ministryOrderRouting.findFirst({
    where: { demandItemId, supplierStatus: 'ACCEPTED' }
  });

  if (!acceptedRouting) {
    return res.status(400).json({ error: "No accepted routing found." });
  }

  await prisma.ministryOrderRouting.update({
    where: { id: acceptedRouting.id },
    data: { buyerStatus: 'NOTIFIED' }
  });

  // Match the demand item by its back-link, not by quantity. Two demands
  // from the same CPSE can share a requestedQty, and matching on quantity
  // would confirm whichever row came back first.
  const outboundDemand = await prisma.outboundDemand.findFirst({
    where: { ministryDemandItemId: demandItemId }
  });

  if (outboundDemand) {
    await prisma.outboundDemand.update({
      where: { id: outboundDemand.id },
      data: { ministryStatus: 'FOUND_AVAILABLE', cpseFinalDecision: 'CONFIRMED' }
    });
  }

  await prisma.ministryDemandItem.update({
    where: { id: demandItemId },
    data: { status: 'ACKNOWLEDGED' }
  });

  res.json({ success: true });
});

// 6. Update Ministry Demand Batch Status
app.patch('/api/ministry/demands/:batchId', authenticateToken, requireMinistry, async (req, res) => {
  const { batchId } = req.params;
  const { overallStatus } = req.body;
  const updated = await prisma.ministryDemandBatch.update({
    where: { id: batchId },
    data: { overallStatus }
  });
  res.json(updated);
});

// 7. Delete/Cancel Ministry Demand Batch
app.delete('/api/ministry/demands/:batchId', authenticateToken, requireMinistry, async (req, res) => {
  const { batchId } = req.params;
  
  await prisma.$transaction(async (tx) => {
    const items = await tx.ministryDemandItem.findMany({ where: { batchId }, select: { id: true } });
    const itemIds = items.map(i => i.id);
    await tx.ministryOrderRouting.deleteMany({ where: { demandItemId: { in: itemIds } } });
    await tx.ministryDemandItem.deleteMany({ where: { batchId } });
    await tx.ministryDemandBatch.delete({ where: { id: batchId } });
  });

  res.json({ message: 'Demand batch and routings cancelled' });
});

// 8. Completely Remove a CPSE (DANGEROUS: Ministry Only)
app.delete('/api/ministry/cpse/:id', authenticateToken, requireMinistry, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete all audit logs belonging to this CPSE's inventory
      const inventories = await tx.localInventory.findMany({ where: { tenantCpseId: id }, select: { id: true } });
      const inventoryIds = inventories.map(i => i.id);
      await tx.localAuditLog.deleteMany({ where: { inventoryId: { in: inventoryIds } } });

      // 2. Delete the inventory itself
      await tx.localInventory.deleteMany({ where: { tenantCpseId: id } });

      // 3. Delete demands made by this CPSE
      await tx.outboundDemand.deleteMany({ where: { tenantCpseId: id } });

      // 4. Delete supply requests sent to this CPSE
      await tx.inboundSupplyRequest.deleteMany({ where: { tenantCpseId: id } });

      // 5. Delete global mappings
      await tx.globalCatalogMapping.deleteMany({ where: { cpseId: id } });

      // 6. Delete Ministry routings where this CPSE is the supplier
      await tx.ministryOrderRouting.deleteMany({ where: { supplierCpseId: id } });

      // 7. Delete Ministry demand batches where this CPSE is the requester (and its items/routings)
      const batches = await tx.ministryDemandBatch.findMany({ where: { requestingCpseId: id }, select: { id: true } });
      const batchIds = batches.map(b => b.id);
      
      const items = await tx.ministryDemandItem.findMany({ where: { batchId: { in: batchIds } }, select: { id: true } });
      const itemIds = items.map(i => i.id);
      
      await tx.ministryOrderRouting.deleteMany({ where: { demandItemId: { in: itemIds } } });
      await tx.ministryDemandItem.deleteMany({ where: { batchId: { in: batchIds } } });
      await tx.ministryDemandBatch.deleteMany({ where: { requestingCpseId: id } });

      // 8. Finally, delete the Users associated with this CPSE
      await tx.user.deleteMany({ where: { tenantCpseId: id } });
    });

    res.json({ message: `CPSE ${id} and all associated data have been completely removed.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to completely remove the CPSE. Check database logs for constraint violations.' });
  }
});

// View Global Audit Logs
app.get('/api/ministry/audit-logs', authenticateToken, requireMinistry, async (req, res) => {
  const logs = await prisma.globalAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100 // Limit to recent 100 for now
  });
  res.json(logs);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Core Backend API running on http://localhost:${PORT}`);
});
