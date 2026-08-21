"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MODULES, usePermissions } from "../../lib/permissions";
import {
  BoxIcon,
  CartIcon,
  ChartIcon,
  ChevronIcon,
  GridIcon,
  HomeIcon,
  ShieldIcon,
} from "../divine/icons";

type NavLeaf = {
  label: string;
  to: string;
  /** Module whose `view` grant this screen needs. Omitted = any admin. */
  module?: string;
};

type NavItem = {
  label: string;
  icon: ReactNode;
  to?: string;
  soon?: string;
  module?: string;
  children?: NavLeaf[];
};

// Everything without a `to` or `children` is a preview of the shape to come,
// not a dead end — each names the Build Sequence day (§13) that brings it to
// life, so the shell stays honest about what's real today.
//
// Paths are rooted at /admin — this sidebar only ever renders inside the
// admin section (see app/admin/(dashboard)/layout.tsx).
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: <HomeIcon />, to: "/admin/dashboard" },
  {
    label: "Administration",
    icon: <ShieldIcon />,
    children: [
      { label: "Admin Users", to: "/admin/users", module: MODULES.users },
      { label: "Customers", to: "/admin/customers", module: MODULES.customers },
      { label: "Roles", to: "/admin/roles", module: MODULES.roles },
      { label: "Permissions", to: "/admin/permissions", module: MODULES.roles },
    ],
  },
  {
    label: "Masters",
    icon: <GridIcon />,
    children: [
      { label: "Printing Group", to: "/admin/masters/printing-groups", module: MODULES.printingGroups },
      { label: "Deity", to: "/admin/masters/deities", module: MODULES.deities },
      { label: "GST", to: "/admin/masters/gst", module: MODULES.gst },
      { label: "GL Group", to: "/admin/masters/gl-groups", module: MODULES.glGroups },
      { label: "General Ledger (GL)", to: "/admin/masters/general-ledgers", module: MODULES.generalLedgers },
      { label: "Category", to: "/admin/masters/categories", module: MODULES.categories },
      { label: "Sub Category", to: "/admin/masters/sub-categories", module: MODULES.subCategories },
      { label: "Item", to: "/admin/masters/items", module: MODULES.items },
      { label: "Service", to: "/admin/masters/services", module: MODULES.services },
      { label: "Event", to: "/admin/masters/events", module: MODULES.events },
      { label: "Nakshathiram", to: "/admin/masters/nakshathirams", module: MODULES.nakshathirams },
      { label: "Payment Mode", to: "/admin/masters/payment-modes", module: MODULES.paymentModes },
    ],
  },
  { label: "POS Transactions", icon: <CartIcon /> },
  { label: "Inventory", icon: <BoxIcon /> },
  { label: "Reports", icon: <ChartIcon /> },
];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

// The selected-item treatment, shared by the top-level leaf, the group
// header, and its nested children — a slim left accent bar plus a soft
// gold tint, not a filled badge. Every nav row carries a transparent
// border-l-[3px] (see the base classes below) so toggling active/inactive
// never shifts text by the border's width.
const ACTIVE_NAV_CLASS = "border-amber-600 bg-gold-500/30 text-amber-800 font-semibold";
const INACTIVE_NAV_CLASS = "border-transparent text-ink-300 hover:bg-ivory-100 hover:text-ink-100";

/**
 * Static column on desktop; a slide-in drawer with a backdrop below `md`.
 *
 * Groups are filtered by permission from the leaves upward: a child appears
 * only if the account can view its module, and a group disappears entirely
 * once none of its children survive. Rendering an empty "Administration"
 * heading would be worse than rendering nothing — it implies access that
 * clicking cannot reach.
 *
 * `collapsed` is desktop-only — the mobile drawer always opens at full
 * width, so there's nothing to collapse there. The wordmark lockup
 * (SSD_Full_Logo.png) only fits a full-width column; the mobile drawer and
 * the collapsed rail both fall back to the mark alone (SSD_Logo.png).
 */
