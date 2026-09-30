"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import Dialog from "@/components/Dialog";
import { Package, Plus, Minus, FileText, Clock, Filter, Database, FileOutput } from "lucide-react";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";
import { API_BASE } from "../../../lib/api";
interface InventoryItem {
  localMaterialCode: string;
  localDescription: string;
}

interface LocalAuditLog {
  id: string;
  inventoryId: string;
  actionType: string;
  quantityChanged: number;
  workOrderRef: string | null;
  timestamp: string;
  inventory: InventoryItem;
}

export default function CpseAuditLogsPage() {
  const isLoading = useFirstLoad("cpse-audit", 800);
  const [logs, setLogs] = useState<LocalAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LocalAuditLog | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const token = Cookies.get("token");
        const cpseId = Cookies.get("tenantCpseId");
        if (!cpseId) {
          setLoading(false);
          return;
        }
        const res = await axios.get(`${API_BASE}/api/cpse/${cpseId}/audit-logs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setLogs(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const getActionIcon = (type: string, quantityChanged: number) => {
    if (quantityChanged > 0 || type.includes('ADD') || type.includes('IMPORT')) {
      return <Plus className="h-4 w-4 text-green-600" />;
    }
    if (quantityChanged < 0 || type.includes('CONSUMED')) {
      return <Minus className="h-4 w-4 text-orange-600" />;
    }
    return <FileText className="h-4 w-4 text-blue-600" />;
  };

  const getEventDescription = (log: LocalAuditLog) => {
    if (log.actionType === 'INVENTORY_DELETED') {
      return <span className="text-red-600">Inventory record permanently purged</span>;
    }
    if (log.actionType.startsWith('OUTBOUND_')) {
      return <span>Requested <span className="font-bold text-blue-600">{log.quantityChanged}</span> units of <span className="font-mono text-gray-700">{log.inventory?.localMaterialCode}</span> from Ministry</span>;
    }
    if (log.actionType.startsWith('INBOUND_')) {
      return <span>Ministry routed request for <span className="font-bold text-indigo-600">{log.quantityChanged}</span> units of <span className="font-mono text-gray-700">{log.inventory?.localMaterialCode}</span></span>;
    }
    return (
      <>
        Stock adjustment of <span className={`font-bold ${log.quantityChanged >= 0 ? 'text-green-600' : 'text-orange-600'}`}>{log.quantityChanged > 0 ? '+' : ''}{log.quantityChanged}</span> on <span className="font-mono text-gray-700">{log.inventory?.localMaterialCode}</span>
      </>
    );
  };

  const getActionBadge = (action: string) => {
    let colorClass = "bg-gray-100 text-gray-700 border-gray-200";
    if (action.includes("ADD") || action.includes("IMPORT")) colorClass = "bg-green-50 text-green-700 border-green-200";
    if (action.includes("CONSUME") || action.includes("OUTBOUND")) colorClass = "bg-orange-50 text-orange-700 border-orange-200";
    if (action === "INVENTORY_DELETED") colorClass = "bg-red-50 text-red-700 border-red-200";
    if (action.includes("INBOUND")) colorClass = "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (action.includes("UPDATE") || action.includes("EDIT")) colorClass = "bg-blue-50 text-blue-700 border-blue-200";
    
    return (
      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
        {action.replace(/_/g, ' ')}
      </span>
    );
  };

    const filteredLogs = logs.filter(log => 
    log.actionType.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (log.inventory?.localMaterialCode && log.inventory.localMaterialCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (log.inventory?.localDescription && log.inventory.localDescription.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (log.workOrderRef && log.workOrderRef.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <PageLoader loading={isLoading}>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventory Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-1">Immutable ledger of all physical stock movements and manual adjustments.</p>
        </div>
        <div className="relative">
          {showFilter ? (
            <input 
              autoFocus
              type="text" 
              placeholder="Search actions, codes, refs..." 
              className="cf-input py-1.5 pl-3 pr-8 text-sm w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => { if (!searchQuery) setShowFilter(false); }}
            />
          ) : (
            <button onClick={() => setShowFilter(true)} className="cf-button-secondary flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filter Logs
            </button>
          )}
        </div>
      </div>

      <div className="cf-card overflow-hidden flex flex-col">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center gap-2 text-sm text-gray-600 font-medium">
          <Database className="h-4 w-4 text-gray-400" /> Stock Movement Stream
        </div>
        
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
              <AshokaChakraSpinner className="h-10 w-10 text-[#0051c3] mb-4" />
              <span>Loading audit logs...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No inventory audit logs found.</div>
          ) : (
            filteredLogs.map(log => (
              <div key={log.id} className="p-5 hover:bg-gray-50 transition-colors flex gap-4 cursor-pointer" onClick={() => setSelectedLog(log)}>
                <div className="mt-1 flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    {getActionIcon(log.actionType, log.quantityChanged)}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="text-sm text-gray-900 leading-relaxed font-medium">
                      {getEventDescription(log)}
                    </p>
                    <span className="text-xs text-gray-400 font-mono whitespace-nowrap ml-4 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    {getActionBadge(log.actionType)}
                    <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded truncate max-w-[200px]" title={log.inventory?.localDescription}>
                      Desc: {log.inventory?.localDescription}
                    </span>
                    {log.workOrderRef && (
                      <span className="text-xs text-gray-400 font-mono">
                        Ref: <span className="text-gray-600 font-medium">{log.workOrderRef}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog
        isOpen={!!selectedLog}
        type="custom"
        onClose={() => setSelectedLog(null)}
        title="Audit Event Details"
      >
        {selectedLog && (
          <div className="space-y-6">
            <div className="text-center">
              <div className={`p-3 rounded-xl inline-block mb-3 ${selectedLog.quantityChanged >= 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                <FileOutput className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{selectedLog.actionType.replace(/_/g, ' ')}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">Transaction ID: {selectedLog.id}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between text-sm text-gray-700 font-medium">
              <span>{selectedLog.actionType === 'INVENTORY_DELETED' ? 'Action Type:' : selectedLog.actionType.startsWith('OUTBOUND') ? 'Requested Qty:' : selectedLog.actionType.startsWith('INBOUND') ? 'Requested By Ministry:' : 'Quantity Impact:'}</span>
              <span className={`text-xl font-bold ${selectedLog.actionType === 'INVENTORY_DELETED' ? 'text-red-600' : selectedLog.quantityChanged >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                {selectedLog.actionType === 'INVENTORY_DELETED' ? 'PURGE' : (selectedLog.quantityChanged > 0 && !selectedLog.actionType.includes('BOUND') ? '+' : '') + selectedLog.quantityChanged}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Material</span>
                </div>
                <p className="font-semibold text-gray-900 font-mono">{selectedLog.inventory?.localMaterialCode}</p>
                <p className="text-xs text-gray-500 mt-1 truncate" title={selectedLog.inventory?.localDescription}>
                  {selectedLog.inventory?.localDescription}
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reference</span>
                </div>
                <p className="font-semibold text-gray-900 truncate" title={selectedLog.workOrderRef || "No reference"}>
                  {selectedLog.workOrderRef || "None"}
                </p>
                <p className="text-xs text-gray-500 mt-1">Work Order / Source</p>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedLog(null)} className="cf-button-secondary">Close</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  </PageLoader>
  );
}
