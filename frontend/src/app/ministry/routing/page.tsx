"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import Cookies from "js-cookie";
import { ArrowRightLeft, X, Building2, Hash, BarChart3, Info, Search, PlaneTakeoff, PlaneLanding, Package, Send, Network } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import Dialog from "@/components/Dialog";
import { apiErrorMessage } from "@/lib/apiError";

interface Routing {
  id: string;
  supplierCpseId: string;
  supplierStatus: string;
  buyerStatus: string;
}

interface DemandItem {
  id: string;
  nationalMaterialCode: string;
  requestedQty: number;
  status: string;
  routings: Routing[];
}

interface DemandBatch {
  id: string;
  requestingCpseId: string;
  overallStatus: string;
  createdAt: string;
  items: DemandItem[];
}

export default function MinistryRoutingPage() {
  const isLoading = useFirstLoad("min-routing", 700);
  const [batches, setBatches] = useState<DemandBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Custom Dialog
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm' | 'prompt' | 'success';
  }>({ isOpen: false, title: '', message: '' });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [filterRequester, setFilterRequester] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFulfiller, setFilterFulfiller] = useState("");

  const [routeItem, setRouteItem] = useState<{ batch: DemandBatch, item: DemandItem } | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ batch: DemandBatch, item: DemandItem } | null>(null);
  const [supplierCpse, setSupplierCpse] = useState("");
  const [suppliersForTarget, setSuppliersForTarget] = useState<{ cpse: string, qty: number }[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  const token = Cookies.get("token");

  const openRouteModal = (batch: DemandBatch, item: DemandItem) => {
    setSupplierCpse("");
    setSuppliersForTarget([]);
    // Set here rather than in the effect below: flipping the loading flag from
    // the effect meant a synchronous setState on every open.
    setLoadingSuppliers(true);
    setRouteItem({ batch, item });
  };

  useEffect(() => {
    if (!routeItem || !token) return;
    // Guarded so a late response cannot write into a modal the user has
    // already closed, or overwrite the list after switching to another item.
    let cancelled = false;
    axios.get(`http://localhost:4000/api/ministry/suppliers/${routeItem.item.nationalMaterialCode}?exclude=${routeItem.batch.requestingCpseId}&qty=${routeItem.item.requestedQty}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (cancelled) return;
      setSuppliersForTarget(res.data);
      if (res.data.length > 0) {
        setSupplierCpse(res.data[0].cpse);
      }
    }).catch(err => {
      if (!cancelled) console.error(err);
    }).finally(() => {
      if (!cancelled) setLoadingSuppliers(false);
    });
    return () => { cancelled = true; };
  }, [routeItem, token]);

  const loadBatches = async (): Promise<DemandBatch[]> => {
    const res = await axios.get("http://localhost:4000/api/ministry/demands", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  };

  const fetchBatches = async () => {
    try {
      setBatches(await loadBatches());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadBatches()
      .then((loaded) => {
        if (cancelled) return;
        setBatches(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const handleRouteOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeItem) return;
    try {
      await axios.post("http://localhost:4000/api/ministry/route-order", {
        demandItemId: routeItem.item.id,
        nationalMaterialCode: routeItem.item.nationalMaterialCode,
        supplierCpseId: supplierCpse.toUpperCase()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRouteItem(null);
      setSupplierCpse("");
      fetchBatches();
    } catch (err) {
      setDialogConfig({
        isOpen: true,
        title: 'Error',
        message: apiErrorMessage(err, 'Failed to route order.')
      });
    }
  };

  const handleSendAck = async (batch: DemandBatch, item: DemandItem) => {
    if (!token) return;
    try {
      await axios.post("http://localhost:4000/api/ministry/send-ack", {
        demandItemId: item.id,
        requesterCpseId: batch.requestingCpseId,
        requestedQty: item.requestedQty
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchBatches();
      setDialogConfig({
        isOpen: true,
        type: 'success',
        title: "Acknowledgement Sent",
        message: `Successfully notified <strong>${batch.requestingCpseId}</strong> that their material has been secured.`
      });
    } catch (err) {
      setDialogConfig({
        isOpen: true,
        title: "Error Sending Ack",
        message: apiErrorMessage(err, "Failed to send acknowledgement.")
      });
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading demands...</span></div>;

  const filteredBatches = (batches || []).map(batch => {
    // Requester filter
    if (filterRequester && batch.requestingCpseId !== filterRequester) return null;

    const matchingItems = (batch.items || []).filter(item => {
      // Status filter
      if (filterStatus) {
        const isAccepted = (item.routings || []).some(r => r.supplierStatus === 'ACCEPTED');
        const isAck = item.status === 'ACKNOWLEDGED';
        if (filterStatus === 'NEEDS_SUPPLIER' && (item.routings || []).length > 0) return false;
        if (filterStatus === 'ROUTED' && ((item.routings || []).length === 0 || isAccepted || isAck)) return false;
        if (filterStatus === 'ACCEPTED' && (!isAccepted || isAck)) return false;
        if (filterStatus === 'ACKNOWLEDGED' && !isAck) return false;
      }
      
      // Fulfiller filter
      if (filterFulfiller) {
        if (!(item.routings || []).some(r => r.supplierCpseId === filterFulfiller)) return false;
      }
      
      return true;
    });

    if (matchingItems.length === 0) return null;
    return { ...batch, items: matchingItems };
  }).filter(Boolean) as DemandBatch[];

  // Sort batches: Needs Ack -> Pending/Sourcing -> All Acknowledged
  filteredBatches.sort((a, b) => {
    const aNeedsAck = (a.items || []).some(i => i.status !== 'ACKNOWLEDGED' && (i.routings || []).some(r => r.supplierStatus === 'ACCEPTED'));
    const bNeedsAck = (b.items || []).some(i => i.status !== 'ACKNOWLEDGED' && (i.routings || []).some(r => r.supplierStatus === 'ACCEPTED'));
    if (aNeedsAck && !bNeedsAck) return -1;
    if (!aNeedsAck && bNeedsAck) return 1;

    const aAllAck = (a.items || []).length > 0 && (a.items || []).every(i => i.status === 'ACKNOWLEDGED');
    const bAllAck = (b.items || []).length > 0 && (b.items || []).every(i => i.status === 'ACKNOWLEDGED');
    if (aAllAck && !bAllAck) return 1;
    if (!aAllAck && bAllAck) return -1;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalPages = Math.ceil(filteredBatches.length / pageSize);
  const currentData = filteredBatches.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Extract unique CPSEs for dropdowns
  const allRequesters = Array.from(new Set((batches || []).map(b => b.requestingCpseId).filter(Boolean)));
  const allFulfillers = Array.from(new Set((batches || []).flatMap(b => (b.items || []).flatMap(i => (i.routings || []).map(r => r.supplierCpseId))).filter(Boolean)));

  return (
    <PageLoader loading={isLoading}>
    <div>
      <div className="flex flex-col gap-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Request Fulfillment</h1>
            <p className="text-sm text-gray-500 mt-1">Match CPSE material shortages with available surplus across the network.</p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Requester:</span>
            <select
              value={filterRequester}
              onChange={(e) => setFilterRequester(e.target.value)}
              className="appearance-none bg-white border border-gray-300 px-3 py-1.5 pr-8 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#0051c3] focus:border-transparent outline-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px_20px] bg-[right_8px_center] bg-no-repeat"
            >
              <option value="">All Requesters</option>
              {allRequesters.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none bg-white border border-gray-300 px-3 py-1.5 pr-8 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#0051c3] focus:border-transparent outline-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px_20px] bg-[right_8px_center] bg-no-repeat"
            >
              <option value="">All Statuses</option>
              <option value="NEEDS_SUPPLIER">Needs Supplier (Unassigned)</option>
              <option value="ROUTED">Routed (Pending CPSE)</option>
              <option value="ACCEPTED">Accepted (Needs Ack)</option>
              <option value="ACKNOWLEDGED">Completed (Acknowledged)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fulfiller:</span>
            <select
              value={filterFulfiller}
              onChange={(e) => setFilterFulfiller(e.target.value)}
              className="appearance-none bg-white border border-gray-300 px-3 py-1.5 pr-8 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#0051c3] focus:border-transparent outline-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px_20px] bg-[right_8px_center] bg-no-repeat"
            >
              <option value="">All Fulfillers</option>
              {allFulfillers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          {(filterRequester || filterStatus || filterFulfiller) && (
             <button onClick={() => { setFilterRequester(''); setFilterStatus(''); setFilterFulfiller(''); }} className="ml-auto text-xs text-[#0051c3] hover:underline font-semibold">
               Clear Filters
             </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {currentData.length === 0 ? (
          <div className="cf-card p-8 text-center text-gray-500">
            No demands currently in the network.
          </div>
        ) : (
          currentData.map((batch) => (
            <div key={batch.id} className="cf-card overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-500 mr-2">Requester:</span>
                  <span className="font-bold text-gray-900">{batch.requestingCpseId}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(batch.createdAt).toLocaleDateString()}
                </div>
              </div>
              
              <div className="p-4 bg-white space-y-3">
                {(batch.items || []).map(item => (
                  <div key={item.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm hover:shadow transition-shadow flex items-center justify-between p-3 gap-4 cursor-pointer" onClick={() => setSelectedRow({ batch, item })}>
                    
                    {/* REQUESTER */}
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <div className="bg-blue-50 text-[#0051c3] p-2 rounded-lg shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none mb-1">Requesting</div>
                        <div className="font-bold text-gray-900 text-lg leading-none">{batch.requestingCpseId}</div>
                      </div>
                    </div>

                    {/* PATH & TARGET */}
                    <div className="flex-1 flex items-center gap-3">
                      <div className="h-[2px] bg-gray-200 flex-1 border-t border-dashed border-gray-300"></div>
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full shrink-0 shadow-sm">
                        <Package className="h-3.5 w-3.5 text-[#0051c3]" />
                        <span className="font-mono text-sm font-bold text-[#0051c3]">{item.nationalMaterialCode}</span>
                        <span className="text-gray-300 font-bold">|</span>
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-tight">{item.requestedQty} QTY</span>
                      </div>
                      <div className="h-[2px] bg-gray-200 flex-1 border-t border-dashed border-gray-300"></div>
                    </div>

                    {/* FULFILLER */}
                    <div className="flex items-center gap-3 min-w-[140px] justify-end">
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none mb-1">Fulfilling</div>
                        {(item.routings || []).length > 0 ? (
                           <div className="flex flex-col gap-1 items-end">
                             {(item.routings || []).map(r => (
                               <div key={r.id} className="flex items-center gap-2">
                                 <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold uppercase tracking-wider border ${
                                    r.supplierStatus === 'ACCEPTED' ? 'bg-green-100 text-green-700 border-green-200' :
                                    r.supplierStatus === 'REJECTED' ? 'bg-red-100 text-red-700 border-red-200' :
                                    'bg-gray-100 text-gray-600 border-gray-200'
                                 }`}>
                                    {r.supplierStatus}
                                 </span>
                                 <span className="font-bold text-gray-900 text-lg leading-none">{r.supplierCpseId}</span>
                               </div>
                             ))}
                           </div>
                        ) : (
                          <div className="font-semibold text-sm text-gray-400 italic leading-none mt-1">Unassigned</div>
                        )}
                      </div>
                      <div className="bg-gray-50 text-gray-400 p-2 rounded-lg border border-gray-100 shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="border-l border-gray-100 pl-4 ml-2 shrink-0 h-10 flex items-center">
                      {(item.routings || []).some(r => r.supplierStatus === 'ACCEPTED') ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSendAck(batch, item); }}
                          disabled={item.status === 'ACKNOWLEDGED'}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors ${
                            item.status === 'ACKNOWLEDGED' 
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' 
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          <Send className="h-3.5 w-3.5" /> 
                          {item.status === 'ACKNOWLEDGED' ? 'Requester Notified' : 'Notify Requester'}
                        </button>
                      ) : (item.routings || []).some(r => r.supplierStatus === 'PENDING_SUPPLIER') ? (
                        <button
                          disabled
                          className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200"
                        >
                          <span className="animate-pulse flex items-center gap-1.5">
                             <ArrowRightLeft className="h-3.5 w-3.5" /> Awaiting Reply
                          </span>
                        </button>
                      ) : (item.routings || []).length > 0 && (item.routings || []).every(r => r.supplierStatus === 'REJECTED') ? (
                        <button
                          onClick={(e) => { e.stopPropagation();
                            openRouteModal(batch, item);
                          }}
                          className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors bg-amber-600 text-white hover:bg-amber-700 border border-amber-700"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" /> Re-route (All Declined)
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation();
                            openRouteModal(batch, item);
                          }}
                          className="cf-button-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" /> Route Order
                        </button>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {batches.length > 0 && (
          <div className="cf-card">
            <PaginationControls 
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={batches.length}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

      {routeItem && createPortal(
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-[9999] p-4" onClick={() => setRouteItem(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Route Demand to Supplier"
            className="bg-white rounded-xl shadow-xl max-w-lg w-full flex flex-col relative max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">Route Demand to Supplier</h3>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {routeItem.item.id}</p>
              </div>
              <button onClick={() => setRouteItem(null)} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition ml-4 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body: header and footer stay pinned */}
            <div className="overflow-y-auto flex-1 min-h-0">
            {/* Details Grid */}
            <div className="p-5 grid grid-cols-2 gap-5 border-b border-gray-100">              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Building2 className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Requester</p>
                  <p className="font-semibold text-gray-900">{routeItem.batch.requestingCpseId}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Hash className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Target Item</p>
                  <p className="font-mono text-sm text-gray-900">{routeItem.item.nationalMaterialCode}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><BarChart3 className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Quantity</p>
                  <p className="font-semibold text-gray-900">{routeItem.item.requestedQty}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><Info className="h-4 w-4 text-gray-500" /></div>
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Date</p>
                  <p className="font-medium text-gray-900 text-sm">{new Date(routeItem.batch.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <form id="route-order-form" onSubmit={handleRouteOrder} className="flex flex-col min-h-0 flex-1">
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Supplier CPSE (Who has surplus?)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                    {loadingSuppliers ? (
                      <div className="pl-10 py-2 text-sm text-gray-500 font-medium flex items-center gap-2"><AshokaChakraSpinner className="h-4 w-4 text-[#000080]" /> Finding suppliers...</div>
                    ) : suppliersForTarget.length > 0 ? (
                      <div className="relative">
                        <input 
                          required 
                          value={supplierCpse} 
                          onChange={(e) => {
                            setSupplierCpse(e.target.value);
                            setShowSupplierDropdown(true);
                          }}
                          onFocus={() => setShowSupplierDropdown(true)}
                          onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                          className="cf-input uppercase font-semibold text-sm w-full" 
                          style={{ paddingLeft: '2.25rem' }}
                          placeholder="Search or select CPSE..."
                        />
                        {showSupplierDropdown && (
                          <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                            {suppliersForTarget
                              .filter(sup => sup.cpse.toLowerCase().includes(supplierCpse.toLowerCase()))
                              .map(sup => (
                                <button
                                  key={sup.cpse}
                                  type="button"
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 focus:bg-gray-50 flex justify-between items-center transition-colors"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevents input blur
                                    setSupplierCpse(sup.cpse);
                                    setShowSupplierDropdown(false);
                                  }}
                                >
                                  <span className="font-bold text-gray-900">{sup.cpse}</span>
                                  <span className="text-gray-500 font-mono text-xs">{sup.qty} available</span>
                                </button>
                              ))}
                            {suppliersForTarget.filter(sup => sup.cpse.toLowerCase().includes(supplierCpse.toLowerCase())).length === 0 && (
                              <div className="px-4 py-3 text-sm text-gray-500 text-center">No matches found.</div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="pl-10 py-2 text-sm text-red-600 font-medium">No other CPSEs have this item in surplus.</div>
                    )}
                  </div>
                </div>
              </div>
            </form>
            </div>

              {/* Footer — outside the scroll area so actions are always reachable */}
              <div className="flex justify-end items-center gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl shrink-0">
                <button type="button" onClick={() => setRouteItem(null)} className="cf-button-secondary">Cancel</button>
                <button
                  type="submit"
                  form="route-order-form"
                  disabled={loadingSuppliers || suppliersForTarget.length === 0}
                  className="cf-button-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowRightLeft className="h-4 w-4" /> Dispatch Request
                </button>
              </div>
          </div>
        </div>,
        document.body
      )}

      <Dialog 
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type || 'alert'}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
      />

      <Dialog
        isOpen={!!selectedRow}
        type="custom"
        onClose={() => setSelectedRow(null)}
        title="Routing Details"
      >
        {selectedRow && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-[#ebf3ff] text-[#0051c3] p-3 rounded-xl inline-block mb-3">
                <ArrowRightLeft className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{selectedRow.item.nationalMaterialCode}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedRow.item.id}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Requester</span>
                </div>
                <p className="font-semibold text-gray-900">{selectedRow.batch.requestingCpseId}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quantity</span>
                </div>
                <p className="font-semibold text-gray-900">{selectedRow.item.requestedQty}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fulfilling CPSE</span>
                </div>
                {(selectedRow.item.routings || []).length > 0 ? (
                  <div className="space-y-2">
                    {(selectedRow.item.routings || []).map(r => (
                      <div key={r.id} className="flex justify-between items-center p-2 bg-white rounded border border-gray-200">
                        <span className="font-semibold text-gray-900">{r.supplierCpseId}</span>
                        <span className={"text-xs font-bold px-2 py-1 rounded uppercase tracking-wider " + (r.supplierStatus === 'ACCEPTED' ? 'bg-green-100 text-green-700' : r.supplierStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600')}>
                          {r.supplierStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-medium text-gray-500 italic">Unassigned</p>
                )}
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedRow(null)} className="cf-button-secondary">Close</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  </PageLoader>
  );
}
