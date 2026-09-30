"use client";
import { AshokaChakraSpinner } from "@/components/AshokaChakraSpinner";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, TerminalSquare, LogIn, Landmark, X, Search } from "lucide-react";
import axios from "axios";
import Cookies from "js-cookie";
import Dialog from "@/components/Dialog";

interface DevUser {
  email: string;
  role: string;
  tenantCpseId: string | null;
}

type ActiveRole = "MINISTRY" | "CPSE";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [activeRole, setActiveRole] = useState<ActiveRole>("CPSE");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantCpseId, setTenantCpseId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [splash, setSplash] = useState<{ role: string } | null>(null);

  // Quick Login
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [showQuickLogin, setShowQuickLogin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean; title: string; message: string;
  }>({ isOpen: false, title: "", message: "" });

  const handleAuthSuccess = (token: string, userRole: string, userTenant: string) => {
    Cookies.set("token", token, { expires: 7 });
    Cookies.set("role", userRole, { expires: 7 });
    Cookies.set("tenantCpseId", userTenant || "", { expires: 7 });
    setSplash({ role: userRole });
    setTimeout(() => {
      if (userRole === "MINISTRY") router.push("/ministry/overview");
      else router.push("/cpse/overview");
    }, 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        const res = await axios.post("http://localhost:4000/api/auth/login", { email, password });
        handleAuthSuccess(res.data.token, res.data.user.role, res.data.user.tenantCpseId);
      } else {
        await axios.post("http://localhost:4000/api/auth/register", {
          email, password,
          role: activeRole,
          tenantCpseId: activeRole === "CPSE" ? tenantCpseId : undefined,
        });
        setIsLogin(true);
        setError("Registration successful! Please log in.");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDevUsers = async () => {
    try {
      const res = await axios.get("http://localhost:4000/api/dev/users");
      const sorted = res.data.sort((a: DevUser, b: DevUser) => {
        if (a.role === "MINISTRY" && b.role !== "MINISTRY") return -1;
        if (a.role !== "MINISTRY" && b.role === "MINISTRY") return 1;
        return (a.tenantCpseId || "").localeCompare(b.tenantCpseId || "");
      });
      setDevUsers(sorted);
    } catch {}
  };

  const handleDevLoginAs = async (targetEmail: string) => {
    try {
      const res = await axios.post("http://localhost:4000/api/dev/login-as", { email: targetEmail });
      handleAuthSuccess(res.data.token, res.data.user.role, res.data.user.tenantCpseId);
    } catch {
      setDialogConfig({ isOpen: true, title: "Error", message: "Quick login failed." });
    }
  };

  const handleQuickFill = (user: DevUser) => {
    setEmail(user.email);
    setPassword("password123");
    setActiveRole(user.role === "MINISTRY" ? "MINISTRY" : "CPSE");
    setShowQuickLogin(false);
  };

  useEffect(() => {
    if (showQuickLogin) { fetchDevUsers(); setSearchQuery(""); }
  }, [showQuickLogin]);

  // Load quick-fill users on mount
  useEffect(() => { fetchDevUsers(); }, []);

  // Auto-redirect if already logged in
  useEffect(() => {
    const token = Cookies.get("token");
    const role = Cookies.get("role");
    if (token && role) {
      if (role === "MINISTRY") router.push("/ministry/overview");
      else router.push("/cpse/overview");
    }
  }, [router]);

  const filteredUsers = devUsers.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.tenantCpseId && u.tenantCpseId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const ministryUser = devUsers.find(u => u.role === "MINISTRY");
  const cpseUsers = devUsers.filter(u => u.role === "CPSE").slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Indian Flag Tricolor Strip — same as dashboard */}
      <div className="w-full flex h-1.5 shrink-0">
        <div className="flex-1 bg-[#FF9933]"></div>
        <div className="flex-1 bg-white border-y border-gray-200"></div>
        <div className="flex-1 bg-[#138808]"></div>
      </div>

      <div className="flex flex-1">

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#0d1117] flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        {/* Brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white font-bold text-lg">🏛</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Unified Material Code</p>
              <p className="text-white/40 text-xs uppercase tracking-widest">Government of India</p>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-6">
            National Inventory<br />Management Portal
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-sm">
            Secure, role-based access portal for the National Unified Material Master. 
            Access is restricted to authorized Ministry officials and CPSE Nodal Administrators.
          </p>
        </div>

        {/* Ashoka Chakra decoration */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 bg-white/10" />
            <AshokaChakraSpinner className="h-8 w-8 text-white/20" />
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <p className="text-white/25 text-xs text-center font-mono">
            Ministry of Steel · CPSE Division · Secure Gateway
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 py-12 bg-gray-50 relative">

        {/* Quick Login button — top right */}
        <div className="absolute top-5 right-5">
          <button
            onClick={() => setShowQuickLogin(true)}
            className="flex items-center gap-2 bg-gray-900 text-white px-3 py-1.5 rounded-md text-xs font-mono shadow hover:bg-gray-700 transition"
          >
            <TerminalSquare className="h-3.5 w-3.5 text-green-400" />
            Quick Login
          </button>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {isLogin ? "Sign In to Dashboard" : "Create Account"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isLogin ? "Select your authorization role to continue." : "Register your organization account."}
            </p>
          </div>

          {/* Role Tabs */}
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden mb-6 shadow-sm">
            <button
              type="button"
              onClick={() => { setActiveRole("MINISTRY"); setEmail(""); setPassword(""); }}
              className={`flex-1 flex flex-col items-center gap-1.5 py-4 text-xs font-medium transition-all ${
                activeRole === "MINISTRY"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Landmark className="h-5 w-5" />
              Ministry
            </button>
            <button
              type="button"
              onClick={() => { setActiveRole("CPSE"); setEmail(""); setPassword(""); }}
              className={`flex-1 flex flex-col items-center gap-1.5 py-4 text-xs font-medium transition-all border-l border-gray-200 ${
                activeRole === "CPSE"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Building2 className="h-5 w-5" />
              CPSE Admin
            </button>
          </div>

          {/* Auth Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-5">
              {activeRole === "MINISTRY" ? "Ministry of Steel" : "CPSE Nodal Admin"}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email ID</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                  placeholder={activeRole === "MINISTRY" ? "ministry@steel.gov.in" : "nodal.officer@ongc.in"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                  placeholder="••••••••••••"
                />
              </div>

              {!isLogin && activeRole === "CPSE" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">CPSE Identifier</label>
                  <input
                    type="text"
                    required
                    value={tenantCpseId}
                    onChange={e => setTenantCpseId(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                    placeholder="e.g. ONGC"
                  />
                </div>
              )}

              {error && (
                <div className={`p-3 text-sm rounded-lg ${error.includes("successful") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 rounded-xl transition mt-2"
              >
                {loading ? (
                  <><AshokaChakraSpinner className="h-5 w-5 text-white" /> Processing...</>
                ) : (
                  <><LogIn className="h-4 w-4" /> {isLogin ? "Secure Login" : "Register"}</>
                )}
              </button>
            </form>

            {/* Autofill hints */}
            {isLogin && devUsers.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2.5">Quick Fill</p>
                <div className="flex flex-wrap gap-2">
                  {ministryUser && (
                    <button
                      type="button"
                      onClick={() => handleQuickFill(ministryUser)}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition"
                    >
                      Ministry Hub
                    </button>
                  )}
                  {cpseUsers.map(u => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => handleQuickFill(u)}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition"
                    >
                      {u.tenantCpseId?.toUpperCase()}
                    </button>
                  ))}
                  {devUsers.filter(u => u.role === "CPSE").length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowQuickLogin(true)}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200 transition"
                    >
                      +{devUsers.filter(u => u.role === "CPSE").length - 4} more
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Toggle login/register */}
          <div className="mt-5 text-center">
            <button
              onClick={() => { setIsLogin(!isLogin); setError(""); }}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              {isLogin ? "Need to register an organization? " : "Already have an account? "}
              <span className="font-semibold text-gray-900 underline underline-offset-2">
                {isLogin ? "Create account" : "Sign in"}
              </span>
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Authorized personnel only. Ministry of Steel, Government of India.
          </p>
        </div>
        </div>
      </div>

      {/* ── Quick Login Modal ── */}
      {showQuickLogin && (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col" style={{ maxHeight: "80vh" }}>
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <TerminalSquare className="h-4 w-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900 text-sm">Quick Login</h3>
              </div>
              <button onClick={() => setShowQuickLogin(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search CPSEs (e.g. ONGC)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No results found.</p>
              ) : filteredUsers.map(u => (
                <div
                  key={u.email}
                  onClick={() => { handleQuickFill(u); setShowQuickLogin(false); }}
                  className={`flex justify-between items-center px-4 py-3 rounded-xl cursor-pointer transition border ${
                    u.role === "MINISTRY"
                      ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {u.tenantCpseId?.toUpperCase() || "Ministry Hub"}
                    </p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{u.email}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type="alert"
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        onConfirm={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
      />

      {/* ── Login Splash Overlay ── */}
      {splash && (
        <div className="fixed inset-0 z-[999] bg-[#0d1117] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-6">
            <AshokaChakraSpinner className="h-20 w-20 text-white/80" />
            <div className="text-center">
              <p className="text-white font-semibold text-lg tracking-wide">
                {splash.role === "MINISTRY" ? "Ministry of Steel" : "CPSE Portal"}
              </p>
              <p className="text-white/40 text-sm mt-1 font-mono">Authenticating secure session...</p>
            </div>
            <div className="flex gap-1.5 mt-2">
              <span className="h-1 w-8 rounded-full bg-orange-500 animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="h-1 w-8 rounded-full bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="h-1 w-8 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
