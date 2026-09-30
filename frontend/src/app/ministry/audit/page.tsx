"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import Dialog from "@/components/Dialog";
import { Hash, Network, Building2 } from "lucide-react";
import { Activity, User, Server, Bot, Clock, Filter, Database, CheckCircle, ArrowRightLeft } from "lucide-react";

interface AuditLog {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  description: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const isLoading = useFirstLoad("min-audit", 800);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const token = Cookies.get("token");
        const res = await axios.get("http://localhost:4000/api/ministry/audit-logs", {
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

  const getActorIcon = (type: string) => {
    switch (type) {
      case 'MINISTRY_ADMIN': return <User className="h-4 w-4 text-purple-600" />;
      case 'AI_ENGINE': return <Bot className="h-4 w-4 text-blue-600" />;
      case 'CPSE_SYSTEM': return <Server className="h-4 w-4 text-orange-600" />;
      default: return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionBadge = (action: string) => {
    let colorClass = "bg-gray-100 text-gray-700 border-gray-200";
    if (action.includes("APPROVE") || action.includes("ACCEPTED")) colorClass = "bg-green-50 text-green-700 border-green-200";
    if (action.includes("ROUTE")) colorClass = "bg-blue-50 text-blue-700 border-blue-200";
    if (action.includes("MAPPING")) colorClass = "bg-indigo-50 text-indigo-700 border-indigo-200";
    
    return (
      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
        {action.replace(/_/g, ' ')}
      </span>
    );
  };

    const filteredLogs = logs.filter(log => 
    log.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
    log.action.toLowerCase().includes(searchQuery.toLowerCase()) || 
    log.actorType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.actorId && log.actorId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <PageLoader loading={isLoading}>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time immutable record of all actions across the network.</p>
        </div>
        <div className="relative">
          {showFilter ? (
            <input 
              autoFocus
              type="text" 
              placeholder="Search actions, actors..." 
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
          <Database className="h-4 w-4 text-gray-400" /> Live Database Event Stream
        </div>
        
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading audit logs...</span></div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No logs found.</div>
          ) : (
            filteredLogs.map(log => (
              <div key={log.id} className="p-5 hover:bg-gray-50 transition-colors flex gap-4 cursor-pointer" onClick={() => setSelectedLog(log)}>
                <div className="mt-1 flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    {getActorIcon(log.actorType)}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="text-sm text-gray-900 leading-relaxed font-medium">
                      {log.description}
                    </p>
                    <span className="text-xs text-gray-400 font-mono whitespace-nowrap ml-4 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    {getActionBadge(log.action)}
                    <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                      Table: {log.targetTable}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      Actor: <span className="text-gray-600 font-medium">{log.actorId}</span>
                    </span>
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
              <div className="bg-[#ebf3ff] text-[#0051c3] p-3 rounded-xl inline-block mb-3">
                <Activity className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{selectedLog.action.replace(/_/g, ' ')}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedLog.id}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm text-gray-700 leading-relaxed font-medium text-center">
              {selectedLog.description}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Actor</span>
                </div>
                <p className="font-semibold text-gray-900">{selectedLog.actorId}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedLog.actorType}</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Target Record</span>
                </div>
                <p className="font-semibold text-gray-900 truncate" title={selectedLog.targetId}>{selectedLog.targetId}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedLog.targetTable}</p>
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
