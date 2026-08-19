"use client";

import { motion } from "framer-motion";
import { useAuthStore } from "../../lib/authStore";
import { BoxIcon, CartIcon, ChartIcon, GridIcon } from "../divine/icons";

const USER_TYPE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  CUSTOMER: "Customer",
};

const UPCOMING = [
  { icon: <GridIcon />, title: "Masters", day: "Day 3–7", detail: "Printing Group, GST, GL, Category, Item, Service, Event, Nakshatra, Customer" },
  { icon: <BoxIcon />, title: "Inventory", day: "Day 7", detail: "Stock adjustment, available stock, history, low-stock report" },
  { icon: <CartIcon />, title: "POS Transactions", day: "Day 8–9", detail: "Counter billing, payment, receipt, printing" },
  { icon: <ChartIcon />, title: "Reports", day: "Day 10", detail: "Audit trail and operational reports" },
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="font-accent text-[13px] uppercase tracking-[0.2em] text-amber-500">Dashboard</p>
        <h1 className="mt-1 font-display text-[26px] text-ink-100">Welcome back, {firstName}</h1>
        <p className="mt-1 text-[13.5px] text-ink-500">Here's where things stand today.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <InfoCard label="Signed in as" value={user?.name ?? "—"} />
        <InfoCard label="Access level" value={user ? (USER_TYPE_LABEL[user.userType] ?? user.userType) : "—"} />
        <InfoCard label="Entity" value="Sri Siva Durga Temple (SST)" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        <div className="rounded-2xl border border-gold-500/15 bg-navy-900/60 p-6">
          <p className="font-accent text-[13px] uppercase tracking-wide text-amber-600">Coming up</p>
          <p className="mt-1 text-[13px] text-ink-500">
            Auth, Users, Roles, and Permissions are live. These arrive next, in order — see the Temple
            Platform Blueprint §13 for the full build sequence.
          </p>

          <ul className="mt-5 space-y-1">
            {UPCOMING.map((item) => (
              <li
                key={item.title}
                className="group flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-ivory-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-500/20 text-amber-600 shadow-[0_0_0_0_rgba(212,175,55,0.5)] transition-shadow duration-300 group-hover:shadow-[0_0_12px_0_rgba(212,175,55,0.45)]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-ink-100">{item.title}</span>
                  <span className="block truncate text-[12px] text-ink-500">{item.detail}</span>
                </span>
                <span className="shrink-0 rounded-full border border-gold-500/20 px-2.5 py-1 text-[11px] tracking-wide text-amber-500">
                  {item.day}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gold-500/15 bg-navy-900/60 p-5">
      <p className="text-[11px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1.5 truncate font-accent text-[15px] text-ink-100">{value}</p>
    </div>
  );
}
