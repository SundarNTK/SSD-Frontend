"use client";

import { loginUrl, type MenuNode } from "./portalApi";
import { useAuthStore } from "./authStore";
import { USER_TYPES } from "./userTypes";
import { useIsClient } from "./useIsClient";

export type ResolvedMenuLink = {
  /** Where the link actually goes — the sign-in page (returning here afterwards) when the entry needs a login the visitor lacks. */
  href: string;
  /** True when a visitor who isn't signed in is being sent to sign in first. */
  gated: boolean;
  /** Stays inside the portal (next/link) rather than leaving for another site. */
  isSite: boolean;
  /** The menu's "Open in New Tab" setting. */
  newTab: boolean;
};

/**
 * One place that decides what a CMS menu entry does when clicked, so the header,
 * the mobile menu and the footer can never disagree.
 *
 *  - Login Required: the entry stays visible (with a lock), and a visitor who
 *    isn't signed in is taken to sign in first, then returned to it. Only
 *    portal paths can be gated — the portal can't protect another website, and
 *    the CMS form refuses that combination.
 *  - Open in New Tab: passed through as-is.
 */
export function useMenuLink(): (node: MenuNode) => ResolvedMenuLink {
  const user = useAuthStore((s) => s.user);
  // The session lives in localStorage, so it is only known after hydration; until then a
  // gated link points at sign-in, which is also right for the server-rendered HTML.
  const isClient = useIsClient();
  const signedIn = isClient && user?.userType === USER_TYPES.CUSTOMER;

  return (node) => {
    const target = node.href ?? "#";
    const isSite = target.startsWith("/");
    const gated = node.loginRequired && !signedIn && isSite;
    return { href: gated ? loginUrl(target) : target, gated, isSite, newTab: node.openInNewTab };
  };
}
