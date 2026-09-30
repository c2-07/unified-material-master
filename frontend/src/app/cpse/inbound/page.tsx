"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { Check, X, AlertCircle } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import Dialog from "@/components/Dialog";

interface Request {
  id: string;
  localMaterialCode: string;
  qtyRequested: number;
  ourDecision: string;
  createdAt: string;
  updatedAt?: string;
}

type SortConfig = { field: keyof Request, direction: 'asc'|'desc' } | null;

// Declared at module scope: defining it inside the page component created a
// new component identity on every render, so React unmounted and remounted
// every sortable header cell on each state change.
function SortIcon({ field, sortConfig }: { field: keyof Request, sortConfig: SortConfig }) {
  if (sortConfig?.field !== field) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-[#0051c3]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function CpseInboundPage() {
  const isLoading = useFirstLoad("cpse-inbound", 800);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedRow, setSelectedRow] = useState<Request | null>(null);
  
  // Custom Dialog
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: '', message: '' });

  const cpseId = Cookies.get("tenantCpseId");
  const token = Cookies.get("token");

  const fetchRequests = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/cpse/${cpseId}/inbound-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(res.data);
    } catch (err) {
      console.error(err);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cpseId && token) {
      fetchRequests();
    }
  }, [cpseId, token]);

  const handleDecision = async (reqId: string, decision: "APPROVED" | "DECLINED") => {
    try {
      await axios.patch(`http://localhost:4000/api/cpse/${cpseId}/inbound-requests/${reqId}`, 
        { decision },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchRequests();
    } catch (err) {
      setDialogConfig({
        isOpen: true,
        title: 'Error',
        message: 'Failed to submit decision.'
      });
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading requests...</span></div>;

  
  const handleSort = (field: keyof Request) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ field, direction });
  };

  let processedData = [...requests];
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Orders to Fulfill</h1>
          <p className="text-sm text-gray-500 mt-1">Orders routed to you by the Ministry.</p>
        </div>
      </div>

      <div className="cf-card flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3 text-gray-400 w-12">#</th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("localMaterialCode")}>Local Code <SortIcon field="localMaterialCode" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("qtyRequested")}>Qty <SortIcon field="qtyRequested" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("createdAt")}>Date Requested <SortIcon field="createdAt" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("updatedAt")}>Decision Date <SortIcon field="updatedAt" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3">Fulfillment Date</th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("ourDecision")}>Status <SortIcon field="ourDecision" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No inbound requests at the moment.
                  </td>
                </tr>
              ) : (
                currentData.map((r, index) => (
                  <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedRow(r)}>
                    <td className="px-6 py-4 font-mono text-gray-400 text-xs">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold">{r.localMaterialCode}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">{r.qtyRequested}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-gray-500">{r.ourDecision !== 'PENDING' && r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "-"}</td>
                    <td className="px-6 py-4 text-gray-500">{r.ourDecision === 'APPROVED' && r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "-"}</td>
                    <td className="px-6 py-4">
                      {r.ourDecision === 'PENDING' && <span className="text-yellow-600 font-medium">Needs Action</span>}
                      {r.ourDecision === 'APPROVED' && <span className="text-green-600 font-medium">Approved</span>}
                      {r.ourDecision === 'DECLINED' && <span className="text-red-600 font-medium">Declined</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {r.ourDecision === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleDecision(r.id, "APPROVED"); }} className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded flex items-center gap-1">
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDecision(r.id, "DECLINED"); }} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded flex items-center gap-1">
                            <X className="h-3 w-3" /> Decline
                          </button>
                        </div>
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
          totalItems={requests.length}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog isOpen={!!selectedRow} type="custom" onClose={() => setSelectedRow(null)} title="Request Details">
        {selectedRow && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">{selectedRow.localMaterialCode}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">Request ID: {selectedRow.id}</p>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Action Timeline</h4>
              
              <div className="relative border-l border-gray-200 ml-3 space-y-6">
                
                <div className="relative pl-6">
                  <div className="absolute w-3 h-3 bg-[#0051c3] rounded-full -left-[6.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-bold text-gray-900">Request Received</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(selectedRow.createdAt).toLocaleString()}</p>
                </div>

                <div className="relative pl-6">
                  <div className={`absolute w-3 h-3 rounded-full -left-[6.5px] top-1.5 ring-4 ring-white ${selectedRow.ourDecision !== 'PENDING' ? 'bg-[#0051c3]' : 'bg-gray-200'}`}></div>
                  <p className={`text-sm font-bold ${selectedRow.ourDecision !== 'PENDING' ? 'text-gray-900' : 'text-gray-400'}`}>
                    Local Decision
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedRow.ourDecision !== 'PENDING' && selectedRow.updatedAt ? new Date(selectedRow.updatedAt).toLocaleString() : '-'}
                  </p>
                </div>

                <div className="relative pl-6">
                  <div className={`absolute w-3 h-3 rounded-full -left-[6.5px] top-1.5 ring-4 ring-white ${selectedRow.ourDecision === 'APPROVED' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  <p className={`text-sm font-bold ${selectedRow.ourDecision === 'APPROVED' ? 'text-green-700' : 'text-gray-400'}`}>
                    Material Shipped
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedRow.ourDecision === 'APPROVED' && selectedRow.updatedAt ? new Date(selectedRow.updatedAt).toLocaleString() : '-'}
                  </p>
                </div>

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
        type="alert"
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
      />
    </div>
  </PageLoader>
  );
}
