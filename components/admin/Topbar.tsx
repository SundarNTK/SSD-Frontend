"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore, endSession } from "../../lib/authStore";
import { LogoutIcon } from "../divine/icons";
import TempleClock from "./TempleClock";
import { USER_TYPE_LABEL } from "../../lib/userTypes";


function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

type TopbarProps = {
  onMenuClick: () => void;
};

export default function Topbar({ onMenuClick }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Closes the menu on an outside click or Escape.
   *
   * This used to be a `fixed inset-0` button behind the panel, which never
   * worked: this header sets `backdrop-blur`, and an element with a
   * backdrop-filter becomes the containing block for its fixed-position
   * descendants — so "cover the viewport" actually covered the 64px header
   * and nothing else. A document listener has no such trap.
   */
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function handleSignOut() {
    setMenuOpen(false);
    // Clears storage and hard-loads /login — see endSession() for why this
    // isn't a client-side navigate.
    endSession("signed-out");
  }

  /**
   * `relative z-20` on the header below is load-bearing, not cosmetic.
   *
   * `backdrop-blur` makes the header a stacking context, so the account
   * menu's z-index only ranks it *within* the header. `<main>` is a later
   * sibling with `position: relative`, which paints above a z-auto header —
   * and because main has no background of its own, the menu stayed visible
   * while main silently swallowed every click on it. Lifting the header
   * above main is what makes the menu clickable at all.
   *
   * Kept below the mobile sidebar (z-30/40) and the drawers and dialogs
   * (z-40+) so those still cover the header when open.
   */
  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gold-400/45 bg-gradient-to-r from-[#5a0f1c] via-maroon to-[#8f1c30] px-4 shadow-[0_10px_28px_-10px_rgba(124,21,39,0.55)] print:hidden sm:px-6">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent"
      />
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gold-200 transition-colors hover:bg-white/10 hover:text-white md:hidden"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        {/* Hidden on the narrowest screens so the clock isn't squeezed — the
            sidebar drawer carries the same branding there. */}
        <p className="hidden truncate font-accent text-[13px] tracking-[0.12em] text-gold-200 sm:block">
          Sri Siva Durga Temple
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <TempleClock />

        <span aria-hidden="true" className="hidden h-7 w-px bg-gold-300/35 sm:block" />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-white/10 sm:pr-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4a0c16] text-[12px] font-semibold text-gold-200 ring-2 ring-gold-400/70">
              {user ? initials(user.name) : "?"}
            </span>
            <span className="hidden text-left lg:block">
              <span className="block max-w-[140px] truncate text-[13px] leading-tight font-medium text-white">
                {user?.name ?? "Unknown"}
              </span>
              <span className="block text-[11px] leading-tight text-gold-300">
                {user ? USER_TYPE_LABEL[user.userType] ?? user.userType : ""}
              </span>
            </span>
          </button>

          <AnimatePresence>
            {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-20 w-52 overflow-hidden rounded-xl border border-gold-400/40 bg-[#fffaf0] shadow-[0_20px_50px_-15px_rgba(124,21,39,0.45)]"
                >
                  {/* Repeated here because the trigger only shows the name at
                      lg and up — the clock takes that room back below it. */}
                  <div className="border-b border-maroon/10 px-4 py-3 lg:hidden">
                    <p className="truncate text-[13px] leading-tight text-ink-100">{user?.name ?? "Unknown"}</p>
                    <p className="text-[11px] leading-tight text-maroon">
                      {user ? USER_TYPE_LABEL[user.userType] ?? user.userType : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] text-ink-100 transition-colors hover:bg-maroon/10 hover:text-maroon"
                  >
                    <LogoutIcon /> Sign out
                  </button>
                </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
