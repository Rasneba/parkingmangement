"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GemPage, GemHeader, GemCard, GemCardBare, GemKpi, GemBtn, GemBtnOutline, GemTable, GemBadge } from "@/lib/gem-ui";
import { Car, Timer, ArrowRightCircle, Banknote, UserCheck, CalendarCheck, Map, LayoutGrid, DoorOpen, Camera, Users, Truck, CreditCard, Clock, DollarSign, QrCode, Monitor, BarChart } from "lucide-react";

export default function ParkingDashboard() {
  const [stats, setStats] = useState<any>(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/membership/parking/stats", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setStats(data);
    } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!stats) return; const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [stats]);

  return (
    <GemPage>
      <GemHeader
        title="Parking Management"
        subtitle="ANPR camera parking with QR gate entry, lot selection, and POS"
        actions={
          <>
            <Link href="/dashboard/membership/parking/sessions" className="GemBtnOutline inline-flex items-center gap-2">
              <Timer size={16} />Live Sessions
            </Link>
            <Link href="/dashboard/membership/parking/pos" className="text-white px-5 py-3 rounded-xl font-medium transition-all hover:opacity-90 active:scale-[0.97] inline-flex items-center gap-2" style={{ background: "#10b981" }}>
              <Monitor size={16} />POS Terminal
            </Link>
          </>
        }
      />

      {!stats ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border-color)", borderTopColor: "var(--accent-sky)" }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Occupied", value: `${stats.occupiedSlots} / ${stats.totalSlots}`, sub: `${stats.availableSlots} available`, icon: <Car size={22} />, color: "bg-red-500", href: "/dashboard/membership/parking/slots" },
              { label: "Active Sessions", value: stats.activeSessions, icon: <Timer size={22} />, color: "bg-emerald-600", href: "/dashboard/membership/parking/sessions" },
              { label: "Today Entries", value: stats.todayEntries, icon: <ArrowRightCircle size={22} />, color: "bg-blue-600", href: "/dashboard/membership/parking/sessions" },
              { label: "Today Revenue", value: `ETB ${Number(stats.todayRevenue).toLocaleString()}`, icon: <DollarSign size={22} />, color: "bg-amber-500", href: "/dashboard/membership/parking/pos" },
              { label: "Registered Customers", value: stats.totalCustomers, icon: <UserCheck size={22} />, color: "bg-blue-500", href: "/dashboard/membership/parking/customers" },
              { label: "Active Subscriptions", value: stats.activeSubscriptions, icon: <CalendarCheck size={22} />, color: "bg-emerald-600", href: "/dashboard/membership/parking/subscriptions" },
            ].map(card => (
              <Link key={card.label} href={card.href} className="text-inherit no-underline">
                <GemCard>
                  <div className="flex items-center gap-4">
                    <div className={`${card.color} text-white p-3.5 rounded-2xl`}>{card.icon}</div>
                    <div>
                      <p className="text-sm font-medium uppercase" style={{ color: "var(--text-secondary)" }}>{card.label}</p>
                      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{card.value}</p>
                      {card.sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{card.sub}</p>}
                    </div>
                  </div>
                </GemCard>
              </Link>
            ))}
          </div>

          <GemCardBare className="mb-8">
            <div className="p-6 flex justify-between items-center" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <h2 className="font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Car size={18} />Active Parking Sessions</h2>
              <Link href="/dashboard/membership/parking/sessions" className="text-sm font-medium" style={{ color: "var(--accent-sky)" }}>View All</Link>
            </div>
            <div className="overflow-x-auto">
              {stats.recentSessions?.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>No active sessions</div>
              ) : (
                <GemTable
                  headers={["Plate", "Vehicle", "Owner", "Entry Gate", "Entry Time", "Status"]}
                  rows={(stats.recentSessions || []).map((s: any) => [
                    <span className="font-bold">{s.plate_number || s.vehicle_plate}</span>,
                    <GemBadge>{s.vehicle_type || "-"}</GemBadge>,
                    <span className="text-sm">{s.owner_name || "-"}</span>,
                    <GemBadge variant="info">{s.entry_gate_name || "-"}</GemBadge>,
                    <span className="text-sm">{new Date(s.entry_time).toLocaleString()}</span>,
                    <GemBadge variant="success">Active</GemBadge>,
                  ])}
                />
              )}
            </div>
          </GemCardBare>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { name: "Zones & Lots", icon: <Map size={28} />, desc: "Manage parking zones, lots, and slot inventory", href: "/dashboard/membership/parking/zones", color: "var(--accent-sky)" },
          { name: "Slots", icon: <LayoutGrid size={28} />, desc: "View and manage individual parking slots", href: "/dashboard/membership/parking/slots", color: "var(--accent-sky)" },
          { name: "Gates", icon: <DoorOpen size={28} />, desc: "Configure 3 entry/exit gates with ANPR", href: "/dashboard/membership/parking/gates", color: "#10b981" },
          { name: "Cameras", icon: <Camera size={28} />, desc: "ANPR camera settings and status", href: "/dashboard/membership/parking/cameras", color: "var(--text-secondary)" },
          { name: "Customers", icon: <Users size={28} />, desc: "Customer registration with QR code entry", href: "/dashboard/membership/parking/customers", color: "#f59e0b" },
          { name: "Vehicles", icon: <Truck size={28} />, desc: "Registered vehicle database", href: "/dashboard/membership/parking/vehicles", color: "var(--text-secondary)" },
          { name: "RFID Cards", icon: <CreditCard size={28} />, desc: "RFID card registration for access control", href: "/dashboard/membership/parking/rfid-cards", color: "var(--accent-purple)" },
          { name: "Subscriptions", icon: <CalendarCheck size={28} />, desc: "Monthly and annual parking plans", href: "/dashboard/membership/parking/subscriptions", color: "#10b981" },
          { name: "Sessions", icon: <Clock size={28} />, desc: "Active and completed parking sessions", href: "/dashboard/membership/parking/sessions", color: "#ef4444" },
          { name: "Rates", icon: <DollarSign size={28} />, desc: "Parking fee structure and pricing", href: "/dashboard/membership/parking/rates", color: "#10b981" },
          { name: "QR Tickets", icon: <QrCode size={28} />, desc: "Generate QR codes for visitor gate entry", href: "/dashboard/membership/parking/qr-tickets", color: "var(--accent-sky)" },
          { name: "POS Terminal", icon: <Monitor size={28} />, desc: "Payment collection and receipt printing", href: "/dashboard/membership/parking/pos", color: "var(--accent-sky)" },
          { name: "Reports", icon: <BarChart size={28} />, desc: "Subscription and access log reports", href: "/dashboard/membership/parking/reports", color: "var(--accent-sky)" },
        ].map(module => (
          <Link key={module.name} href={module.href} className="text-inherit no-underline">
            <GemCard className="text-center hover:shadow-md transition-shadow cursor-pointer">
              <div className="mb-3 flex justify-center" style={{ color: module.color }}>{module.icon}</div>
              <h3 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{module.name}</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{module.desc}</p>
            </GemCard>
          </Link>
        ))}
      </div>
    </GemPage>
  );
}
