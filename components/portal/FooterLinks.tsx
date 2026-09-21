"use client";

import type { MenuNode } from "../../lib/portalApi";
import MenuAnchor from "./MenuAnchor";

/** The footer's link column — a client component only because Login Required depends on who is signed in. */
export default function FooterLinks({ links }: { links: MenuNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5 text-[13.5px]">
      {links.map((l) => (
        <li key={l.id}>
          <MenuAnchor node={l} className="transition hover:text-white hover:underline">
            {l.name}
          </MenuAnchor>
        </li>
      ))}
    </ul>
  );
}
