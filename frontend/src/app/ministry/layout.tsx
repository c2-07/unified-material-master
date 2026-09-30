"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Cookies from "js-cookie";
import { 
  Globe,
  Map,
  Network,
  Users,
  LogOut,
  Landmark,
  ChevronRight,
  Menu,
  X,
  Activity,
  Shield,
  Bell,
  Package,
  Building2,
  GitCompare,
  BarChart3
} from "lucide-react";

export default function MinistryLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'dashboard', icon: 'GitCompare', title: 'AI Engine Mapping Complete', message: 'The AI successfully mapped 15 new CPSE materials to National Codes. Pending review.', time: '10 mins ago' },
    { id: 2, type: 'routing', icon: 'Package', title: 'Demand Acknowledged', message: 'SAIL has acknowledged and accepted the routed demand for NAT-PVF-3002 from ONGC.', time: '1 hour ago' },
    { id: 3, type: 'cpses', icon: 'Building2', title: 'New CPSE Node Registered', message: 'A new CPSE system has been successfully connected and onboarded.', time: 'Yesterday' }
  ]);

  useEffect(() => {
    const token = Cookies.get("token");
    const role = Cookies.get("role");

    if (!token || role !== "MINISTRY") {
      router.push("/");
    }
  }, [router]);

  const handleLogout = () => {
    setSigningOut(true);
    setTimeout(() => {
      Cookies.remove("token");
      Cookies.remove("role");
      Cookies.remove("tenantCpseId");
      sessionStorage.clear();
      router.push("/");
    }, 1800);
  };

  const sidebarCategories = [
    {
      title: "Catalog Management",
      items: [
        { name: "National Overview", href: "/ministry/overview", icon: BarChart3 },
        { name: "Global Catalog", href: "/ministry/catalog", icon: Globe },
        { name: "AI Mapping Review", href: "/ministry/dashboard", icon: Map },
      ]
    },
    {
      title: "Supply Chain",
      items: [
        { name: "Request Fulfillment", href: "/ministry/routing", icon: Network },
      ]
    },
    {
      title: "Administration",
      items: [
        { name: "CPSE Management", href: "/ministry/cpses", icon: Users },
        { name: "System Audit Logs", href: "/ministry/audit", icon: Activity },
      ]
    }
  ];

  const SidebarContent = () => (
    <>
      <div>
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Landmark className="h-6 w-6 text-[#0051c3] mr-2" />
          <span className="font-bold text-gray-900 tracking-tight">Ministry Hub</span>
        </div>
        <div className="px-4 py-6 space-y-6">
          {sidebarCategories.map((category) => (
            <div key={category.title} className="space-y-1">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-3">
                {category.title}
              </div>
              {category.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? "bg-[#ebf3ff] text-[#0051c3]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <item.icon className={`mr-3 h-4 w-4 ${isActive ? "text-[#0051c3]" : "text-gray-400"}`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-200 relative">
        {showProfilePopover && (
          <div className="absolute bottom-full left-4 mb-2 w-[calc(100%-2rem)] bg-white border border-gray-200 shadow-lg rounded-lg p-3 z-50 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-[#0051c3] flex items-center justify-center text-white font-bold text-lg">
                GOV
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Ministry</p>
                <p className="text-xs text-gray-500">admin@ministry.gov.in</p>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <Shield className="h-3 w-3" /> Authenticated Session
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-100 transition-colors">
          <button 
            className="flex items-center gap-2 overflow-hidden flex-1 text-left"
            onClick={() => setShowProfilePopover(!showProfilePopover)}
          >
            <div className="h-8 w-8 rounded-full bg-[#0051c3] flex items-center justify-center text-white font-bold text-sm shrink-0">
              GOV
            </div>
            <span className="text-sm font-semibold text-gray-900 truncate">Ministry</span>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors ml-2 shrink-0 group"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4 group-hover:text-red-600" />
          </button>
        </div>
      </div>
    </>
  );

  // Find current section name and icon
  let currentSectionName = "Dashboard";
  let CurrentSectionIcon = null as any;
  sidebarCategories.forEach(cat => {
    cat.items.forEach(item => {
      if (item.href === pathname) {
        currentSectionName = item.name;
        CurrentSectionIcon = item.icon;
      }
    });
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f9fafb]">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
      {/* Indian Flag Strip - Global */}
      <div className="w-full flex h-1.5 shrink-0 border-b border-gray-200">
        <div className="flex-1 bg-[#FF9933]"></div>
        <div className="flex-1 bg-white"></div>
        <div className="flex-1 bg-[#138808]"></div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex-col justify-between hidden md:flex">
          <SidebarContent />
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            <div 
              className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity" 
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
              <div className="absolute top-0 right-0 -mr-12 pt-4">
                <button
                  type="button"
                  className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
              <SidebarContent />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full">
          {/* Topbar */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
            <div className="flex items-center">
              <button
                type="button"
                className="md:hidden mr-4 text-gray-500 hover:text-gray-900"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex items-center text-sm text-gray-500">
                <span className="hidden sm:inline">Dashboard</span>
                {currentSectionName !== "Dashboard" && (
                  <>
                    <ChevronRight className="h-4 w-4 mx-1 sm:mx-2 hidden sm:inline text-gray-400" />
                    <div className="flex items-center gap-1.5 font-semibold text-gray-900 bg-gray-100/60 px-2.5 py-1 rounded-md border border-gray-200/60 shadow-sm">
                      {CurrentSectionIcon && <CurrentSectionIcon className="h-4 w-4 text-[#0051c3]" />}
                      <span>{currentSectionName}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* Marquee */}
            <div className="flex-1 mx-6 overflow-hidden bg-[#fff8f1] border border-orange-100 rounded-full px-4 py-1.5 hidden lg:flex items-center shadow-inner relative">
              <div className="whitespace-nowrap animate-marquee flex gap-12 text-xs font-bold text-orange-700 uppercase tracking-widest w-max">
                <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Total Demands Processed: 1,402</span>
                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Active CPSE Nodes: 42</span>
                <span className="flex items-center gap-1.5"><GitCompare className="h-3.5 w-3.5" /> 12 AI Mappings Pending Review</span>
                {/* Duplicate for seamless loop */}
                <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Total Demands Processed: 1,402</span>
                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Active CPSE Nodes: 42</span>
                <span className="flex items-center gap-1.5"><GitCompare className="h-3.5 w-3.5" /> 12 AI Mappings Pending Review</span>
              </div>
            </div>

            {/* Notification Bell */}
            
            {/* Notification Bell */}
            <div className="flex items-center gap-3 relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-colors"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
              </button>
              
              {showNotifications && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 shadow-xl rounded-xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
                    <div className="flex items-center gap-3">
                      {notifications.length > 0 && (
                        <button onClick={() => setNotifications([])} className="text-xs text-[#0051c3] hover:text-blue-800 font-medium">Clear All</button>
                      )}
                      <span className="text-[10px] font-bold bg-[#0051c3] text-white px-2 py-0.5 rounded-full">{notifications.length} New</span>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-gray-500 text-sm">No new notifications.</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="w-full text-left p-4 hover:bg-gray-50 border-b border-gray-50 flex gap-3 transition-colors relative group">
                          <button 
                            onClick={(e) => { 
                              setShowNotifications(false); 
                              router.push(`/ministry/${n.type}`); 
                            }}
                            className="flex-1 flex gap-3 text-left"
                          >
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${n.type === 'dashboard' ? 'bg-blue-100' : n.type === 'routing' ? 'bg-green-100' : 'bg-purple-100'}`}>
                              {n.type === 'dashboard' && <GitCompare className="h-4 w-4 text-blue-600" />}
                              {n.type === 'routing' && <Package className="h-4 w-4 text-green-600" />}
                              {n.type === 'cpses' && <Building2 className="h-4 w-4 text-purple-600" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                              <p className="text-[10px] text-gray-400 mt-1 font-medium">{n.time}</p>
                            </div>
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotifications(notifications.filter(x => x.id !== n.id));
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 transition-opacity absolute right-4 top-4"
                            title="Clear"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div key={pathname} className="max-w-6xl mx-auto w-full page-enter">
               {children}
            </div>
          </main>
        </div>
      </div>

      {/* ── Sign-out Splash ── */}
      {signingOut && (
        <div className="fixed inset-0 z-[999] bg-[#0d1117] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin h-20 w-20 text-white/80" viewBox="0 0 100 100" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="45" strokeWidth="4" />
              <circle cx="50" cy="50" r="8" fill="currentColor" />
              {Array.from({ length: 24 }).map((_, i) => (
                <line key={i} x1="50" y1="50"
                  x2={+(50 + 45 * Math.cos((i * 15 * Math.PI) / 180)).toFixed(4)}
                  y2={+(50 + 45 * Math.sin((i * 15 * Math.PI) / 180)).toFixed(4)}
                  strokeWidth="2" />
              ))}
            </svg>
            <div className="text-center">
              <p className="text-white font-semibold text-lg tracking-wide">Signing out securely</p>
              <p className="text-white/40 text-sm mt-1 font-mono">Clearing session data...</p>
            </div>
            <div className="flex gap-1.5">
              <span className="h-1 w-8 rounded-full bg-orange-500 animate-pulse" style={{animationDelay:'0ms'}} />
              <span className="h-1 w-8 rounded-full bg-white animate-pulse" style={{animationDelay:'150ms'}} />
              <span className="h-1 w-8 rounded-full bg-green-500 animate-pulse" style={{animationDelay:'300ms'}} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
