import type { ReactNode } from "react";
import PortalHeader from "../../../components/portal/PortalHeader";
import PortalFooter from "../../../components/portal/PortalFooter";
import PortalMotion from "../../../components/portal/PortalMotion";
import { EMPTY_FOOTER, EMPTY_SITE, getPortalLayout } from "../../../lib/portalApi";

/**
 * Chrome for every public portal page (home, CMS content pages): header menu,
 * top-bar details and footer all come from the CMS. The login/register screen
 * lives outside this group on purpose — it has its own full-screen layout.
 *
 * If the API can't be reached the pages still render, just without menus,
 * rather than the whole portal failing on a navigation fetch.
 */
export default async function PortalSiteLayout({ children }: { children: ReactNode }) {
  const result = await getPortalLayout();
  const layout = result.status === "ok" ? result.data : { header: [], footer: [], site: EMPTY_SITE, footerInfo: EMPTY_FOOTER };

  return (
    <PortalMotion>
      <div className="flex min-h-screen flex-col bg-ivory-50 font-body">
        <PortalHeader menus={layout.header} site={layout.site} />
        <main className="flex-1">{children}</main>
        <PortalFooter menus={layout.footer} site={layout.site} info={layout.footerInfo} />
      </div>
    </PortalMotion>
  );
}
