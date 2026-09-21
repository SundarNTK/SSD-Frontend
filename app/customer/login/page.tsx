import type { Metadata } from "next";
import CustomerAuthPage from "../../../components/portal/CustomerAuthPage";
import { getPortalLayout } from "../../../lib/portalApi";

export const metadata: Metadata = {
  title: "Sign in | Sri Siva Durga Temple",
  description: "Sign in or create a devotee account to book poojas and services at Sri Siva Durga Temple.",
  robots: { index: false },
};

type Props = { searchParams: Promise<{ tab?: string; next?: string }> };

/** /customer/login (Login tab) and /customer/login?tab=register (Register tab) — one page, two tabs. */
export default async function CustomerLoginPage({ searchParams }: Props) {
  const { tab, next } = await searchParams;
  // The logo is managed in the CMS (Site Details); fall back quietly if the API is unreachable.
  const layout = await getPortalLayout();
  const logo = layout.status === "ok" ? layout.data.site.logo : "";
  return <CustomerAuthPage initialTab={tab === "register" ? "register" : "login"} next={next} logo={logo} />;
}
