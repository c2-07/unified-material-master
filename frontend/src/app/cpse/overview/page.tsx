"use client";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";
import { 
  Package, 
  ArrowRightLeft, 
  Bell, 
  ListOrdered, 
  ArrowDownToLine, 
  Activity,
  ChevronRight
} from "lucide-react";
import Link from "next/link";

import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";

export default function CpseOverviewPage() {
  const isLoading = useFirstLoad("cpse-overview", 700);
  const [data, setData] = useState({
    activeRequestsCount: 0,
    pendingOrdersCount: 0,
    recentRequests: [] as any[],
    recentOrders: [] as any[]
  });

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const token = Cookies.get("token");
        const cpseId = Cookies.get("tenantCpseId");
        if (!token || !cpseId) return;
        
        const res = await axios.get(`http://localhost:4000/api/cpse/${cpseId}/overview`, {
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
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Overview of your operations and requests.</p>
        </div>

        {/* Top Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Active Material Requests</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.activeRequestsCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-12 w-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Orders to Fulfill</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{data.pendingOrdersCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-2">
              <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Bell className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Unread Notifications</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {data.activeRequestsCount + data.pendingOrdersCount > 0 
                    ? data.activeRequestsCount + data.pendingOrdersCount 
                    : 0}
                </p>
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
                <ListOrdered className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Recent Material Requests</h2>
              </div>
              <Link href="/cpse/demands" className="text-xs font-medium text-blue-600 hover:text-blue-800 transition">
                View All
              </Link>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {data.recentRequests.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                  <p className="text-sm">No material requests found.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.recentRequests.map(req => (
                    <li key={req.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{req.localMaterialCode}</p>
                        <p className="text-xs text-gray-500">Qty: {req.requestedQty}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        req.cpseFinalDecision === 'PENDING' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {req.cpseFinalDecision}
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
                <ArrowDownToLine className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Recent Orders to Fulfill</h2>
              </div>
              <Link href="/cpse/inbound" className="text-xs font-medium text-blue-600 hover:text-blue-800 transition">
                View All
              </Link>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {data.recentOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                  <p className="text-sm">No incoming orders found.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.recentOrders.map(order => (
                    <li key={order.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{order.localMaterialCode}</p>
                        <p className="text-xs text-gray-500">Qty Requested: {order.qtyRequested}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        order.ourDecision === 'PENDING' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {order.ourDecision}
                      </span>
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
              <h2 className="font-semibold text-gray-900 text-sm">Recent Activity & Events</h2>
            </div>
            <Link href="/cpse/audit" className="text-xs font-medium text-blue-600 hover:text-blue-800 transition">
              View Audit Log
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {!data.recentAuditLogs || data.recentAuditLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <p className="text-sm">No recent events recorded.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.recentAuditLogs.map((log: any) => (
                  <li key={log.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {log.actionType} - {log.inventory?.localMaterialCode}
                      </p>
                      <p className="text-xs text-gray-500">Qty Changed: {log.quantityChanged}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(log.timestamp).toLocaleDateString()}
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
