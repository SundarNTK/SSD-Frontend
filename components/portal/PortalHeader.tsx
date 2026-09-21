"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useAuthStore } from "../../lib/authStore";
import { USER_TYPES } from "../../lib/userTypes";
import { useIsClient } from "../../lib/useIsClient";
import { DEFAULT_LOGO, type MenuNode, type SiteInfo } from "../../lib/portalApi";
import { ChevronDownIcon, ClockIcon, CloseIcon, MailIcon, MenuIcon, PhoneIcon, UserIcon } from "./PortalIcons";

/** A menu entry's anchor — site paths use next/link, anything else opens as a plain (optionally new-tab) link. */
function NavLink({
  node,
  className,
  onNavigate,
  children,
}: {
  node: MenuNode;
  className: string;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  const href = node.href ?? "#";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className} onClick={onNavigate} target={node.openInNewTab ? "_blank" : undefined}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} onClick={onNavigate} target={node.openInNewTab ? "_blank" : undefined} rel="noopener noreferrer">
      {children}
    </a>
  );
}

const pathOf = (href: string | null) => (href ?? "").split("#")[0].split("?")[0];

export default function PortalHeader({ menus, site }: { menus: MenuNode[]; site: SiteInfo }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const isClient = useIsClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  const customer = isClient && user?.userType === USER_TYPES.CUSTOMER ? user : null;
  // "Login required" entries only appear once a devotee is signed in.
  const visible = menus.filter((m) => !m.loginRequired || customer);

  const isActive = (node: MenuNode) => {
    const own = pathOf(node.href);
    // A pure in-page anchor ("/customer#services") shares its path with Home — don't light both up.
    if (node.href?.includes("#")) return false;
    return own !== "" && own === pathname;
  };

  function signOut() {
    clearSession();
    setMobileOpen(false);
    router.refresh();
  }

  const authActions = customer ? (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-2 rounded-full border border-maroon/15 bg-maroon/5 py-1 pl-1.5 pr-3 text-[13px] font-medium text-maroon lg:inline-flex">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-maroon text-[11px] font-bold text-white">
          {customer.name.trim().charAt(0).toUpperCase()}
        </span>
        {customer.name.split(" ")[0]}
      </span>
      <button
        onClick={signOut}
        className="rounded-md border border-maroon/25 px-3.5 py-1.5 text-[13px] font-semibold text-maroon transition hover:bg-maroon hover:text-white"
      >
        Sign out
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/customer/login" className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-maroon transition hover:bg-maroon/8">
        Login
      </Link>
      <Link
        href="/customer/login?tab=register"
        className="rounded-md bg-maroon px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(124,21,39,0.7)] transition hover:-translate-y-0.5 hover:bg-maroon-hover"
      >
        Register
      </Link>
    </div>
  );

  // A fragment, not a <header> wrapper: the nav bar below is `sticky`, and a
  // sticky element only stays stuck within its parent — the page layout must be that parent.
  return (
    <>
      {/* Top bar — site details come from the Home page's Contact section in the CMS. */}
      <div className="bg-[#5b1020] text-[12px] text-[#f7e7c4]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {site.phone && (
              <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <PhoneIcon className="h-3.5 w-3.5" /> {site.phone}
              </a>
            )}
            {site.email && (
              <a href={`mailto:${site.email}`} className="hidden items-center gap-1.5 hover:text-white sm:inline-flex">
                <MailIcon className="h-3.5 w-3.5" /> {site.email}
              </a>
            )}
          </div>
          {site.hours && (
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <ClockIcon className="h-3.5 w-3.5" /> {site.hours}
            </span>
          )}
        </div>
      </div>

      <header className={`sticky top-0 z-40 border-b bg-white/95 backdrop-blur transition-shadow duration-300 ${scrolled ? "border-gold-500/30 shadow-[0_10px_30px_-16px_rgba(58,20,8,0.45)]" : "border-gold-500/20"}`}>
        <div className={`mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 transition-[padding] duration-300 ${scrolled ? "py-1.5" : "py-2.5"}`}>
          <Link href="/customer" aria-label="Sri Siva Durga Temple — home" className="flex items-center">
            {/* Uploaded in CMS Pages -> Home -> Site Details; the built-in full logo (the one the Admin Panel sidebar uses) until then. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.logo || DEFAULT_LOGO} alt="Sri Siva Durga Temple" className={`w-auto object-contain transition-all duration-300 ${scrolled ? "h-11" : "h-14"}`} />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {visible.map((node) =>
              node.children.length ? (
                <div
                  key={node.id}
                  className="relative"
                  onMouseEnter={() => setOpenId(node.id)}
                  onMouseLeave={() => setOpenId(null)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setOpenId(null);
                  }}
                >
                  <button
                    onClick={() => setOpenId(openId === node.id ? null : node.id)}
                    aria-expanded={openId === node.id}
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-[14px] font-medium transition hover:bg-maroon/8 hover:text-maroon ${
                      isActive(node) ? "text-maroon" : "text-ink-300"
                    }`}
                  >
                    {node.name}
                    <ChevronDownIcon className={`h-3.5 w-3.5 transition ${openId === node.id ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {openId === node.id && (
                      <motion.ul
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16 }}
                        className="absolute left-0 top-full min-w-[220px] overflow-hidden rounded-xl border border-gold-500/25 bg-white py-1.5 shadow-[0_18px_40px_-16px_rgba(58,20,8,0.4)]"
                      >
                        {node.children.map((child) => (
                          <li key={child.id}>
                            <NavLink
                              node={child}
                              onNavigate={() => setOpenId(null)}
                              className="block px-4 py-2.5 text-[13.5px] text-ink-300 transition hover:bg-ivory-50 hover:text-maroon"
                            >
                              {child.name}
                            </NavLink>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <NavLink
                  key={node.id}
                  node={node}
                  className={`rounded-md px-3 py-2 text-[14px] font-medium transition hover:bg-maroon/8 hover:text-maroon ${
                    isActive(node) ? "text-maroon" : "text-ink-300"
                  }`}
                >
                  {node.name}
                </NavLink>
              )
            )}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">{authActions}</div>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-maroon/20 text-maroon lg:hidden"
            >
              {mobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden border-t border-gold-500/20 bg-white lg:hidden"
              aria-label="Mobile"
            >
              <ul className="mx-auto max-w-6xl space-y-0.5 px-4 py-3">
                {visible.map((node) => (
                  <li key={node.id}>
                    <NavLink
                      node={node}
                      onNavigate={() => setMobileOpen(false)}
                      className={`block rounded-md px-3 py-2.5 text-[15px] font-medium ${isActive(node) ? "bg-maroon/8 text-maroon" : "text-ink-300"}`}
                    >
                      {node.name}
                    </NavLink>
                    {node.children.length > 0 && (
                      <ul className="ml-3 border-l border-gold-500/30 pl-2">
                        {node.children.map((child) => (
                          <li key={child.id}>
                            <NavLink node={child} onNavigate={() => setMobileOpen(false)} className="block rounded-md px-3 py-2 text-[14px] text-ink-500">
                              {child.name}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 border-t border-gold-500/20 px-4 py-3 sm:hidden">
                <UserIcon className="h-4 w-4 text-maroon" />
                {authActions}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
