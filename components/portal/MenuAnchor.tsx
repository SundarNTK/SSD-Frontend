"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { MenuNode } from "../../lib/portalApi";
import { useMenuLink } from "../../lib/useMenuLink";
import { LockIcon } from "./PortalIcons";

/**
 * A CMS menu entry as a link — used by the header, the mobile menu and the
 * footer, so "Open in New Tab" and "Login Required" mean the same thing
 * everywhere (see useMenuLink). A padlock marks an entry that will ask a
 * signed-out visitor to sign in first.
 */
export default function MenuAnchor({
  node,
  className,
  onNavigate,
  children,
}: {
  node: MenuNode;
  className: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const { href, gated, isSite, newTab } = useMenuLink()(node);
  const content = (
    <>
      {children}
      {gated && <LockIcon className="ml-1.5 inline h-3.5 w-3.5 -translate-y-px opacity-70" />}
    </>
  );
  const title = gated ? "Sign in to open this page" : undefined;

  if (isSite) {
    return (
      <Link href={href} className={className} onClick={onNavigate} title={title} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={className} onClick={onNavigate} title={title} target={newTab ? "_blank" : undefined} rel="noopener noreferrer">
      {content}
    </a>
  );
}
