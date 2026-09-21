import type { Metadata } from "next";
import PortalPageView from "../../../components/portal/PortalPageView";
import { getPortalPage } from "../../../lib/portalApi";

// Content is edited in the CMS at any time — always render from live data.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPortalPage("home");
  if (result.status !== "ok") return { title: "Sri Siva Durga Temple" };
  return { title: result.data.metaTitle, description: result.data.metaDescription };
}

/** The portal's front page — the CMS page whose slug is "home". */
export default async function CustomerHomePage() {
  return <PortalPageView result={await getPortalPage("home")} />;
}
