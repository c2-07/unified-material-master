"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { Search, Filter, X, Tag, Hash, Building2, BarChart3, ArrowUpDown } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import { API_BASE } from "../../../lib/api";
interface InventoryItem {
  id: string;
  tenantCpseId: string;
  localMaterialCode: string;
  nationalMaterialCode?: string;
  localDescription: string;
  localBaseCategory: string | null;
  quantity: number;
  uom: string;
  statusTag: string;
}

type SortField = "tenantCpseId" | "localMaterialCode" | "nationalMaterialCode" | "localBaseCategory" | "quantity" | "statusTag";

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

// Declared at module scope: inside the page component this created a new
// component identity each render, remounting every sortable header cell.
function SortIcon({ field, sortField }: { field: SortField, sortField: SortField }) {
  return (
    <ArrowUpDown className={`h-3 w-3 ml-1 inline-block ${sortField === field ? "text-blue-600" : "text-gray-400"}`} />
  );
}

export default function MinistryGlobalCatalogPage() {
  const isLoading = useFirstLoad("min-catalog", 800);
  const [inventory, setGlobalInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCpse, setFilterCpse] = useState("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [sortField, setSortField] = useState<SortField>("tenantCpseId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const token = Cookies.get("token");

  // Pure fetch, no state: shared by the mount effect and post-mutation reloads.
  const loadGlobalInventory = useCallback(async () => {
    const res = await axios.get(`${API_BASE}/api/ministry/global-inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      });
const processed = res.data.map((item: InventoryItem) => {
        let newTag = "Internal Use";
        if (item.quantity >= 3000) newTag = "Surplus";
        else if (item.quantity <= 300) newTag = "Shortage";
        return { ...item, statusTag: newTag };
      });
      return processed;
  }, [token]);

  useEffect(() => {
    if (!(token)) return;
    // Guarded so a response arriving after unmount, or after the
    // dependencies changed, cannot set state on a stale render.
    let cancelled = false;
    loadGlobalInventory()
      .then((loaded) => {
        if (cancelled) return;
        setGlobalInventory(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, loadGlobalInventory]);

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading global catalog...</span></div>;

  const allCategories = Array.from(new Set(inventory.map(i => i.localBaseCategory).filter(Boolean))) as string[];
  const allStatuses = Array.from(new Set(inventory.map(i => i.statusTag).filter(Boolean))) as string[];
  const allCpses = Array.from(new Set(inventory.map(i => i.tenantCpseId).filter(Boolean))).sort() as string[];

  // 1. Text search
  const textFiltered = inventory.filter(i =>
    i.localDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.tenantCpseId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.localMaterialCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 2. Dropdown filters
  const dropdownFiltered = textFiltered.filter(i => {
    if (filterCategory !== "all" && i.localBaseCategory !== filterCategory) return false;
    if (filterStatus !== "all" && i.statusTag !== filterStatus) return false;
    if (filterCpse !== "all" && i.tenantCpseId !== filterCpse) return false;
    return true;
  });

  // 3. Sort
  const sorted = [...dropdownFiltered].sort((a, b) => {
    let result = 0;
    if (sortField === "quantity") {
      result = a.quantity - b.quantity;
    } else {
      const av = (a[sortField] ?? "") as string;
      const bv = (b[sortField] ?? "") as string;
      result = av.localeCompare(bv);
    }
    return sortDir === "asc" ? result : -result;
  });

  // 4. Paginate
  const totalPages = Math.ceil(sorted.length / pageSize);
  const currentData = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const activeFilters = [filterCategory !== "all", filterStatus !== "all", filterCpse !== "all"].filter(Boolean).length;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  return (
    <PageLoader loading={isLoading}>
    <div>
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Global Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">Live overview of all inventory across the national network.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-row flex-wrap items-center gap-3">
          <div className="relative flex items-center">
            <div className="absolute left-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="cf-input w-48 h-10"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>

          <div className="relative flex items-center">
            <select
              className="cf-input w-48 h-10 appearance-none bg-white pr-10 cursor-pointer text-sm"
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="absolute right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative flex items-center">
            <select
              className="cf-input w-48 h-10 appearance-none bg-white pr-10 cursor-pointer text-sm"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Statuses</option>
              {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="absolute right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative flex items-center">
            <select
              className="cf-input w-48 h-10 appearance-none bg-white pr-10 cursor-pointer text-sm"
              value={filterCpse}
              onChange={(e) => { setFilterCpse(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All CPSEs</option>
              {allCpses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="absolute right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          {activeFilters > 0 && (
            <button
              onClick={() => { setFilterCategory("all"); setFilterStatus("all"); }}
              className="cf-button-secondary flex items-center gap-1.5 text-sm"
            >
              <Filter className="h-3.5 w-3.5" />
              Clear {activeFilters}
            </button>
          )}
        </div>
      </div>

      <div className="cf-card flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-4 py-3 text-left w-12 text-gray-400">#</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("tenantCpseId")}>
                  CPSE Hub <SortIcon field="tenantCpseId" sortField={sortField} />
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("localMaterialCode")}>
                  Local Code <SortIcon field="localMaterialCode" sortField={sortField} />
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("nationalMaterialCode")}>
                  National Code <SortIcon field="nationalMaterialCode" sortField={sortField} />
                </th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("localBaseCategory")}>
                  Category <SortIcon field="localBaseCategory" sortField={sortField} />
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("quantity")}>
                  Quantity <SortIcon field="quantity" sortField={sortField} />
                </th>
                <th className="px-4 py-3 text-center">UOM</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("statusTag")}>
                  Status <SortIcon field="statusTag" sortField={sortField} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No items found matching your filters.
                  </td>
                </tr>
              ) : (
                currentData.map((item, index) => {
                  const displayIndex = (currentPage - 1) * pageSize + index + 1;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSelectedItem(item)}>
                      <td className="px-4 py-4 text-left font-mono text-gray-400 text-xs">{displayIndex}</td>
                      <td className="px-4 py-4 text-left font-bold text-gray-900">{item.tenantCpseId}</td>
                      <td className="px-4 py-4 text-left font-mono text-xs text-gray-600">{item.localMaterialCode}</td>
                      <td className="px-4 py-4 text-center text-xs">
                        {item.nationalMaterialCode === "PENDING REVIEW" ? (
                          <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-md font-medium tracking-wide">
                            PENDING REVIEW
                          </span>
                        ) : (
                          <span className="bg-[#ebf3ff] text-[#0051c3] border border-blue-100 px-2.5 py-1 rounded-md font-mono font-bold tracking-wide">
                            {item.nationalMaterialCode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-left text-gray-900 font-medium max-w-[200px] truncate" title={item.localDescription}>
                        {item.localDescription}
                      </td>
                      <td className="px-4 py-4 text-left text-gray-500">{item.localBaseCategory || "—"}</td>
                      <td className="px-4 py-4 text-left font-medium text-gray-900">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-4 text-center text-gray-500 text-sm">
                        {item.uom}
                      </td>
                      <td className="px-4 py-4 text-left">
                        {getStatusBadge(item.statusTag)}
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
          totalItems={sorted.length}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">{selectedItem.localDescription}</h3>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedItem.id}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition ml-4 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Quantity</p>
                <p className="font-bold text-gray-900 text-lg">{selectedItem.quantity}</p>
                <p className="text-xs text-gray-400">{selectedItem.uom}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Status</p>
                <div className="mt-1">
                  {getStatusBadge(selectedItem.statusTag)}
                </div>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Category</p>
                <p className="font-medium text-gray-800 text-sm mt-1 leading-tight">{selectedItem.localBaseCategory || "—"}</p>
              </div>
            </div>

            <div className="p-5 grid grid-cols-2 gap-5">
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Building2 className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400">CPSE Hub</p>
                  <p className="font-semibold text-gray-900">{selectedItem.tenantCpseId}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Hash className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400">Local Material Code</p>
                  <p className="font-mono font-semibold text-gray-900">{selectedItem.localMaterialCode}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Tag className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400">Base Category</p>
                  <p className="font-medium text-gray-900">{selectedItem.localBaseCategory || "Not assigned"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><BarChart3 className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400">Stock</p>
                  <p className="font-semibold text-gray-900">{selectedItem.quantity} <span className="text-gray-400 font-normal text-sm">{selectedItem.uom}</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </PageLoader>
  );
}
