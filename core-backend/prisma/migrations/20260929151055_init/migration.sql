-- CreateTable
CREATE TABLE "LocalInventory" (
    "id" TEXT NOT NULL,
    "tenantCpseId" TEXT NOT NULL,
    "localMaterialCode" TEXT NOT NULL,
    "localDescription" TEXT NOT NULL,
    "localBaseCategory" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "uom" TEXT NOT NULL,
    "statusTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalAuditLog" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "quantityChanged" DOUBLE PRECISION NOT NULL,
    "workOrderRef" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundDemand" (
    "id" TEXT NOT NULL,
    "tenantCpseId" TEXT NOT NULL,
    "localMaterialCode" TEXT NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "ministryStatus" TEXT NOT NULL DEFAULT 'PENDING_MINISTRY',
    "cpseFinalDecision" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundSupplyRequest" (
    "id" TEXT NOT NULL,
    "tenantCpseId" TEXT NOT NULL,
    "localMaterialCode" TEXT NOT NULL,
    "qtyRequested" DOUBLE PRECISION NOT NULL,
    "ourDecision" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundSupplyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalCatalogMapping" (
    "id" TEXT NOT NULL,
    "cpseId" TEXT NOT NULL,
    "cpseLocalCode" TEXT NOT NULL,
    "nationalMaterialCode" TEXT NOT NULL,
    "aiConfidenceScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GlobalCatalogMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinistryDemandBatch" (
    "id" TEXT NOT NULL,
    "requestingCpseId" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinistryDemandBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinistryDemandItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "nationalMaterialCode" TEXT NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOURCING',

    CONSTRAINT "MinistryDemandItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinistryOrderRouting" (
    "id" TEXT NOT NULL,
    "demandItemId" TEXT NOT NULL,
    "supplierCpseId" TEXT NOT NULL,
    "supplierStatus" TEXT NOT NULL DEFAULT 'PENDING_SUPPLIER',
    "buyerStatus" TEXT NOT NULL DEFAULT 'PENDING_BUYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinistryOrderRouting_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LocalAuditLog" ADD CONSTRAINT "LocalAuditLog_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "LocalInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinistryDemandItem" ADD CONSTRAINT "MinistryDemandItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MinistryDemandBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinistryOrderRouting" ADD CONSTRAINT "MinistryOrderRouting_demandItemId_fkey" FOREIGN KEY ("demandItemId") REFERENCES "MinistryDemandItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
