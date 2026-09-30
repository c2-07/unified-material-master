"use client";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";
import { 
  Building2, 
  Database, 
  AlertCircle, 
  Activity, 
  Network, 
  Search,
  ChevronRight
} from "lucide-react";
import Link from "next/link";

import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { API_BASE } from "../../../lib/api";
// Shapes returned by GET /api/ministry/overview.
interface OverviewSearch {
  id: string;
  batchId: string;
  nationalMaterialCode: string;
  requestedQty: number;
  status: string;
}

interface OverviewRouting {
  id: string;
  demandItemId: string;
  supplierCpseId: string;
  supplierStatus: string;
  buyerStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface OverviewAuditLog {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  targetTable: string;
  targetId: string;
  changes: unknown;
  description: string;
  createdAt: string;
}

export default function MinistryOverviewPage() {
  const isLoading = useFirstLoad("min-overview", 700);
  const [data, setData] = useState({
    connectedCpsesCount: 0,
    globalItemsCount: 0,
    highPriorityCount: 0,
    recentSearches: [] as OverviewSearch[],
    recentRouting: [] as OverviewRouting[],
    recentAuditLogs: [] as OverviewAuditLog[]
  });

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const token = Cookies.get("token");
        if (!token) return;
        
        const res = await axios.get(`${API_BASE}/api/ministry/overview`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchOverview();
  }, []);

  return (
    <PageLoader loading={isLoading}>
      <div className="space-y-6 animate-in fade-in duration-500">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">National Overview</h1>
          <p className="text-gray-500 text-sm mt-1">High-level overview of national inventory and network activity.</p>
        </div>

        {/* Top Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Connected CPSEs</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.connectedCpsesCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-12 w-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Global Catalog Items</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.globalItemsCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">High Priority Alerts</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.highPriorityCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Split Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[300px]">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 text-sm">National Material Searches</h2>
              </div>
              <Link href="/ministry/catalog" className="text-xs font-medium text-blue-600 hover:text-blue-800 transition">
                View Catalog
              </Link>
            </div>
            
          <div className="flex-1 overflow-y-auto">
            {!data.recentSearches || data.recentSearches.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <p className="text-sm">No recent network searches found.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.recentSearches.map(item => (
                  <li key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.nationalMaterialCode}</p>
                      <p className="text-xs text-gray-500">Requested: {item.requestedQty}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                      {item.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[300px]">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900 text-sm">System Routing Events</h2>
            </div>
            <Link href="/ministry/routing" className="text-xs font-medium text-blue-600 hover:text-blue-800 transition">
              View Routing
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {!data.recentRouting || data.recentRouting.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <p className="text-sm">No recent cross-CPSE routings.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.recentRouting.map(route => (
                  <li key={route.id} className="p-4 flex flex-col gap-1 hover:bg-gray-50">
                    <p className="text-sm font-semibold text-gray-900">Assigned to: {route.supplierCpseId}</p>
                    <div className="flex gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700">
                        {route.supplierStatus}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Full Width Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[250px]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900 text-sm">Network Audit Log</h2>
          </div>
          <Link href="/ministry/audit" className="text-xs font-medium text-blue-600 hover:text-blue-800 transition">
            View All Logs
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {!data.recentAuditLogs || data.recentAuditLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
              <p className="text-sm">No recent national events recorded.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.recentAuditLogs.map(log => (
                <li key={log.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">[{log.actorType}] {log.action}</p>
                    <p className="text-xs text-gray-500">{log.description}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      </div>
    </PageLoader>
  );
}
