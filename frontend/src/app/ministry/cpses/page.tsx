"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { AlertTriangle, Trash2, Building2, Mail, Shield, Database } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import Dialog from "@/components/Dialog";

interface DevUser {
  email: string;
  role: string;
  tenantCpseId: string | null;
}

type SortConfig = { field: keyof DevUser, direction: 'asc'|'desc' } | null;

// Declared at module scope: defining it inside the page component created a
// new component identity on every render, so React unmounted and remounted
// every sortable header cell on each state change.
function SortIcon({ field, sortConfig }: { field: keyof DevUser, sortConfig: SortConfig }) {
  if (sortConfig?.field !== field) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-[#0051c3]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function MinistryCpsesPage() {
  const isLoading = useFirstLoad("min-cpses", 800);
  const [users, setUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCpse, setSelectedCpse] = useState<DevUser | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  // Custom Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm' | 'prompt';
    targetId?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const token = Cookies.get("token");

  const fetchUsers = async () => {
    try {
      const res = await axios.get("http://localhost:4000/api/dev/users");
      setUsers(res.data.filter((u: DevUser) => u.role === "CPSE"));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchUsers();
  }, [token]);

  const initiateDelete = (cpseId: string | null) => {
    if (!cpseId) return;
    setDialogConfig({
      isOpen: true,
      title: 'Danger Zone',
      message: `Type "${cpseId}" to completely wipe this CPSE and all its data.`,
      type: 'prompt',
      targetId: cpseId
    });
  };

  const handleDialogConfirm = async (value?: string) => {
    const targetId = dialogConfig.targetId;
    
    if (dialogConfig.type === 'prompt') {
      if (value !== targetId) {
        setDialogConfig({
          isOpen: true,
          title: 'Verification Failed',
          message: 'The text you entered did not match. Aborting deletion.',
          type: 'alert'
        });
        return;
      }
      
      setDialogConfig({ ...dialogConfig, isOpen: false });
      try {
        await axios.delete(`http://localhost:4000/api/ministry/cpse/${targetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchUsers();
      } catch (err) {
        setDialogConfig({
          isOpen: true,
          title: 'Error',
          message: 'Failed to delete CPSE.',
          type: 'alert'
        });
      }
    } else {
      setDialogConfig({ ...dialogConfig, isOpen: false });
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading CPSEs...</span></div>;

  
  const handleSort = (field: keyof DevUser) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ field, direction });
  };

  let processedData = [...users];
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">CPSE Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage connected network nodes.</p>
        </div>
      </div>

      <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Danger Zone Warning</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Deleting a CPSE uses a robust backend cascade script that permanently purges:
                their user account, their catalog mappings, all their inventory items, all their demands,
                all inbound supply requests routed to them, and any audit logs tied to their inventory.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="cf-card flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-3 text-gray-400 w-12">#</th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("tenantCpseId")}>CPSE ID <SortIcon field="tenantCpseId" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("email")}>Admin Email <SortIcon field="email" sortConfig={sortConfig} /></th>
                <th className="px-6 py-3 text-right">Danger Zone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                    No CPSEs registered in the network.
                  </td>
                </tr>
              ) : (
                currentData.map((u, index) => {
                  const displayIndex = (currentPage - 1) * pageSize + index + 1;
                  return (
                  <tr key={u.email} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCpse(u)}>
                    <td className="px-6 py-4 font-mono text-gray-400 text-xs">{displayIndex}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{u.tenantCpseId}</td>
                    <td className="px-6 py-4 text-gray-600">{u.email}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); initiateDelete(u.tenantCpseId); }}
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded font-medium transition"
                      >
                        <Trash2 className="h-3 w-3" />
                        Purge CPSE Data
                      </button>
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
          totalItems={users.length}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>



      <Dialog 
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        promptPlaceholder="Type CPSE ID here..."
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={handleDialogConfirm}
      />

      <Dialog
        isOpen={!!selectedCpse}
        type="custom"
        onClose={() => setSelectedCpse(null)}
        title="CPSE Profile"
      >
        {selectedCpse && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-[#ebf3ff] text-[#0051c3] p-3 rounded-xl inline-block mb-3">
                <Building2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">{selectedCpse.tenantCpseId}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1">Status: ACTIVE NODE</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Admin Email</span>
                </div>
                <p className="font-semibold text-gray-900">{selectedCpse.email}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-[#0051c3]" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Access Level</span>
                </div>
                <p className="font-semibold text-gray-900">{selectedCpse.role}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-[#0051c3]" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">System ID</span>
                  </div>
                  <span className="font-mono text-xs text-gray-400">{selectedCpse.email}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedCpse(null)} className="cf-button-secondary">Close</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  </PageLoader>
  );
}
