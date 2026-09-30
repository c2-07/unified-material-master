"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { Plus, Trash2, Edit2, Clock, CheckCircle, XCircle } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import Dialog from "@/components/Dialog";

interface Demand {
  id: string;
  localMaterialCode: string;
  requestedQty: number;
  ministryStatus: string;
  cpseFinalDecision: string;
  createdAt: string;
  updatedAt?: string;
}

type SortConfig = { field: keyof Demand, direction: 'asc'|'desc' } | null;

// Declared at module scope: defining it inside the page component created a
// new component identity on every render, which made React unmount and
// remount every header cell and threw away its state.
function SortIcon({ field, sortConfig }: { field: keyof Demand, sortConfig: SortConfig }) {
  if (sortConfig?.field !== field) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-[#0051c3]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function CpseDemandsPage() {
  const isLoading = useFirstLoad("cpse-demands", 800);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedRow, setSelectedRow] = useState<Demand | null>(null);
  
  // New demand modal state
  const [showModal, setShowModal] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newQty, setNewQty] = useState("");
  
  // Custom Dialog
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    targetId?: string;
  }>({ isOpen: false, title: '', message: '', type: 'alert' });

  const cpseId = Cookies.get("tenantCpseId");
  const token = Cookies.get("token");

  const fetchDemands = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/cpse/${cpseId}/demands`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDemands(res.data);
    } catch (err) {
      console.error("Failed to load demands.", err instanceof Error ? err.message : String(err));
      setDemands([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cpseId && token) {
      fetchDemands();
    }
  }, [cpseId, token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`http://localhost:4000/api/cpse/${cpseId}/demands`, {
        localMaterialCode: newCode,
        requestedQty: parseFloat(newQty)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowModal(false);
      setNewCode("");
      setNewQty("");
      fetchDemands();
    } catch (err) {
      setDialogConfig({
        isOpen: true,
        title: 'Error',
        message: 'Failed to create demand.',
        type: 'alert'
      });
    }
  };

  const initiateDelete = (demandId: string) => {
    setDialogConfig({
      isOpen: true,
      title: 'Cancel Demand',
      message: 'Are you sure you want to cancel this demand?',
      type: 'confirm',
      targetId: demandId
    });
  };

  const handleDialogConfirm = async () => {
    if (dialogConfig.type === 'confirm' && dialogConfig.targetId) {
      setDialogConfig({ ...dialogConfig, isOpen: false });
      try {
        await axios.delete(`http://localhost:4000/api/cpse/${cpseId}/demands/${dialogConfig.targetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchDemands();
      } catch (err) {
        setDialogConfig({
          isOpen: true,
          title: 'Error',
          message: 'Failed to delete demand (it may already be processed by Ministry).',
          type: 'alert'
        });
      }
    } else {
      setDialogConfig({ ...dialogConfig, isOpen: false });
    }
  };

  const getStatusBadge = (status: string, finalDecision?: string) => {
    if (status === 'PENDING_MINISTRY') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="mr-1 w-3 h-3"/> Pending Hub</span>;
    if (status === 'FOUND_AVAILABLE' && finalDecision !== 'CONFIRMED') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"><CheckCircle className="mr-1 w-3 h-3"/> Routed to Supplier</span>;
    if (status === 'FOUND_AVAILABLE' && finalDecision === 'CONFIRMED') return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="mr-1 w-3 h-3"/> Fulfillment Secured</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"><XCircle className="mr-1 w-3 h-3"/> Unavailable</span>;
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading demands...</span></div>;

  
  const handleSort = (field: keyof Demand) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ field, direction });
  };

  const processedData = [...demands];
  if (sortConfig) {
    processedData.sort((a, b) => {
      const aVal = String(a[sortConfig.field]);
      const bVal = String(b[sortConfig.field]);
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const totalPages = Math.ceil(processedData.length / pageSize) || 1;
  const currentData = processedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);


  return (
    <PageLoader loading={isLoading}>
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Material Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Request materials from the national network.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="cf-button-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Demand
        </button>
      </div>

      <div className="cf-card flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3 text-gray-400 w-12">#</th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("localMaterialCode")}>Local Code <SortIcon field="localMaterialCode" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("requestedQty")}>Qty <SortIcon field="requestedQty" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("createdAt")}>Requested Date <SortIcon field="createdAt" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("updatedAt")}>Ministry Update <SortIcon field="updatedAt" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3">Fulfillment Date</th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("ministryStatus")}>Status <SortIcon field="ministryStatus" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No demands found. Create one to request material.
                  </td>
                </tr>
              ) : (
                currentData.map((d, index) => (
                  <tr key={d.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedRow(d)}>
                    <td className="px-6 py-4 font-mono text-gray-400 text-xs">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold">{d.localMaterialCode}</td>
                    <td className="px-6 py-4 text-right">{d.requestedQty}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-gray-500">{d.ministryStatus !== 'PENDING_MINISTRY' && d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "-"}</td>
                    <td className="px-6 py-4 text-gray-500">{d.cpseFinalDecision === 'CONFIRMED' && d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "-"}</td>
                    <td className="px-6 py-4">{getStatusBadge(d.ministryStatus, d.cpseFinalDecision)}</td>
                    <td className="px-6 py-4 text-right">
                      {d.ministryStatus === 'PENDING_MINISTRY' && (
                        <button onClick={(e) => { e.stopPropagation(); initiateDelete(d.id); }} className="text-red-500 hover:text-red-700">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls 
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={demands.length}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Request Material</h3>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="cf-label">Local Material Code</label>
                <input required value={newCode} onChange={(e) => setNewCode(e.target.value)} className="cf-input" placeholder="e.g. PIP-100" />
              </div>
              <div>
                <label className="cf-label">Quantity</label>
                <input required type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="cf-input" placeholder="10" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="cf-button-secondary">Cancel</button>
                <button type="submit" className="cf-button-primary">Submit Demand</button>
              </div>
            </form>
          </div>
        </div>
      )}

      
      <Dialog isOpen={!!selectedRow} type="custom" onClose={() => setSelectedRow(null)} title="Demand Details">
        {selectedRow && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">{selectedRow.localMaterialCode}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">Demand ID: {selectedRow.id}</p>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Tracking Timeline</h4>
              
              <div className="ml-2 space-y-6 relative before:absolute before:inset-0 before:ml-[5px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gray-200">
                
                <div className="relative flex items-start gap-4">
                  <div className="relative flex h-3 w-3 mt-1.5 shrink-0 items-center justify-center rounded-full bg-[#0051c3] ring-4 ring-white shadow-sm"></div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Request Submitted</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(selectedRow.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                <div className="relative flex items-start gap-4">
                  <div className={`relative flex h-3 w-3 mt-1.5 shrink-0 items-center justify-center rounded-full ring-4 ring-white shadow-sm ${selectedRow.ministryStatus === 'FOUND_AVAILABLE' || selectedRow.ministryStatus === 'UNAVAILABLE' ? 'bg-[#0051c3]' : 'bg-gray-200'}`}></div>
                  <div>
                    <p className={`text-sm font-bold ${selectedRow.ministryStatus === 'FOUND_AVAILABLE' || selectedRow.ministryStatus === 'UNAVAILABLE' ? 'text-gray-900' : 'text-gray-400'}`}>
                      {selectedRow.ministryStatus === 'FOUND_AVAILABLE' ? 'Routed to Supplier' : selectedRow.ministryStatus === 'UNAVAILABLE' ? 'No Match Found' : 'Ministry Processing'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedRow.ministryStatus === 'PENDING_MINISTRY' ? '-' : (selectedRow.updatedAt ? new Date(selectedRow.updatedAt).toLocaleString() : '-')}
                    </p>
                  </div>
                </div>

                <div className="relative flex items-start gap-4">
                  <div className={`relative flex h-3 w-3 mt-1.5 shrink-0 items-center justify-center rounded-full ring-4 ring-white shadow-sm ${selectedRow.cpseFinalDecision === 'CONFIRMED' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  <div>
                    <p className={`text-sm font-bold ${selectedRow.cpseFinalDecision === 'CONFIRMED' ? 'text-green-700' : 'text-gray-400'}`}>
                      Fulfillment Secured
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedRow.cpseFinalDecision === 'CONFIRMED' ? (selectedRow.updatedAt ? new Date(selectedRow.updatedAt).toLocaleString() : '-') : '-'}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs font-bold text-gray-500 uppercase">Quantity</p>
                <p className="font-semibold text-gray-900 mt-1">{selectedRow.requestedQty}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-xs font-bold text-gray-500 uppercase">Status</p>
                <div className="mt-1">{getStatusBadge(selectedRow.ministryStatus, selectedRow.cpseFinalDecision)}</div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedRow(null)} className="cf-button-secondary">Close</button>
            </div>
          </div>
        )}
      </Dialog>
    
      <Dialog isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={handleDialogConfirm}
      />
    </div>
  </PageLoader>
  );
}