export default function Sidebar({ open, onClose }: SidebarProps) {
  const { can } = usePermissions();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = NAV_ITEMS.map((item) => {
    if (!item.children) return item;
    return {
      ...item,
      children: item.children.filter((c) => !c.module || can(c.module, "view")),
    };
  }).filter((item) =>
    item.children
      ? item.children.length > 0
      : !item.module || can(item.module, "view"),
  );

  // Clicking a collapsed group needs somewhere for its children to appear —
  // expand the rail back out rather than trying to flyout a menu with no
  // icons to show (NavLeaf children don't carry their own icon).
  const expandForGroup = () => setCollapsed(false);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-30 cursor-default bg-navy-950/70 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* md:z-30 (not md:z-auto) is load-bearing: the collapse-toggle button
          below deliberately overlaps into the topbar's rectangle, and this
          element always has a transform applied (the translate-x-* below),
          which makes it a stacking context — so the button's own z-index
          can't out-rank the topbar on its own. The aside itself has to
          out-rank the topbar's `relative z-20` for that overlapping half to
          render on top instead of hiding underneath it. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-64 shrink-0 flex-col border-r border-gold-500/15 bg-navy-900 shadow-[6px_0_24px_-6px_rgba(0,0,0,0.08)] transition-[width,transform] duration-300 ease-out md:relative md:z-30 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-20" : ""}`}
      >
        <div className={`flex items-center px-4 py-6 ${collapsed ? "md:justify-center md:px-2" : "justify-center"}`}>
          {collapsed ? (
            <img src="/SSD_Logo.png" alt="Sri Siva Durga Temple" className="hidden h-11 w-11 object-contain drop-shadow-[0_0_10px_rgba(212,175,55,0.35)] md:block" />
          ) : null}
          {/* Mobile drawer always shows the mark alone, regardless of the
              desktop `collapsed` state (which mobile never sets). */}
          <img
            src="/SSD_Logo.png"
            alt="Sri Siva Durga Temple"
            className={`h-11 w-11 object-contain drop-shadow-[0_0_10px_rgba(212,175,55,0.35)] md:hidden`}
          />
          {!collapsed && (
            <img
              src="/SSD_Full_Logo.png"
              alt="Sri Siva Durga Temple"
              className="hidden h-auto w-full max-w-[188px] object-contain drop-shadow-[0_0_10px_rgba(212,175,55,0.25)] md:block"
            />
          )}
        </div>

        {/* Collapse toggle — desktop only, the mobile drawer has the topbar's
            hamburger for open/close instead. Sits right on the seam where
            the sidebar's right edge meets the topbar (vertically centered
            on the topbar's own h-16), straddling both. It clears the logo
            safely: the logo is horizontally centered with padding, so it
            never reaches this far-right edge regardless of which header
            variant (mark alone vs. full wordmark) is showing.
            -right-3.5 centers the 28px (h-7 w-7) button exactly on the
            boundary line.

            The button's own z-30 isn't what keeps it visible — `<aside>`
            always carries a `translate-x-*` class (open/-translate-x-full),
            and any non-`none` transform creates a new stacking context. That
            traps every z-index inside the sidebar's subtree, so the aside as
            a WHOLE competes against the topbar using its own top-level
            z-index — which was `md:z-auto` (participates in plain DOM order,
            effectively z-0), losing to the topbar's `relative z-20` and
            hiding the overlapping half of this button underneath it
            regardless of its internal z-30. Fixed by giving <aside> itself
            `md:z-30` — see that class for the full explanation. */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3.5 top-[18px] z-30 hidden h-7 w-7 items-center justify-center rounded-full border border-gold-600/50 bg-gradient-to-b from-gold-300 to-gold-600 text-navy-950 transition-[transform,box-shadow] duration-200 hover:scale-110 hover:shadow-[0_0_14px_2px_rgba(212,175,55,0.8)] md:flex"
        >
          <ChevronIcon className={`h-3.5 w-3.5 transition-transform duration-300 ${collapsed ? "-rotate-90" : "rotate-90"}`} />
        </button>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {navItems.map((item) => {
            if (item.children) {
              return (
                <NavGroup
                  key={item.label}
                  item={item}
                  onNavigate={onClose}
                  collapsed={collapsed}
                  onExpandSidebar={expandForGroup}
                />
              );
            }
            if (item.to) {
              return (
                <NavLeafLink
                  key={item.label}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  onNavigate={onClose}
                  collapsed={collapsed}
                />
              );
            }
            return (
              <div
                key={item.label}
                className={`flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-ink-500/60 ${collapsed ? "md:justify-center" : ""}`}
                title={item.soon ? `Arrives ${item.soon} of the Build Sequence` : "Not built yet"}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className={`flex-1 ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
                {item.soon && (
                  <span className={`rounded-full border border-gold-500/20 px-2 py-0.5 text-[10px] tracking-wide text-ink-500 ${collapsed ? "md:hidden" : ""}`}>
                    {item.soon}
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-gold-500/10 px-5 py-4 text-[11px] text-ink-500 ${collapsed ? "md:hidden" : ""}`}>
          Sri Siva Durga Temple &copy; {new Date().getFullYear()}
        </div>
      </aside>
    </>
  );
}

function NavLeafLink({
  to,
  icon,
  label,
  onNavigate,
  collapsed,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === to;

  return (
    <Link
      href={to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-xl border-l-[3px] py-2.5 pl-[9px] pr-3 text-[13.5px] transition-colors ${collapsed ? "md:justify-center" : ""} ${
        isActive ? ACTIVE_NAV_CLASS : INACTIVE_NAV_CLASS
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className={collapsed ? "md:hidden" : ""}>{label}</span>
    </Link>
  );
}

function NavGroup({
  item,
  onNavigate,
  collapsed,
  onExpandSidebar,
}: {
  item: NavItem;
  onNavigate: () => void;
  collapsed: boolean;
  onExpandSidebar: () => void;
}) {
  const pathname = usePathname();
  const holdsCurrentRoute = (item.children ?? []).some(
    (c) => c.to === pathname,
  );
  const [expanded, setExpanded] = useState(holdsCurrentRoute);

  // Landing on a child by any route — a deep link, the Roles page's
  // "Permissions" shortcut — should reveal where you are in the tree.
  useEffect(() => {
    if (holdsCurrentRoute) setExpanded(true);
  }, [holdsCurrentRoute]);

  function handleClick() {
    if (collapsed) {
      // Nothing to toggle open in a rail with no room for children —
      // expand the sidebar itself instead, pre-opened to this group.
      onExpandSidebar();
      setExpanded(true);
      return;
    }
    setExpanded((v) => !v);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={expanded}
        title={collapsed ? item.label : undefined}
        className={`flex w-full items-center gap-3 rounded-xl border-l-[3px] py-2.5 pl-[9px] pr-3 text-[13.5px] transition-colors ${collapsed ? "md:justify-center" : ""} ${
          holdsCurrentRoute && !expanded ? ACTIVE_NAV_CLASS : INACTIVE_NAV_CLASS
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
        <span className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
        <ChevronIcon
          className={`shrink-0 transition-transform duration-200 ${collapsed ? "md:hidden" : ""} ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && !collapsed && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {/* The rail gives the children a visible spine to hang from, so
                the nesting reads at a glance rather than from indent alone. */}
            <div className="ml-[22px] mt-1 space-y-0.5 border-l border-gold-500/15 pl-3">
              {(item.children ?? []).map((child) => (
                <ChildLink key={child.to} to={child.to} label={child.label} onNavigate={onNavigate} />
              ))}
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChildLink({ to, label, onNavigate }: { to: string; label: string; onNavigate: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === to;

  return (
    <li>
      <Link
        href={to}
        onClick={onNavigate}
        className={`relative block rounded-lg border-l-[3px] py-2 pl-[9px] pr-3 text-[13px] transition-colors ${
          isActive ? ACTIVE_NAV_CLASS : INACTIVE_NAV_CLASS
        }`}
      >
        {label}
      </Link>
    </li>
  );
}
