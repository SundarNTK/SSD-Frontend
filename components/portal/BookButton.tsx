"use client";

import Link from "next/link";
import { useAuthStore } from "../../lib/authStore";
import { USER_TYPES } from "../../lib/userTypes";
import { loginUrl } from "../../lib/portalApi";
import { useIsClient } from "../../lib/useIsClient";
import { PlusIcon } from "./PortalIcons";

/**
 * "Book" / "+" on a service or offering card. The FSD requires a registered,
 * signed-in devotee before any booking, so a visitor is sent to sign in and
 * brought back here. Online checkout itself isn't built yet, so a signed-in
 * devotee sees a disabled "Coming soon" instead of a button that does nothing.
 */
export default function BookButton({ compact = false, onDark = false, returnTo = "/customer" }: { compact?: boolean; onDark?: boolean; returnTo?: string }) {
  const user = useAuthStore((s) => s.user);
  // The store hydrates from localStorage on the client only — wait for it so
  // the server-rendered markup and the first client render agree.
  const isClient = useIsClient();

  const isCustomer = isClient && user?.userType === USER_TYPES.CUSTOMER;

  if (isCustomer) {
    return (
      <span
        title="Online booking opens soon"
        className={`inline-flex cursor-not-allowed items-center gap-1 rounded-md border font-semibold ${
          onDark ? "border-white/30 bg-white/15 text-white/80" : "border-maroon/20 bg-maroon/10 text-maroon/70"
        } ${
          compact ? "h-7 w-7 justify-center" : "px-3.5 py-1.5 text-[12.5px]"
        }`}
      >
        {compact ? <PlusIcon className="h-3.5 w-3.5" /> : "Coming soon"}
      </span>
    );
  }

  return (
    <Link
      href={loginUrl(returnTo)}
      aria-label="Sign in to book"
      className={`inline-flex items-center gap-1 rounded-md font-semibold transition ${
        compact
          ? "h-7 w-7 justify-center border border-maroon/25 text-maroon hover:bg-maroon hover:text-white"
          : onDark
            ? "bg-white px-4 py-2 text-[13px] text-maroon shadow-[0_8px_18px_-8px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:bg-gold-100"
            : "bg-maroon px-3.5 py-1.5 text-[12.5px] text-white shadow-[0_4px_10px_-4px_rgba(124,21,39,0.6)] hover:-translate-y-0.5 hover:bg-maroon-hover"
      }`}
    >
      <PlusIcon className="h-3.5 w-3.5" />
      {!compact && "Book"}
    </Link>
  );
}
