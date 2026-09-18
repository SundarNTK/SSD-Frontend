"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useAuthStore } from "../../lib/authStore";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import {
  BoxIcon,
  CartIcon,
  ChartIcon,
  GridIcon,
  PlusIcon,
  RefreshIcon,
  UsersIcon,
  UserIcon,
  CalendarIcon,
  ShieldIcon,
  ArrowUpIcon,
} from "../divine/icons";

type Kpis = {
  todayCollections: number;
  todayPosSales: number;
  todayOnlineBookings: number;
  cashCollection: number;
  netsCollection: number;
  paynowCollection: number;
  totalGstCollected: number;
  pendingCancellations: number;
  pendingRefunds: number;
  lowStockItems: number;
  activeCustomers: number;
  activeServices: number;
  activeItems: number;
};

type DayPoint = { date: string; label: string; amount: number };
type PaymentSlice = { mode: string; amount: number; percent: number; color: string };

type BookingFeed = {
  id: string;
  number: string;
  customerName: string;
  serviceName: string;
  amount: number;
  paymentStatus: string;
  bookingStatus: string;
  portal?: string;
  bookedAt: string;
};

type LowStockAlert = {
  id: string;
  name: string;
  code: string;
  currentStock: number;
  threshold: number;
};

type CancelFeed = {
  id: string;
  number: string;
  customerName: string;
  reason: string;
  amount: number;
  status: string;
};

type OverviewPayload = {
  kpis: Kpis;
  charts: {
    dailyCollection: DayPoint[];
    collectionTrendPct: number;
    paymentBreakdown: PaymentSlice[];
  };
  feeds: {
    recentPosTransactions: BookingFeed[];
    recentPortalBookings: BookingFeed[];
    lowStockAlerts: LowStockAlert[];
    pendingCancellations: CancelFeed[];
  };
  generatedAt: string;
};

function formatCurrency(v: number) {
  return `$${Number(v || 0).toFixed(2)}`;
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const EASE_CINEMA = [0.16, 1, 0.3, 1] as const;

const pageVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.14, delayChildren: 0.05 },
  },
};

const sceneVariants = {
  hidden: { opacity: 0, y: 42, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.95, ease: EASE_CINEMA },
  },
};

const kpiGridVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const kpiItemVariants = {
  hidden: { opacity: 0, y: 32, scale: 0.9 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, ease: EASE_CINEMA },
  },
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiEnvelope<OverviewPayload>>("/dashboard/overview");
      setData(unwrap(res));
      setReady(true);
    } catch (err) {
      setError(extractErrorMessage(err));
      setReady(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = data?.kpis;
  const charts = data?.charts;
  const feeds = data?.feeds;
  const sceneKey = data?.generatedAt ?? "boot";

  const kpiCards = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        key: "collections",
        label: "Today's Collections",
        value: formatCurrency(kpis.todayCollections),
        href: "/admin/transactions/pos-transactions",
        tone: "maroon" as const,
        icon: <ChartIcon className="h-4 w-4" />,
      },
      {
        key: "pos",
        label: "Today's POS Sales",
        value: formatCurrency(kpis.todayPosSales),
        href: "/admin/transactions/pos-transactions",
        tone: "orange" as const,
        icon: <CartIcon />,
      },
      {
        key: "online",
        label: "Today's Online Bookings",
        value: formatCurrency(kpis.todayOnlineBookings),
        href: "/admin/transactions/admin-booking",
        tone: "gold" as const,
        icon: <CalendarIcon className="h-4 w-4" />,
      },
      {
        key: "cash",
        label: "Cash Collection",
        value: formatCurrency(kpis.cashCollection),
        href: "/admin/transactions/pos-transactions",
        tone: "maroon" as const,
        icon: <span className="text-[13px] font-bold">$</span>,
      },
      {
        key: "nets",
        label: "NETS Collection",
        value: formatCurrency(kpis.netsCollection),
        href: "/admin/transactions/pos-transactions",
        tone: "orange" as const,
        icon: <span className="text-[11px] font-bold">N</span>,
      },
      {
        key: "paynow",
        label: "PayNow Collection",
        value: formatCurrency(kpis.paynowCollection),
        href: "/admin/transactions/pos-transactions",
        tone: "olive" as const,
        icon: <span className="text-[11px] font-bold">P</span>,
      },
      {
        key: "gst",
        label: "Total GST Collected",
        value: formatCurrency(kpis.totalGstCollected),
        href: "/admin/masters/gst",
        tone: "gold" as const,
        icon: <GridIcon />,
      },
      {
        key: "cancel",
        label: "Pending Cancellations",
        value: String(kpis.pendingCancellations),
        href: "/admin/hall-meal/hall-bookings",
        tone: "orange" as const,
        icon: <span className="text-[13px]">!</span>,
      },
      {
        key: "refund",
        label: "Pending Refunds",
        value: String(kpis.pendingRefunds),
        href: "/admin/hall-meal/hall-bookings",
        tone: "orange" as const,
        icon: <RefreshIcon className="h-4 w-4" />,
      },
      {
        key: "stock",
        label: "Low-Stock Items",
        value: String(kpis.lowStockItems),
        href: "/admin/inventory/low-stock",
        tone: "orange" as const,
        icon: <BoxIcon />,
      },
      {
        key: "customers",
        label: "Active Customers",
        value: String(kpis.activeCustomers),
        href: "/admin/customers",
        tone: "maroon" as const,
        icon: <UsersIcon />,
      },
      {
        key: "services",
        label: "Active Services",
        value: String(kpis.activeServices),
        href: "/admin/masters/services",
        tone: "gold" as const,
        icon: <GridIcon />,
      },
      {
        key: "items",
        label: "Active Items",
        value: String(kpis.activeItems),
        href: "/admin/masters/items",
        tone: "olive" as const,
        icon: <BoxIcon />,
      },
    ];
  }, [kpis]);

  return (
    <motion.div
      className="dash-cinema relative space-y-6 pb-8"
      variants={pageVariants}
      initial="hidden"
      animate={ready ? "show" : "hidden"}
    >
      <div className="dash-cinema-wash pointer-events-none absolute -inset-x-4 -top-6 h-64 sm:-inset-x-6" aria-hidden />
      <div className="dash-cinema-sweep pointer-events-none absolute inset-x-0 top-0 h-[70%]" aria-hidden />

      <motion.header
        variants={sceneVariants}
        className="relative flex flex-wrap items-end justify-between gap-3 overflow-hidden rounded-2xl border border-maroon/15 bg-gradient-to-br from-white via-[#fffaf3] to-[#f8ebe0] px-5 py-5 shadow-[0_16px_40px_-22px_rgba(124,21,39,0.4)]"
      >
        <div
          className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(212,175,55,0.28) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative z-10">
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.4em", y: 10 }}
            animate={{ opacity: 1, letterSpacing: "0.18em", y: 0 }}
            transition={{ duration: 1, ease: EASE_CINEMA, delay: 0.12 }}
            className="font-accent text-[12px] uppercase text-amber-600"
          >
            Dashboard Overview
          </motion.p>
          <h1 className="mt-1.5 font-display text-[26px] font-bold tracking-tight text-ink-100 sm:text-[30px]">
            <WelcomeTitle firstName={firstName} />
            <span className="dash-wave-hand ml-1.5 inline-block origin-bottom-right" aria-hidden>
              👋
            </span>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.62, ease: EASE_CINEMA }}
            className="mt-1.5 text-[13.5px] text-ink-500"
          >
            Here&apos;s what&apos;s happening at the temple today.
          </motion.p>
        </div>
        <motion.button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          initial={{ opacity: 0, scale: 0.88, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 18 }}
          whileHover={{ y: -3, scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          className="relative z-10 inline-flex items-center gap-2 rounded-xl border border-maroon/20 bg-white/95 px-3.5 py-2 text-[12.5px] font-medium text-maroon shadow-sm backdrop-blur-sm disabled:opacity-60"
        >
          <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </motion.button>
      </motion.header>

      {error && !data ? (
        <motion.div
          variants={sceneVariants}
          className="rounded-2xl border-2 border-crimson-500/30 bg-white px-5 py-8 text-center"
        >
          <p className="text-[14px] text-crimson-600">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-xl bg-maroon px-4 py-2 text-[13px] font-medium text-white"
          >
            Try again
          </button>
        </motion.div>
      ) : null}

      <motion.div
        key={`kpi-${sceneKey}`}
        variants={kpiGridVariants}
        initial="hidden"
        animate={ready && (!loading || !!data) ? "show" : "hidden"}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {loading && !data
          ? Array.from({ length: 13 }).map((_, i) => <KpiSkeleton key={i} delay={i * 0.03} />)
          : kpiCards.map((card) => (
              <motion.div key={card.key} variants={kpiItemVariants}>
                <KpiCard {...card} />
              </motion.div>
            ))}
      </motion.div>

      <motion.div variants={sceneVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, x: -36 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1, ease: EASE_CINEMA }}
          className="dash-panel dash-panel--maroon dash-panel-enter rounded-2xl border-2 border-maroon/25 bg-white p-5 shadow-[0_16px_40px_-18px_rgba(124,21,39,0.42)]"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-100">Daily Collection</h2>
              <p className="text-[12px] text-ink-500">Last 7 days</p>
            </div>
            {charts ? (
              <TrendBadge pct={charts.collectionTrendPct} />
            ) : (
              <div className="h-6 w-14 animate-pulse rounded-full bg-ivory-100" />
            )}
          </div>
          {loading && !charts ? (
            <div className="flex h-52 items-end gap-2 px-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 animate-pulse rounded-t-md bg-ivory-100"
                  style={{ height: `${40 + ((i * 17) % 50)}%` }}
                />
              ))}
            </div>
          ) : (
            <BarChart key={`bars-${sceneKey}`} series={charts?.dailyCollection ?? []} />
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 36 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1, delay: 0.12, ease: EASE_CINEMA }}
          className="dash-panel dash-panel--gold dash-panel-enter rounded-2xl border-2 border-amber-500/30 bg-white p-5 shadow-[0_16px_40px_-18px_rgba(166,116,32,0.38)]"
        >
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-ink-100">Payment Mode Breakdown</h2>
            <p className="text-[12px] text-ink-500">Today&apos;s paid collections</p>
          </div>
          {loading && !charts ? (
            <div className="flex h-52 items-center justify-center">
              <div className="h-36 w-36 animate-pulse rounded-full border-[14px] border-ivory-100" />
            </div>
          ) : (
            <DonutChart key={`donut-${sceneKey}`} slices={charts?.paymentBreakdown ?? []} />
          )}
        </motion.section>
      </motion.div>

      <motion.section
        variants={sceneVariants}
        className="dash-panel dash-panel--flame rounded-2xl border-2 border-[#e67e22]/28 bg-white p-5 shadow-[0_16px_40px_-18px_rgba(230,126,34,0.32)]"
      >
        <h2 className="mb-4 text-[15px] font-semibold text-ink-100">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.div
              key={a.label}
              initial={{ opacity: 0, y: 22, scale: 0.82 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.06 + i * 0.055,
                type: "spring",
                stiffness: 320,
                damping: 18,
              }}
              whileHover={{ y: -5, scale: 1.05 }}
            >
              <Link
                href={a.href}
                className="group flex flex-col items-center gap-2 rounded-xl border border-maroon/20 bg-[#fdf6f0] px-2 py-3.5 text-center transition hover:border-maroon/40 hover:bg-[#fceee4] hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-maroon/10 bg-white text-maroon shadow-sm transition duration-300 group-hover:scale-110 group-hover:border-maroon/25">
                  {a.icon}
                </span>
                <span className="text-[11.5px] font-medium leading-tight text-ink-300">{a.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.div variants={sceneVariants} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <FeedCard
            title="Recent POS Transactions"
            href="/admin/transactions/pos-transactions"
            accent="maroon"
            delay={0}
            loading={loading && !feeds}
            empty={!feeds?.recentPosTransactions?.length}
          >
            {feeds?.recentPosTransactions.map((row, i) => (
              <FeedRow
                key={row.id}
                delay={i * 0.07}
                title={row.number}
                subtitle={`${row.customerName} · ${formatWhen(row.bookedAt)}`}
                amount={formatCurrency(row.amount)}
                badge={<StatusBadge label="Completed" tone="green" />}
              />
            ))}
          </FeedCard>

          <FeedCard
            title="Low-Stock Alerts"
            href="/admin/inventory/low-stock"
            accent="orange"
            delay={0.1}
            loading={loading && !feeds}
            empty={!feeds?.lowStockAlerts?.length}
          >
            {feeds?.lowStockAlerts.map((row, i) => (
              <FeedRow
                key={row.id}
                delay={i * 0.07}
                title={row.name}
                subtitle={`${row.code} · ${row.currentStock} left (min ${row.threshold})`}
                badge={<StatusBadge label="Low Stock" tone="orange" />}
              />
            ))}
          </FeedCard>
        </div>

        <div className="space-y-4">
          <FeedCard
            title="Recent Portal Bookings"
            href="/admin/transactions/admin-booking"
            accent="gold"
            delay={0.06}
            loading={loading && !feeds}
            empty={!feeds?.recentPortalBookings?.length}
          >
            {feeds?.recentPortalBookings.map((row, i) => (
              <FeedRow
                key={row.id}
                delay={i * 0.07}
                title={row.number}
                subtitle={`${row.customerName} · ${row.serviceName}`}
                amount={formatCurrency(row.amount)}
                badge={
                  <StatusBadge
                    label={row.paymentStatus === "paid" ? "Confirmed" : "Pending"}
                    tone={row.paymentStatus === "paid" ? "brown" : "orange"}
                  />
                }
              />
            ))}
          </FeedCard>

          <FeedCard
            title="Pending Cancellations"
            href="/admin/hall-meal/hall-bookings"
            accent="olive"
            delay={0.14}
            loading={loading && !feeds}
            empty={!feeds?.pendingCancellations?.length}
          >
            {feeds?.pendingCancellations.map((row, i) => (
              <FeedRow
                key={row.id}
                delay={i * 0.07}
                title={row.number}
                subtitle={`${row.customerName} · ${row.reason}`}
                amount={formatCurrency(row.amount)}
                badge={<StatusBadge label={row.status} tone="orange" />}
              />
            ))}
          </FeedCard>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WelcomeTitle({ firstName }: { firstName: string }) {
  const words = ["Welcome", "back,", firstName];
  return (
    <span className="inline">
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 22, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.28 + i * 0.14, ease: EASE_CINEMA }}
          className="mr-[0.28em] inline-block last:mr-0"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

const QUICK_ACTIONS = [
  { label: "Create Item", href: "/admin/masters/items", icon: <PlusIcon /> },
  { label: "Create Service", href: "/admin/masters/services", icon: <GridIcon /> },
  { label: "Create Customer", href: "/admin/customers", icon: <UserIcon /> },
  { label: "Open POS", href: "/pos", icon: <CartIcon /> },
  { label: "View Bookings", href: "/admin/transactions/admin-booking", icon: <CalendarIcon className="h-4 w-4" /> },
  { label: "Add Inventory", href: "/admin/inventory/adjustments", icon: <BoxIcon /> },
  { label: "Order Confirm", href: "/admin/order-confirmation/pos", icon: <ChartIcon className="h-4 w-4" /> },
  { label: "User Management", href: "/admin/users", icon: <ShieldIcon /> },
];

const TONE_BG: Record<string, string> = {
  maroon: "bg-[#f8e8eb] text-maroon",
  orange: "bg-[#fff0e4] text-[#c45c12]",
  gold: "bg-[#f8efd4] text-amber-700",
  olive: "bg-[#eef3e4] text-[#5a6e2b]",
};

const TONE_BORDER: Record<string, string> = {
  maroon: "border-maroon/40 hover:border-maroon/65 shadow-[0_6px_18px_-12px_rgba(124,21,39,0.45)]",
  orange: "border-[#e67e22]/45 hover:border-[#e67e22]/70 shadow-[0_6px_18px_-12px_rgba(230,126,34,0.4)]",
  gold: "border-amber-500/45 hover:border-amber-600/65 shadow-[0_6px_18px_-12px_rgba(166,116,32,0.4)]",
  olive: "border-[#6b8e23]/45 hover:border-[#6b8e23]/70 shadow-[0_6px_18px_-12px_rgba(107,142,35,0.4)]",
};

const FEED_ACCENT: Record<string, string> = {
  maroon: "border-maroon/30 dash-panel--maroon",
  orange: "border-[#e67e22]/35 dash-panel--flame",
  gold: "border-amber-500/35 dash-panel--gold",
  olive: "border-[#6b8e23]/35 dash-panel--olive",
};

function KpiCard({
  label,
  value,
  href,
  tone,
  icon,
}: {
  label: string;
  value: string;
  href: string;
  tone: keyof typeof TONE_BG;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-2xl border-2 bg-white p-3.5 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_16px_32px_-14px_rgba(124,21,39,0.38)] ${TONE_BORDER[tone]}`}
    >
      <span className="dash-card-sheen pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100" />
      <span className="absolute right-2.5 top-2.5 text-ink-500/35 transition group-hover:text-maroon/70">
        <ArrowUpIcon className="h-3.5 w-3.5 rotate-45" />
      </span>
      <div className="relative flex items-start gap-2.5 pr-4">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_BG[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-1 truncate text-[18px] font-bold tabular-nums leading-none text-ink-100">{value}</p>
        </div>
      </div>
    </Link>
  );
}

function KpiSkeleton({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="h-[76px] animate-pulse rounded-2xl border-2 border-maroon/15 bg-white"
    />
  );
}

function TrendBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 16, delay: 0.7 }}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      {up ? "+" : ""}
      {pct}%
    </motion.span>
  );
}

function BarChart({ series }: { series: DayPoint[] }) {
  const max = Math.max(...series.map((s) => s.amount), 1);
  return (
    <div className="flex h-52 items-end gap-2.5 px-1">
      {series.map((d, i) => {
        const h = Math.max(8, (d.amount / max) * 100);
        return (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 + i * 0.08, duration: 0.4, ease: EASE_CINEMA }}
              className="text-[10px] font-semibold tabular-nums text-maroon/80"
            >
              {d.amount > 0 ? formatCurrency(d.amount) : ""}
            </motion.span>
            <div className="relative flex w-full flex-1 items-end justify-center">
              <motion.div
                title={`${d.label}: ${formatCurrency(d.amount)}`}
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{
                  duration: 1.05,
                  delay: 0.2 + i * 0.1,
                  ease: EASE_CINEMA,
                }}
                style={{ height: `${h}%`, transformOrigin: "bottom center" }}
                className="dash-bar relative w-full max-w-[42px] overflow-hidden rounded-t-lg bg-gradient-to-t from-[#5a0f1c] via-maroon to-[#a8283f] shadow-[0_6px_16px_-4px_rgba(124,21,39,0.55)]"
              >
                <span className="dash-bar-shine pointer-events-none absolute inset-0" />
              </motion.div>
            </div>
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.07 }}
              className="text-[11px] font-medium text-ink-500"
            >
              {d.label}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}

function AnimatedTotal({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => formatCurrency(v));
  const [text, setText] = useState(formatCurrency(0));

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.35,
      ease: EASE_CINEMA,
      delay: 0.35,
    });
    const unsub = rounded.on("change", setText);
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, rounded, value]);

  return <span className="text-[16px] font-bold tabular-nums text-ink-100">{text}</span>;
}

function DonutChart({ slices }: { slices: PaymentSlice[] }) {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const arcs = slices.map((slice) => {
    const frac = total > 0 ? slice.amount / total : 0;
    const len = frac * c;
    const arc = { ...slice, dash: len, gap: c - len, offset };
    offset += len;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.55, rotate: -48 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 1.15, ease: EASE_CINEMA }}
        className="relative h-44 w-44"
      >
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f0e4d2" strokeWidth="16" />
          {total === 0 ? (
            <motion.circle
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke="#d4af37"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: c * 0.92 }}
              transition={{ duration: 1.2, ease: EASE_CINEMA }}
            />
          ) : (
            arcs.map((a, i) => (
              <motion.circle
                key={a.mode}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth="16"
                strokeLinecap="round"
                style={{ strokeDashoffset: -a.offset }}
                initial={{ strokeDasharray: `0 ${c}`, opacity: 0 }}
                animate={{ strokeDasharray: `${a.dash} ${a.gap}`, opacity: 1 }}
                transition={{
                  duration: 1.2,
                  delay: 0.28 + i * 0.22,
                  ease: EASE_CINEMA,
                }}
              />
            ))
          )}
          <motion.circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${c * 0.14} ${c * 0.86}`}
            initial={{ strokeDashoffset: c, opacity: 0 }}
            animate={{ strokeDashoffset: -c * 1.05, opacity: [0, 0.85, 0] }}
            transition={{ duration: 1.7, delay: 0.2, ease: "easeInOut" }}
          />
        </svg>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, duration: 0.55, ease: EASE_CINEMA }}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-[11px] uppercase tracking-wide text-ink-500">Total</span>
          <AnimatedTotal value={total} />
        </motion.div>
      </motion.div>
      <ul className="flex w-full max-w-[220px] flex-col gap-2.5">
        {slices.map((s, i) => (
          <motion.li
            key={s.mode}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + i * 0.12, duration: 0.5, ease: EASE_CINEMA }}
            className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-1.5 py-1 text-[13px] transition hover:border-gold-500/25 hover:bg-ivory-50"
          >
            <span className="flex items-center gap-2 text-ink-300">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.65 + i * 0.12, type: "spring", stiffness: 380, damping: 14 }}
                className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
                style={{ background: s.color, boxShadow: `0 0 0 1px ${s.color}` }}
              />
              {s.mode}
            </span>
            <span className="tabular-nums font-semibold text-ink-100">
              {s.percent}% · {formatCurrency(s.amount)}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function FeedCard({
  title,
  href,
  accent = "maroon",
  delay = 0,
  loading,
  empty,
  children,
}: {
  title: string;
  href: string;
  accent?: keyof typeof FEED_ACCENT;
  delay?: number;
  loading?: boolean;
  empty?: boolean;
  children?: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.85, delay, ease: EASE_CINEMA }}
      className={`dash-panel dash-panel-enter rounded-2xl border-2 bg-white p-5 shadow-[0_14px_36px_-16px_rgba(80,40,20,0.32)] ${FEED_ACCENT[accent]}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink-100">{title}</h2>
        <Link href={href} className="text-[12px] font-medium text-maroon hover:underline">
          View all
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-ivory-50" />
          ))}
        </div>
      ) : empty ? (
        <p className="rounded-xl border border-dashed border-gold-500/25 bg-ivory-50 px-3 py-6 text-center text-[13px] text-ink-500">
          Nothing to show yet.
        </p>
      ) : (
        <ul className="divide-y divide-gold-500/10">{children}</ul>
      )}
    </motion.section>
  );
}

function FeedRow({
  title,
  subtitle,
  amount,
  badge,
  delay = 0,
}: {
  title: string;
  subtitle: string;
  amount?: string;
  badge: ReactNode;
  delay?: number;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -14 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.12 + delay, duration: 0.4, ease: EASE_CINEMA }}
      className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-ink-100">{title}</p>
        <p className="truncate text-[12px] text-ink-500">{subtitle}</p>
      </div>
      {amount ? (
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-100">{amount}</span>
      ) : null}
      <div className="shrink-0">{badge}</div>
    </motion.li>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "orange" | "brown";
}) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
      : tone === "brown"
        ? "bg-[#f3ebe3] text-[#7a4f2a] border-[#e2d2c2]"
        : "bg-[#fff4e8] text-[#c45c12] border-[#f0d4b4]";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}
