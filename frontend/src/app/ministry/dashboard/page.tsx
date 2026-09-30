"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

import { useEffect, useState, useRef } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { Edit2, ShieldAlert, ShieldCheck, X, CheckCircle, Search, Info, ArrowUpDown, MoreVertical, Zap, Undo2, Building2, Hash, Tag } from "lucide-react";
import PaginationControls from "@/components/PaginationControls";
import Dialog from "@/components/Dialog";

interface CatalogMapping {
  id: string;
  cpseId: string;
  cpseLocalCode: string;
  nationalMaterialCode: string;
  aiConfidenceScore: number;
  localDescription?: string;
  localBaseCategory?: string;
}

interface ChangeSnapshot {
  id: string;
  nationalMaterialCode: string;
  aiConfidenceScore: number;
}

export default function MinistryCatalogPage() {
  const isLoading = useFirstLoad("min-dashboard", 1000);
  const [catalog, setCatalog] = useState<CatalogMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"status" | "aiConfidenceScore" | "nationalMaterialCode">("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Modals State
  const [showEdit, setShowEdit] = useState(false);
  const [editItem, setEditItem] = useState<CatalogMapping | null>(null);
  const [newNationalCode, setNewNationalCode] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState<any | null>(null);
  
  const [showDetails, setShowDetails] = useState(false);
  const [detailsItem, setDetailsItem] = useState<CatalogMapping | null>(null);

  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm' | 'prompt';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '' });

  // Mass Auto-Approve State
  const [isReviewMode, setIsReviewMode] = useState(false);
  
  // Undo Stack State (stores up to 10 previous operations)
  const [undoStack, setUndoStack] = useState<ChangeSnapshot[][]>([]);

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);

  const token = Cookies.get("token");

  const handleApproveSingle = async (item: any) => {
    const previousState = [{
      id: item.id,
      nationalMaterialCode: item.nationalMaterialCode,
      aiConfidenceScore: item.aiConfidenceScore
    }];

    try {
      await axios.patch(`http://localhost:4000/api/ministry/catalog/${item.id}`, 
        { nationalMaterialCode: item.nationalMaterialCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setUndoStack(prev => [previousState, ...prev].slice(0, 10));
      fetchCatalog();
      setOpenRowMenu(null);
    } catch (err) {
      setDialogConfig({ isOpen: true, title: 'Error', message: 'Failed to approve mapping', type: 'alert' });
    }
  };

  const fetchCatalog = async () => {
    try {
      const res = await axios.get("http://localhost:4000/api/ministry/catalog", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCatalog(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchCatalog();
  }, [token]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
      setOpenRowMenu(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const executeUpdateMapping = async () => {
    if (!editItem) return;
    
    const previousState = [{
      id: editItem.id,
      nationalMaterialCode: editItem.nationalMaterialCode,
      aiConfidenceScore: editItem.aiConfidenceScore
    }];

    try {
      await axios.patch(`http://localhost:4000/api/ministry/catalog/${editItem.id}`, 
        { nationalMaterialCode: newNationalCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setUndoStack(prev => [previousState, ...prev].slice(0, 10));
      setShowEdit(false);
      fetchCatalog();
      setDialogConfig(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
      setDialogConfig({ isOpen: true, title: 'Error', message: 'Failed to update mapping', type: 'alert' });
    }
  };

  const handleUpdateMappingConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDialogConfig({
      isOpen: true,
      title: 'Confirm Manual Override',
      message: `Are you sure you want to manually assign the National Code '${newNationalCode}' to this material?`,
      type: 'confirm',
      onConfirm: executeUpdateMapping
    });
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastChange = undoStack[0];
    try {
      await axios.post("http://localhost:4000/api/ministry/catalog/revert", 
        { items: lastChange }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUndoStack(prev => prev.slice(1));
      fetchCatalog();
      setShowMenu(false);
    } catch (err) {
      setDialogConfig({ isOpen: true, title: 'Error', message: 'Failed to undo changes', type: 'alert' });
    }
  };

  const handleClearApprovals = async () => {
    try {
      await axios.post("http://localhost:4000/api/ministry/catalog/clear-approvals", {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowMenu(false);
      fetchCatalog();
      // Clearing all approvals flushes the undo stack because it's a massive state change
      setUndoStack([]);
    } catch (err) {
      setDialogConfig({ isOpen: true, title: 'Error', message: 'Failed to clear approvals', type: 'alert' });
    }
  };

  // 1. Filter
  const filteredCatalog = catalog.filter(item => 
    item.cpseId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.cpseLocalCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.nationalMaterialCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.localDescription || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 2. Sort
  const getStatusWeight = (score: number) => {
    if (score === 100) return 3; // Approved (bottom)
    if (score >= 90) return 1; // Auto-Approve (top)
    return 2; // Human Review (middle)
  };

  const sortedCatalog = [...filteredCatalog].sort((a, b) => {
    let result = 0;
    if (sortField === "status") {
      result = getStatusWeight(a.aiConfidenceScore) - getStatusWeight(b.aiConfidenceScore);
      if (result === 0) result = b.aiConfidenceScore - a.aiConfidenceScore;
    } else if (sortField === "aiConfidenceScore") {
      result = a.aiConfidenceScore - b.aiConfidenceScore;
    } else if (sortField === "nationalMaterialCode") {
      result = a.nationalMaterialCode.localeCompare(b.nationalMaterialCode);
    }
    return sortDir === "asc" ? result : -result;
  });

  // 3. Paginate
  const totalPages = Math.ceil(sortedCatalog.length / pageSize);
  const currentData = sortedCatalog.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stagedItemIds = currentData
    .filter(item => item.aiConfidenceScore >= 90 && item.aiConfidenceScore < 100)
    .map(item => item.id);

  const executeMassApprove = async () => {
    if (stagedItemIds.length === 0) return;
    
    const previousStates = stagedItemIds.map(id => {
      const item = catalog.find(c => c.id === id)!;
      return { id: item.id, nationalMaterialCode: item.nationalMaterialCode, aiConfidenceScore: item.aiConfidenceScore };
    });

    try {
      await axios.post("http://localhost:4000/api/ministry/catalog/bulk-approve", 
        { mappingIds: stagedItemIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setUndoStack(prev => [previousStates, ...prev].slice(0, 10));
      setIsReviewMode(false);
      fetchCatalog();
      setDialogConfig(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
       setDialogConfig({ isOpen: true, title: 'Error', message: 'Failed to commit bulk approval', type: 'alert' });
    }
  };

  const handleCommitMassApprove = () => {
    if (stagedItemIds.length === 0) {
       setIsReviewMode(false);
       return;
    }
    setDialogConfig({
      isOpen: true,
      title: 'Confirm Auto-Approve',
      message: `You are about to approve ${stagedItemIds.length} high-confidence mappings. Are you sure you want to proceed?`,
      type: 'confirm',
      onConfirm: executeMassApprove
    });
  };

  const handleSort = (field: "status" | "aiConfidenceScore" | "nationalMaterialCode") => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse"><AshokaChakraSpinner className="h-10 w-10 text-[#000080] mb-4" /><span>Loading mappings...</span></div>;

  const generateSuggestions = (baseCode: string) => [
    { 
      code: baseCode, match: 98.4, desc: "Exact Match AI Suggestion",
      details: { category: "Primary Equipment", uom: "EA", activeCPSEs: 14, notes: "Highly confident match based on identical descriptions across the network." }
    },
    { 
      code: baseCode.replace(/\d+$/, '8005'), match: 84.2, desc: "Alternative Variant Match",
      details: { category: "Primary Equipment", uom: "EA", activeCPSEs: 6, notes: "Matches physical characteristics but differs slightly in nominal rating." }
    },
    { 
      code: baseCode.replace(/\d+$/, '9000'), match: 72.1, desc: "Generic Category Fallback",
      details: { category: "General Supplies", uom: "LOT", activeCPSEs: 32, notes: "Broad category fallback used when specific parameters are omitted." }
    },
    { 
      code: `NAT-MISC-${Math.floor(Math.random()*900+100)}`, match: 45.3, desc: "Similar structural material",
      details: { category: "Structural Components", uom: "KG", activeCPSEs: 2, notes: "Low confidence NLP vector match." }
    },
    { 
      code: `NAT-UNK-${Math.floor(Math.random()*900+100)}`, match: 21.8, desc: "Uncategorized Item",
      details: { category: "Uncategorized", uom: "Unknown", activeCPSEs: 0, notes: "No clear historical mapping exists." }
    }
  ];

  return (
    <PageLoader loading={isLoading}>
    <div>
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Mapping Review</h1>
          <p className="text-sm text-gray-500 mt-1">Review and process AI harmonization mappings across the network.</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-56">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="cf-input w-full"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search mappings..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          
          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
            {isReviewMode ? (
              <>
                <button onClick={() => setIsReviewMode(false)} className="cf-button-secondary w-full sm:w-auto">Cancel</button>
                <button onClick={handleCommitMassApprove} className="cf-button-primary bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2 w-full sm:w-auto">
                  <CheckCircle className="h-4 w-4" />
                  Commit {stagedItemIds.length} Changes
                </button>
              </>
            ) : (
               <button onClick={() => setIsReviewMode(true)} className="cf-button-primary flex items-center justify-center gap-2 w-full sm:w-auto">
                  <Zap className="h-4 w-4 fill-white" />
                  Auto-Approve Page
                </button>
            )}
            
            {/* More Options Dropdown */}
            <div className="relative w-full sm:w-auto" ref={menuRef}>
              <button 
                onClick={() => setShowMenu(!showMenu)} 
                className="cf-button-secondary px-2 flex items-center justify-center w-full sm:w-auto py-2 relative"
              >
                <MoreVertical className="h-5 w-5 text-gray-600" />
                {undoStack.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
                  <button 
                    onClick={handleUndo} 
                    disabled={undoStack.length === 0}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${undoStack.length > 0 ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                  >
                    <Undo2 className="h-4 w-4" />
                    Undo Last Action {undoStack.length > 0 ? `(${undoStack.length})` : ''}
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button 
                    onClick={handleClearApprovals} 
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Clear All Approvals
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="cf-card flex flex-col">
        {isReviewMode && stagedItemIds.length > 0 && (
          <div className="bg-blue-50 border-b border-blue-100 p-4 text-blue-800 text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600 fill-blue-600" />
            <strong>Review Mode Active:</strong> High-confidence items (&ge; 90%) on this page are staged for approval.
          </div>
        )}
        {isReviewMode && stagedItemIds.length === 0 && (
          <div className="bg-yellow-50 border-b border-yellow-100 p-4 text-yellow-800 text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            No items on this page are eligible for auto-approval.
          </div>
        )}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-4 py-3 text-center w-12 text-gray-400">#</th>
                <th className="px-4 py-3 text-center">CPSE</th>
                <th className="px-4 py-3 text-center">Local Code</th>
                <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort("nationalMaterialCode")}>
                  <div className="flex items-center justify-center gap-1">
                    Assigned National Code
                    <ArrowUpDown className={`h-3 w-3 ${sortField === 'nationalMaterialCode' ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort("aiConfidenceScore")}>
                  <div className="flex items-center justify-center gap-1">
                    AI Confidence
                    <ArrowUpDown className={`h-3 w-3 ${sortField === 'aiConfidenceScore' ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort("status")}>
                  <div className="flex items-center justify-center gap-1">
                    Status
                    <ArrowUpDown className={`h-3 w-3 ${sortField === 'status' ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No mappings found matching your criteria.
                  </td>
                </tr>
              ) : (
                currentData.map((item, index) => {
                  const isManual = item.aiConfidenceScore === 100;
                  const isAutoApproveEligible = item.aiConfidenceScore >= 90 && item.aiConfidenceScore < 100;
                  const isStaged = isReviewMode && isAutoApproveEligible;
                  const formattedScore = item.aiConfidenceScore.toFixed(2);
                  const displayIndex = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr 
                      key={item.id} 
                      className={`cursor-pointer transition-colors ${isStaged ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => {
                        setDetailsItem(item);
                        setShowDetails(true);
                      }}
                    >
                      <td className="px-4 py-4 text-center font-mono text-gray-400 text-xs">{displayIndex}</td>
                      <td className="px-4 py-4 text-center font-semibold text-gray-900">{item.cpseId}</td>
                      <td className="px-4 py-4 text-center font-mono text-xs text-gray-600">{item.cpseLocalCode}</td>
                      <td className="px-4 py-4 text-center font-mono text-xs font-bold text-[#0051c3]">
                        {item.nationalMaterialCode}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-gray-600 font-medium">{formattedScore}%</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex justify-center">
                          {isManual ? (
                            <div className="text-green-600 bg-green-50 px-2 py-1 rounded-md flex items-center justify-center border border-green-200" title="Approved">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                          ) : isStaged ? (
                            <div className="text-white bg-blue-600 px-2 py-1 rounded-md flex items-center justify-center shadow-sm animate-pulse" title="Staged for Commit">
                              <CheckCircle className="h-4 w-4" />
                            </div>
                          ) : isAutoApproveEligible ? (
                            <div className="text-blue-600 bg-blue-50 px-2 py-1 rounded-md flex items-center justify-center border border-blue-200" title="Auto-Approve Available">
                              <Zap className="h-4 w-4" />
                            </div>
                          ) : (
                            <div className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded-md flex items-center justify-center border border-yellow-200" title="Human Review Required">
                              <ShieldAlert className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center relative">
                        <div className="flex justify-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenRowMenu(openRowMenu === item.id ? null : item.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                        </div>
                        
                        {openRowMenu === item.id && (
                          <div className="absolute right-10 top-8 w-52 bg-white border border-gray-200 rounded-md shadow-xl z-50 py-1 text-left">
                            {!isManual && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleApproveSingle(item);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2 font-medium"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Save AI Assignment
                              </button>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRowMenu(null);
                                setEditItem(item);
                                setNewNationalCode(item.nationalMaterialCode);
                                setSelectedSuggestion(null);
                                setShowEdit(true);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-[#0051c3] hover:bg-[#ebf3ff] flex items-center gap-2 font-medium"
                            >
                              <Edit2 className="h-4 w-4" />
                              Manual Override
                            </button>
                          </div>
                        )}
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
          totalItems={filteredCatalog.length}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Override Modal */}
      {showEdit && editItem && (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col relative">

            {/* Header */}
            <div className="flex justify-between items-start p-5 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-mono mb-0.5">{editItem.cpseId} · {editItem.cpseLocalCode}</p>
                <h3 className="font-bold text-gray-900 text-lg">Manual Mapping Override</h3>
              </div>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              {/* Left: Source Info */}
              <div className="p-5 space-y-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Source Material</p>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Description</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{editItem.localDescription || "No description provided."}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">CPSE</p>
                      <p className="font-semibold text-gray-900 text-sm">{editItem.cpseId}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Local Code</p>
                      <p className="font-mono text-sm text-gray-900">{editItem.cpseLocalCode}</p>
                    </div>
                  </div>
                </div>

                {/* Current assignment */}
                <div className="bg-[#f0f6ff] border border-[#0051c3]/20 rounded-lg p-3">
                  <p className="text-xs text-[#0051c3] font-bold uppercase tracking-wider mb-1">Current Assignment</p>
                  <p className="font-mono font-bold text-[#0051c3] text-base">{editItem.nationalMaterialCode}</p>
                </div>

                {/* Custom input */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Override Code</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                      value={newNationalCode}
                      onChange={(e) => setNewNationalCode(e.target.value)}
                      className="cf-input w-full font-mono text-sm"
                      style={{ paddingLeft: '2.25rem' }}
                      placeholder="Type National Code..."
                    />
                  </div>
                </div>
              </div>

              {/* Right: AI Suggestions */}
              <div className="p-5 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI Suggestions</p>
                <div className="space-y-2">
                  {generateSuggestions(editItem.nationalMaterialCode).map((s, idx) => {
                    const isSelected = newNationalCode === s.code;
                    const barColor = s.match >= 90 ? 'bg-green-500' : s.match >= 60 ? 'bg-yellow-500' : 'bg-orange-500';
                    const textColor = s.match >= 90 ? 'text-green-700' : s.match >= 60 ? 'text-yellow-700' : 'text-orange-600';
                    return (
                      <div
                        key={idx}
                        onClick={() => setNewNationalCode(s.code)}
                        className={`group relative rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[#0051c3] bg-[#f0f6ff] ring-1 ring-[#0051c3]'
                            : 'border-gray-200 hover:border-[#0051c3] hover:shadow-sm bg-white'
                        }`}
                      >
                        <div className="px-3 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#0051c3] text-sm truncate">{s.code}</span>
                              <span className={`text-xs font-bold ${textColor}`}>{s.match}%</span>
                            </div>
                            <div className="mt-1 w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                              <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${s.match}%` }}></div>
                            </div>
                          </div>
                          <span className="text-xs text-gray-400 truncate max-w-[90px] shrink-0 group-hover:text-gray-600 transition-colors">{s.desc}</span>
                        </div>
                        {/* Hover tooltip */}
                        <div className="absolute left-full top-0 ml-2 w-52 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-20 hidden group-hover:block pointer-events-none">
                          <div className="space-y-2">
                            <div className="flex justify-between"><span className="text-gray-400">Category</span><span className="font-medium">{s.details.category}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">UOM</span><span className="font-medium">{s.details.uom}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">Network</span><span className="font-medium">{s.details.activeCPSEs} CPSEs</span></div>
                            <div className="border-t border-gray-700 pt-2 text-gray-300 italic leading-snug">{s.details.notes}</div>
                          </div>
                          <div className="absolute left-0 top-3 -translate-x-full border-4 border-transparent border-r-gray-900"></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-5 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl">
              <p className="text-xs text-gray-400">Assigning: <span className="font-mono font-bold text-gray-700">{newNationalCode || "—"}</span></p>
              <div className="flex gap-2">
                <button onClick={() => setShowEdit(false)} className="cf-button-secondary">Cancel</button>
                <button onClick={handleUpdateMappingConfirm} className="cf-button-primary">Commit Override</button>
              </div>
            </div>
          </div>
        </div>
      )}


      {showDetails && detailsItem && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDetails(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Catalog Mapping</h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {detailsItem.id}</p>
                </div>
                <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-1.5 rounded-full transition">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-5 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm"><Building2 className="h-4 w-4 text-gray-500" /></div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Source Node</p>
                    <p className="font-semibold text-gray-900">{detailsItem.cpseId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm"><Hash className="h-4 w-4 text-gray-500" /></div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Local Code</p>
                    <p className="font-mono text-sm text-gray-900">{detailsItem.cpseLocalCode}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6">
                <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block mb-2">Local Description</span>
                <div className="text-sm text-gray-800 leading-relaxed min-h-[40px]">
                  {detailsItem.localDescription || "No description provided."}
                </div>
                {detailsItem.localBaseCategory && (
                  <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm"><Tag className="h-4 w-4 text-gray-500" /></div>
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Category</p>
                      <p className="text-sm text-gray-900 font-medium">{detailsItem.localBaseCategory}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className={`p-4 rounded-xl border ${detailsItem.aiConfidenceScore === 100 ? 'bg-green-50 border-green-200' : 'bg-[#f0f6ff] border-[#0051c3]/20'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${detailsItem.aiConfidenceScore === 100 ? 'text-green-800' : 'text-[#0051c3]'}`}>
                    {detailsItem.aiConfidenceScore === 100 ? 'Approved Code' : 'AI Assignment'}
                  </span>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                    detailsItem.aiConfidenceScore === 100 ? 'text-green-700 bg-green-100' : 
                    detailsItem.aiConfidenceScore >= 90 ? 'text-blue-700 bg-blue-100' : 'text-yellow-700 bg-yellow-100'
                  }`}>
                    {detailsItem.aiConfidenceScore === 100 ? <ShieldCheck className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                    {detailsItem.aiConfidenceScore.toFixed(2)}%
                  </div>
                </div>
                <div className={`font-mono text-xl font-bold ${detailsItem.aiConfidenceScore === 100 ? 'text-green-700' : 'text-[#0051c3]'}`}>
                  {detailsItem.nationalMaterialCode}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog 
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type || 'alert'}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={dialogConfig.onConfirm}
      />
    </div>
  </PageLoader>
  );
}
