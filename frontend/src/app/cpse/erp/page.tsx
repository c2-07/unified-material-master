'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Database, Link as LinkIcon, RefreshCw, CheckCircle, ArrowRight, X, UploadCloud, FileSpreadsheet } from 'lucide-react';
import Cookies from 'js-cookie';
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { PageLoader } from "@/components/PageLoader";

type Step = 'connect' | 'mapping' | 'syncing' | 'complete';

interface Mapping {
  sourceId: string;
  targetId: string;
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', 
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'
];

const TARGET_FIELDS = [
  { id: 'localMaterialCode', label: 'Material Code' },
  { id: 'localDescription', label: 'Description' },
  { id: 'localBaseCategory', label: 'Category' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'uom', label: 'Unit of Measure' }
];

export default function ConnectErpPage() {
  const isLoading = useFirstLoad("cpse-erp", 700);
  const [step, setStep] = useState<Step>('connect');
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [sourceFields, setSourceFields] = useState<{id: string, label: string}[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [cpseName, setCpseName] = useState<string>('Loading...');
  
  useEffect(() => {
    const savedName = localStorage.getItem('erp_filename');
    const savedFields = localStorage.getItem('erp_source_fields');
    const savedData = localStorage.getItem('erp_parsed_data');
    const savedMappings = localStorage.getItem('erp_mappings');
    
    if (savedName && savedFields && savedData) {
      setUploadedFileName(savedName);
      setSourceFields(JSON.parse(savedFields));
      setParsedData(JSON.parse(savedData));
      if (savedMappings) setMappings(JSON.parse(savedMappings));
      setStep('mapping');
    }
  }, []);

  // Save mappings whenever they change
  useEffect(() => {
    if (mappings.length > 0) {
      localStorage.setItem('erp_mappings', JSON.stringify(mappings));
    }
  }, [mappings]);

  // Interaction state for mapping
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
  
  // Animation state
  const [syncProgress, setSyncProgress] = useState(0);
  const [showChanges, setShowChanges] = useState(false);
  const [syncStats, setSyncStats] = useState<{ imported: number, importedIds: string[] }>({ imported: 0, importedIds: [] });
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackComplete, setRollbackComplete] = useState(false);

  // Refs for calculating SVG lines
  const leftRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [lineCoords, setLineCoords] = useState<{id: string, color: string, x1: number, y1: number, x2: number, y2: number}[]>([]);

  useEffect(() => {
    const fetchCpse = async () => {
      const cpseId = Cookies.get("tenantCpseId");
      if (!cpseId) return;
      try {
        const res = await fetch(`http://localhost:4000/api/cpse/\${cpseId}`, {
          headers: { 'Authorization': `Bearer \${Cookies.get('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCpseName(data.name);
        }
      } catch (err) {}
    };
    fetchCpse();
  }, []);

  const getColor = (sourceId: string) => {
    const idx = sourceFields.findIndex(f => f.id === sourceId);
    return COLORS[Math.max(0, idx) % COLORS.length];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        // Simple CSV parser for demonstration
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = lines.slice(1).map(line => {
          // Extremely basic regex for CSV splitting ignoring commas inside quotes
          const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
          return headers.reduce((acc, h, i) => {
            acc[h] = values[i] || '';
            return acc;
          }, {} as Record<string, string>);
        });
        
        const newHeaders = headers.map(h => ({ id: h, label: h }));
        setSourceFields(newHeaders);
        setParsedData(data);
        setUploadedFileName(file.name);
        setStep('mapping');
        
        // Auto-match obvious columns so the user sees some wires instantly!
        const autoMappings: Mapping[] = [];
        const headerStr = newHeaders.map(h => h.id.toLowerCase());
        
        TARGET_FIELDS.forEach(tf => {
          const tName = tf.id.toLowerCase();
          const match = newHeaders.find(h => 
            h.id.toLowerCase().includes(tName.replace('local', '')) || 
            tName.includes(h.id.toLowerCase().replace('_', ''))
          );
          if (match) {
            autoMappings.push({ sourceId: match.id, targetId: tf.id });
          }
        });
        
        // Specific fallbacks for the ONGC dataset
        if (!autoMappings.find(m => m.targetId === 'localMaterialCode') && newHeaders.find(h => h.id === 'Legacy_System_Code')) {
          autoMappings.push({ sourceId: 'Legacy_System_Code', targetId: 'localMaterialCode' });
        }
        if (!autoMappings.find(m => m.targetId === 'localDescription') && newHeaders.find(h => h.id === 'Material_Description_Raw')) {
          autoMappings.push({ sourceId: 'Material_Description_Raw', targetId: 'localDescription' });
        }
        if (!autoMappings.find(m => m.targetId === 'localBaseCategory') && newHeaders.find(h => h.id === 'Category')) {
          autoMappings.push({ sourceId: 'Category', targetId: 'localBaseCategory' });
        }
        if (!autoMappings.find(m => m.targetId === 'quantity') && newHeaders.find(h => h.id === 'Quantity_In_Stock')) {
          autoMappings.push({ sourceId: 'Quantity_In_Stock', targetId: 'quantity' });
        }
        if (!autoMappings.find(m => m.targetId === 'uom') && newHeaders.find(h => h.id === 'UOM_Used_By_CPSE')) {
          autoMappings.push({ sourceId: 'UOM_Used_By_CPSE', targetId: 'uom' });
        }

        setMappings(autoMappings);
        
        // Persist
        localStorage.setItem('erp_filename', file.name);
        localStorage.setItem('erp_source_fields', JSON.stringify(newHeaders));
        localStorage.setItem('erp_parsed_data', JSON.stringify(data));
        if (autoMappings.length > 0) localStorage.setItem('erp_mappings', JSON.stringify(autoMappings));
      }
    };
    reader.readAsText(file);
  };



  
  // Force automatch if missing
  useEffect(() => {
    if (step === 'mapping' && mappings.length === 0 && sourceFields.length > 0) {
      const autoMappings: Mapping[] = [];
      TARGET_FIELDS.forEach(tf => {
        const tName = tf.id.toLowerCase();
        const match = sourceFields.find(h => 
          h.id.toLowerCase().includes(tName.replace('local', '')) || 
          tName.includes(h.id.toLowerCase().replace('_', ''))
        );
        if (match) {
          autoMappings.push({ sourceId: match.id, targetId: tf.id });
        }
      });
      if (!autoMappings.find(m => m.targetId === 'localMaterialCode') && sourceFields.find(h => h.id === 'Legacy_System_Code')) {
        autoMappings.push({ sourceId: 'Legacy_System_Code', targetId: 'localMaterialCode' });
      }
      if (!autoMappings.find(m => m.targetId === 'localDescription') && sourceFields.find(h => h.id === 'Material_Description_Raw')) {
        autoMappings.push({ sourceId: 'Material_Description_Raw', targetId: 'localDescription' });
      }
      if (!autoMappings.find(m => m.targetId === 'localBaseCategory') && sourceFields.find(h => h.id === 'Category')) {
        autoMappings.push({ sourceId: 'Category', targetId: 'localBaseCategory' });
      }
      if (!autoMappings.find(m => m.targetId === 'quantity') && sourceFields.find(h => h.id === 'Quantity_In_Stock')) {
        autoMappings.push({ sourceId: 'Quantity_In_Stock', targetId: 'quantity' });
      }
      if (!autoMappings.find(m => m.targetId === 'uom') && sourceFields.find(h => h.id === 'UOM_Used_By_CPSE')) {
        autoMappings.push({ sourceId: 'UOM_Used_By_CPSE', targetId: 'uom' });
      }
      if (autoMappings.length > 0) setMappings(autoMappings);
    }
  }, [step, sourceFields, mappings.length]);

  // Re-calculate lines after paint so refs are guaranteed to be populated
  useEffect(() => {
    let rafId: number;
    const schedule = () => {
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const coords = mappings
          .map(m => {
            const l = leftRefs.current[m.sourceId];
            const r = rightRefs.current[m.targetId];
            if (!l || !r) return null;
            const lr = l.getBoundingClientRect();
            const rr = r.getBoundingClientRect();
            return {
              id: `${m.sourceId}-${m.targetId}`,
              color: getColor(m.sourceId),
              x1: lr.left - containerRect.left + lr.width / 2,
              y1: lr.top - containerRect.top + lr.height / 2,
              x2: rr.left - containerRect.left + rr.width / 2,
              y2: rr.top - containerRect.top + rr.height / 2,
            };
          })
          .filter(Boolean) as typeof lineCoords;
        setLineCoords(coords);
      });
    };
    schedule();
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', schedule);
    };
  }, [mappings, step, sourceFields]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectedSource || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && selectedSource) {
      setSelectedSource(null);
      setMousePos(null);
    }
  };

  const handleSourceClick = (id: string) => {
    if (selectedSource === id) {
      setSelectedSource(null);
      setMousePos(null);
    } else {
      setSelectedSource(id);
    }
  };

  const handleTargetClick = (id: string) => {
    if (selectedSource) {
      setMappings(prev => {
        const filtered = prev.filter(m => m.sourceId !== selectedSource && m.targetId !== id);
        return [...filtered, { sourceId: selectedSource, targetId: id }];
      });
      setSelectedSource(null);
      setMousePos(null);
    } else {
      setMappings(prev => prev.filter(m => m.targetId !== id));
    }
  };

  
  const handleRollback = async () => {
    if (syncStats.importedIds.length === 0) return;
    setIsRollingBack(true);
    const cpseId = Cookies.get("tenantCpseId");
    try {
      const res = await fetch(`http://localhost:4000/api/cpse/${cpseId}/inventory/bulk-rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Cookies.get('token')}`
        },
        body: JSON.stringify({ inventoryIds: syncStats.importedIds })
      });
      if (res.ok) {
        setRollbackComplete(true);
        setSyncStats({ imported: 0, importedIds: [] });
      }
    } catch (err) {
      console.error("Rollback failed");
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleSync = async () => {
    setStep('syncing');
    setSyncProgress(0);
    setRollbackComplete(false);

    const cpseId = Cookies.get("tenantCpseId");
    if (!cpseId || mappings.length === 0 || parsedData.length === 0) {
      setStep('complete');
      return;
    }

    // 1. Map the CSV data
    const targetKeys = TARGET_FIELDS.map(f => f.id);
    const newCsvLines = [targetKeys.join(',')];
    
    parsedData.forEach(row => {
      const line = targetKeys.map(tKey => {
        const mapping = mappings.find(m => m.targetId === tKey);
        if (!mapping) return '';
        // Escape quotes
        const val = row[mapping.sourceId] || '';
        return `"\${String(val).replace(/"/g, '""')}"`;
      }).join(',');
      newCsvLines.push(line);
    });

    const newCsvStr = newCsvLines.join('\n');
    const blob = new Blob([newCsvStr], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'mapped_inventory.csv');

    // 2. Animate progress while uploading
    const interval = setInterval(() => {
      setSyncProgress(prev => Math.min(prev + Math.floor(parsedData.length / 10), parsedData.length - 1));
    }, 200);

    // 3. Send to actual API
    try {
      const res = await fetch(`http://localhost:4000/api/cpse/\${cpseId}/inventory/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer \${Cookies.get('token')}`
        },
        body: formData
      });
      const result = await res.json();
      
      clearInterval(interval);
      setSyncProgress(parsedData.length);
      setSyncStats({ imported: result.rowsImported || 0, importedIds: result.importedIds || [] });

      setTimeout(() => {
        setStep('complete');
      }, 800);
    } catch (err) {
      clearInterval(interval);
      setStep('complete');
    }
  };

  return (
    <PageLoader loading={isLoading}>
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connect ERP</h1>
          <p className="text-gray-500">Map your source columns to inventory fields. Unmapped fields will be ignored.</p>
        </div>
        {step === 'mapping' && (
          <button 
            onClick={handleSync}
            disabled={mappings.length === 0}
            className="cf-button-primary shadow-lg flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Sync Inventory
          </button>
        )}
      </div>

      {step === 'connect' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center text-center">
          <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
            <Database className="h-8 w-8 text-[#0051c3]" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Connect Source Data</h2>
          <p className="text-gray-500 mb-8 max-w-md">
            Upload your inventory CSV or Excel sheet to map columns into the National Database.
          </p>
          
          <div className="flex justify-center w-full max-w-md relative group cursor-pointer">
            <div className="absolute inset-0 bg-blue-50 rounded-xl border-2 border-dashed border-[#0051c3]/30 group-hover:border-[#0051c3]/60 transition-colors"></div>
            <input 
              type="file" 
              accept=".csv,.xlsx" 
              onChange={handleFileUpload} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
            />
            <div className="relative py-10 flex flex-col items-center">
              <UploadCloud className="h-8 w-8 text-[#0051c3] mb-3" />
              <span className="font-semibold text-[#0051c3]">Click to Upload CSV / XLSX</span>
              <span className="text-xs text-blue-600/70 mt-1">or drag and drop here</span>
            </div>
          </div>
        </div>
      )}

      {(step === 'mapping' || step === 'syncing' || step === 'complete') && (
        <div className="space-y-6">
          
          {/* Mapping Canvas */}
          <div 
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos(null)}
            onClick={handleContainerClick}
            className="relative bg-slate-50 border border-slate-200 rounded-xl p-10 min-h-[500px] overflow-hidden"
            style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 0)', backgroundSize: '24px 24px' }}
          >
            {/* SVG Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
              {lineCoords.map((coord, i) => (
                <g key={coord.id}>
                  <path 
                    d={`M \${coord.x1} \${coord.y1} C \${coord.x1 + 150} \${coord.y1}, \${coord.x2 - 150} \${coord.y2}, \${coord.x2} \${coord.y2}`}
                    fill="none" 
                    stroke={coord.color} 
                    strokeWidth={step === 'syncing' ? "3" : "2"}
                    className={step === 'syncing' ? 'opacity-50' : 'opacity-80 transition-all duration-300'}
                  />
                  {(step === 'mapping' || step === 'syncing') && (
                    <>
                      <circle r={step === 'syncing' ? "3" : "2"} fill="#ffffff" className="animate-particle" 
                        style={{ 
                          offsetPath: `path('M \${coord.x1} \${coord.y1} C \${coord.x1 + 150} \${coord.y1}, \${coord.x2 - 150} \${coord.y2}, \${coord.x2} \${coord.y2}')`, 
                          animationDelay: `\${i * 0.1}s`,
                          animationDuration: step === 'syncing' ? '0.4s' : '1.5s',
                          filter: `drop-shadow(0 0 \${step === 'syncing' ? '8px' : '4px'} \${coord.color})`,
                          boxShadow: `0 0 10px \${coord.color}`
                        }} 
                      />
                      <circle r={step === 'syncing' ? "3" : "2"} fill="#ffffff" className="animate-particle" 
                        style={{ 
                          offsetPath: `path('M \${coord.x1} \${coord.y1} C \${coord.x1 + 150} \${coord.y1}, \${coord.x2 - 150} \${coord.y2}, \${coord.x2} \${coord.y2}')`, 
                          animationDelay: `\${i * 0.1 + (step === 'syncing' ? 0.2 : 0.75)}s`,
                          animationDuration: step === 'syncing' ? '0.4s' : '1.5s',
                          filter: `drop-shadow(0 0 \${step === 'syncing' ? '8px' : '4px'} \${coord.color})`
                        }} 
                      />
                    </>
                  )}
                </g>
              ))}

              {selectedSource && mousePos && (() => {
                const l = leftRefs.current[selectedSource];
                if (!l || !containerRef.current) return null;
                const lr = l.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                const x1 = lr.left - containerRect.left + lr.width / 2;
                const y1 = lr.top - containerRect.top + lr.height / 2;
                const color = getColor(selectedSource);
                return (
                  <path 
                    d={`M \${x1} \${y1} C \${x1 + 150} \${y1}, \${mousePos.x - 150} \${mousePos.y}, \${mousePos.x} \${mousePos.y}`}
                    fill="none" 
                    stroke={color} 
                    strokeWidth="3"
                    strokeDasharray="6,6"
                    className="opacity-70 drop-shadow-md animate-pulse"
                  />
                );
              })()}
            </svg>

            <div className="flex justify-between relative z-20">
              
              {/* Left Node */}
              <div className="w-72 bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                    <div>
                      <h3 className="font-bold text-blue-900 text-sm">Source Data</h3>
                      <p className="text-xs text-blue-700/70">{uploadedFileName} ({parsedData.length} rows)</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      localStorage.removeItem('erp_filename');
                      localStorage.removeItem('erp_source_fields');
                      localStorage.removeItem('erp_parsed_data');
                      localStorage.removeItem('erp_mappings');
                      setStep('connect');
                      setMappings([]);
                      setSourceFields([]);
                      setParsedData([]);
                    }}
                    className="p-1.5 hover:bg-blue-100 rounded-md text-blue-600 transition-colors"
                    title="Unlink CSV"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-2 space-y-1">
                  {sourceFields.map(f => {
                    const isMapped = mappings.some(m => m.sourceId === f.id);
                    const isSelected = selectedSource === f.id;
                    return (
                      <div key={f.id} 
                           className={`flex items-center justify-between px-3 py-2 my-1 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 shadow-sm ring-1 ring-blue-300' : 'hover:bg-slate-50'}`}
                           onClick={() => step === 'mapping' && handleSourceClick(f.id)}>
                        <span className="font-mono text-sm text-gray-700">{f.label}</span>
                        {(() => {
                          const color = getColor(f.id);
                          return (
                            <div 
                              ref={el => { if (el) leftRefs.current[f.id] = el; }}
                              className={`h-4 w-4 rounded-full border-2 transition-all duration-300 \${isSelected ? 'animate-pulse scale-125 z-10' : 'hover:scale-110'}`}
                              style={{
                                borderColor: color,
                                backgroundColor: (isMapped || isSelected) ? color : 'white',
                                boxShadow: isSelected ? `0 0 12px \${color}` : 'none'
                              }}
                            />
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sync Status Overlay */}
              {step === 'syncing' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm px-6 py-4 rounded-xl border border-blue-100 shadow-xl flex flex-col items-center">
                  <RefreshCw className="h-6 w-6 text-[#0051c3] animate-spin mb-2" />
                  <p className="font-bold text-gray-900">Synchronizing inventory...</p>
                  <p className="text-sm text-gray-500 font-mono mt-1">{syncProgress} / {parsedData.length} records</p>
                </div>
              )}

              {/* Right Node */}
              <div className="w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-[#0051c3] to-blue-800 p-4 flex items-center gap-3 text-white border-b border-blue-900">
                  <Database className="h-6 w-6 text-blue-100" />
                  <div>
                    <h3 className="font-bold text-sm">National Inventory</h3>
                    <p className="text-xs text-blue-200">{cpseName}</p>
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  {TARGET_FIELDS.map(f => {
                    const mappedFrom = mappings.find(m => m.targetId === f.id);
                    const isMapped = !!mappedFrom;
                    return (
                      <div key={f.id} 
                           className="flex items-center justify-between px-3 py-2 my-1 rounded-lg cursor-pointer transition-colors hover:bg-slate-50"
                           onClick={() => step === 'mapping' && handleTargetClick(f.id)}>
                        {(() => {
                          const activeColor = selectedSource ? getColor(selectedSource) : null;
                          const dotColor = isMapped ? getColor(mappedFrom!.sourceId) : (activeColor ? activeColor : '#d1d5db');
                          return (
                            <div 
                              ref={el => { if (el) rightRefs.current[f.id] = el; }}
                              className={`h-4 w-4 rounded-full border-2 transition-all duration-300 \${!isMapped && selectedSource ? 'animate-pulse scale-110 z-10 hover:scale-125' : 'hover:scale-110'}`}
                              style={{
                                borderColor: dotColor,
                                backgroundColor: isMapped ? dotColor : 'white',
                                boxShadow: (!isMapped && selectedSource) ? `0 0 10px \${activeColor}` : 'none'
                              }}
                            />
                          );
                        })()}
                        <span className="font-mono text-sm text-gray-700">{f.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* Sync Complete Panel */}
          {step === 'complete' && (
            <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <h2 className="text-lg font-bold text-green-900">Sync Complete</h2>
                </div>
                <div className="flex items-center gap-4">
                  {syncStats.importedIds.length > 0 && !rollbackComplete && (
                    <button onClick={handleRollback} disabled={isRollingBack} className="text-sm font-semibold text-amber-600 hover:underline">
                      {isRollingBack ? 'Rolling back...' : 'Undo Sync (Rollback)'}
                    </button>
                  )}
                  {rollbackComplete && (
                    <span className="text-sm font-semibold text-gray-500">Rollback successful</span>
                  )}
                  <button onClick={() => { setStep('connect'); setRollbackComplete(false); }} className="text-sm font-semibold text-[#0051c3] hover:underline">
                    Upload another file
                  </button>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-4 w-4" /> {parsedData.length} records processed
                  </div>
                  <div className="flex items-center gap-2 text-blue-600">
                    <span className="w-4 text-center font-bold">+</span> {syncStats.imported} records imported
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <span className="w-4 text-center font-bold">!</span> {parsedData.length - syncStats.imported} skipped (missing mapping)
                  </div>
                </div>
                <div className="flex flex-col justify-center border-l border-gray-100 pl-8">
                  <p className="text-sm text-gray-500">Last synced</p>
                  <p className="text-lg font-bold text-gray-900">Just now</p>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Global CSS for particle animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes offset-distance {
          0% { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .animate-particle {
          animation: offset-distance 2s linear infinite;
        }
      `}} />
    </div>
  </PageLoader>
  );
}
