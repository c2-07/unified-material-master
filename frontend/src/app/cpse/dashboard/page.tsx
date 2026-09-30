"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { Upload, Plus, Edit2, Trash2, X, Hash, Tag, BarChart3, Package, Search } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import Dialog from "@/components/Dialog";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

interface InventoryItem {
  id: string;
  localMaterialCode: string;
  localDescription: string;
  localBaseCategory: string | null;
  quantity: number;
  uom: string;
  statusTag: string;
}

export const getStatusBadge = (statusTag: string) => {
  const lower = statusTag.toLowerCase();
  if (lower.includes("surplus")) {
    return <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">Surplus</span>;
  }
  if (lower.includes("shortage") || lower.includes("critical")) {
    return <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">Shortage</span>;
  }
  if (lower.includes("internal") || lower.includes("active")) {
    return <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">Internal Use</span>;
  }
  return <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">{statusTag}</span>;
};

type SortConfig = { field: keyof InventoryItem, direction: 'asc'|'desc' } | null;

// Declared at module scope: defining it inside the page component created a
// new component identity on every render, so React unmounted and remounted
// every sortable header cell on each state change.
function SortIcon({ field, sortConfig }: { field: keyof InventoryItem, sortConfig: SortConfig }) {
  if (sortConfig?.field !== field) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-[#0051c3]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function CpseInventoryPage() {
  const isLoading = useFirstLoad("cpse-dashboard", 1000);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cpseId = Cookies.get("tenantCpseId");
  const token = Cookies.get("token");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Search and Sort
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  // Details Modal
  const [showDetails, setShowDetails] = useState(false);
  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);

  // Custom Dialog
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm' | 'prompt';
    targetId?: string;
  }>({ isOpen: false, title: '', message: '', type: 'alert' });

  const fetchInventory = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/cpse/${cpseId}/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const processed = res.data.map((item: InventoryItem) => {
        let newTag = "Internal Use";
        if (item.quantity >= 3000) newTag = "Surplus";
        else if (item.quantity <= 300) newTag = "Shortage";
        return { ...item, statusTag: newTag };
      });
      setInventory(processed);
    } catch {
      setError("Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cpseId && token) {
      fetchInventory();
    }
  }, [cpseId, token]);

  const initiateDelete = (e: React.MouseEvent, invId: string) => {
    e.stopPropagation();
    setDialogConfig({
      isOpen: true,
      title: 'Delete Inventory Item',
      message: 'Please provide a reason for deleting this inventory record (e.g. Audit mismatch, Duplicate, Scrapped).',
      type: 'prompt',
      targetId: invId
    });
  };

  const handleDialogConfirm = async (value?: string) => {
    if (dialogConfig.type === 'prompt' && dialogConfig.targetId) {
      if (!value || value.trim() === '') {
        setDialogConfig({
          isOpen: true,
          title: 'Reason Required',
          message: 'An audit reason is required to delete inventory items.',
          type: 'alert'
        });
        return;
      }
      setDialogConfig({ ...dialogConfig, isOpen: false });
      try {
        await axios.delete(`http://localhost:4000/api/cpse/${cpseId}/inventory/${dialogConfig.targetId}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { reason: value }
        });
        fetchInventory();
      } catch (err) {
        setDialogConfig({
          isOpen: true,
          title: 'Error',
          message: 'Failed to delete item.',
          type: 'alert'
        });
      }
    } else {
      setDialogConfig({ ...dialogConfig, isOpen: false });
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading inventory...</span></div>;
  if (error) return <div className="text-red-500">{error}</div>;

    const handleSort = (field: keyof InventoryItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ field, direction });
  };

  // Filter and Sort
  let processedData = [...inventory];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    processedData = processedData.filter(item => 
      item.localMaterialCode.toLowerCase().includes(q) ||
      item.localDescription.toLowerCase().includes(q)
    );
  }
  if (categoryFilter !== "ALL") {
    processedData = processedData.filter(item => item.localBaseCategory === categoryFilter);
  }
  if (statusFilter !== "ALL") {
    processedData = processedData.filter(item => item.statusTag === statusFilter);
  }

  if (sortConfig) {
    processedData.sort((a, b) => {
      const aVal = String(a[sortConfig.field]);
      const bVal = String(b[sortConfig.field]);
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const uniqueCategories = Array.from(new Set(inventory.map(item => item.localBaseCategory).filter(Boolean)));
  const uniqueStatuses = Array.from(new Set(inventory.map(item => item.statusTag).filter(Boolean)));

  const totalPages = Math.ceil(processedData.length / pageSize) || 1;
  const currentData = processedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);


  return (
    <PageLoader loading={isLoading}>
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your local material stock and codes.</p>
        </div>
        <div className="flex gap-3">
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search items, codes..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0051c3] focus:border-transparent w-64"
            />
          </div>
          <select 
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0051c3] bg-white outline-none cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {uniqueCategories.map(cat => <option key={cat as string} value={cat as string}>{cat as string}</option>)}
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0051c3] bg-white outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            {uniqueStatuses.map(status => <option key={status as string} value={status as string}>{status as string}</option>)}
          </select>
        </div>
      </div>

      <div className="cf-card flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 w-12">#</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("localMaterialCode")}>
                  Local Code <SortIcon field="localMaterialCode" sortConfig={sortConfig} />
                </th>
                
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("localBaseCategory")}>
                  Category <SortIcon field="localBaseCategory" sortConfig={sortConfig} />
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("quantity")}>
                  Qty <SortIcon field="quantity" sortConfig={sortConfig} />
                </th>
                <th className="px-4 py-3 text-center">UOM</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("statusTag")}>
                  Status <SortIcon field="statusTag" sortConfig={sortConfig} />
                </th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No inventory found matching your filters.
                  </td>
                </tr>
              ) : (
                currentData.map((item, index) => {
                  const displayIndex = (currentPage - 1) * pageSize + index + 1;
                  return (
                  <tr 
                    key={item.id} 
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setDetailsItem(item);
                      setShowDetails(true);
                    }}
                  >
                    <td className="px-4 py-4 text-left font-mono text-gray-400 text-xs">{displayIndex}</td>
                    <td className="px-4 py-4 text-left font-mono text-xs text-gray-600">{item.localMaterialCode}</td>
                    
                    <td className="px-4 py-4 text-left text-gray-900 font-medium max-w-[200px] truncate" title={item.localDescription}>
                      {item.localDescription}
                    </td>
                    <td className="px-4 py-4 text-left text-gray-500">{item.localBaseCategory || "—"}</td>
                    <td className="px-4 py-4 text-left font-medium text-gray-900">{item.quantity}</td>
                    <td className="px-4 py-4 text-center text-gray-500 text-sm">{item.uom}</td>
                    <td className="px-4 py-4 text-left">
                      {getStatusBadge(item.statusTag)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={(e) => e.stopPropagation()} 
                          className="text-[#0051c3] hover:text-[#003682] p-1"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={(e) => initiateDelete(e, item.id)}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls 
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={inventory.length}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Details Modal */}
      {showDetails && detailsItem && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetails(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">{detailsItem.localDescription}</h3>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {detailsItem.id}</p>
              </div>
              <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition ml-4 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Key Stats Row */}
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Quantity</p>
                <p className="font-bold text-gray-900 text-lg">{detailsItem.quantity}</p>
                <p className="text-xs text-gray-400">{detailsItem.uom}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Status</p>
                <div className="mt-1">
                  {getStatusBadge(detailsItem.statusTag)}
                </div>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Category</p>
                <p className="font-medium text-gray-800 text-sm mt-1 leading-tight">{detailsItem.localBaseCategory || "—"}</p>
              </div>
            </div>

            {/* Detail Fields */}
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Local Code</span>
                </div>
                <p className="font-mono font-semibold text-gray-900 text-sm">{detailsItem.localMaterialCode}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</span>
                </div>
                <p className="font-medium text-gray-900 text-sm">{detailsItem.localBaseCategory || "Not assigned"}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock</span>
                </div>
                <p className="font-semibold text-gray-900 text-sm">{detailsItem.quantity} <span className="text-gray-400 font-normal text-xs">{detailsItem.uom}</span></p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description</span>
                </div>
                <p className="text-sm text-gray-700 leading-snug line-clamp-3" title={detailsItem.localDescription}>{detailsItem.localDescription}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog 
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        promptPlaceholder="Enter reason for deletion..."
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={handleDialogConfirm}
      />
    </div>
  </PageLoader>
  );
}
