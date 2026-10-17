"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Lock, Mail, Building2, Loader2 } from "lucide-react";
import { apiPost, setSession, getToken } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyTin, setCompanyTin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard/membership/parking");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiPost<{ token: string; user: any }>("/api/auth/login", {
        email,
        password,
        company_tin: companyTin || undefined,
      });
      setSession(res.token, res.user);
      router.replace("/dashboard/membership/parking");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#0ea5e9 140%)" }}
      suppressHydrationWarning
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-3"
            style={{ width: 64, height: 64, background: "rgba(255,255,255,0.12)" }}
          >
            <Car className="text-white" size={34} />
          </div>
          <h1 className="text-2xl font-bold text-white">Parking Management</h1>
          <p className="text-sm" style={{ color: "#cbd5e1" }}>
            Sign in with your Genius ERP account
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl p-6 shadow-2xl"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm mb-4"
              style={{ background: "#ef44441a", color: "#ef4444" }}
            >
              {error}
            </div>
          )}

          <label className="block mb-4">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              Email
            </span>
            <div className="flex items-center gap-2 mt-1.5 rounded-xl px-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)" }}>
              <Mail size={16} style={{ color: "var(--text-tertiary)" }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="flex-1 py-2.5 bg-transparent outline-none text-sm"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
          </label>

          <label className="block mb-4">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              Password
            </span>
            <div className="flex items-center gap-2 mt-1.5 rounded-xl px-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)" }}>
              <Lock size={16} style={{ color: "var(--text-tertiary)" }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 py-2.5 bg-transparent outline-none text-sm"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
          </label>

          <label className="block mb-5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              Company TIN (optional)
            </span>
            <div className="flex items-center gap-2 mt-1.5 rounded-xl px-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-color)" }}>
              <Building2 size={16} style={{ color: "var(--text-tertiary)" }} />
              <input
                type="text"
                value={companyTin}
                onChange={(e) => setCompanyTin(e.target.value)}
                placeholder="Only if your email is in multiple companies"
                className="flex-1 py-2.5 bg-transparent outline-none text-sm"
                style={{ color: "var(--text-primary)" }}
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "var(--accent-gradient)" }}
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs mt-5" style={{ color: "#cbd5e1" }}>
          Uses the existing Genius ERP users, roles and companies.
        </p>
      </div>
    </div>
  );
}
