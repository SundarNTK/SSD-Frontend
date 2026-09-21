import type { Metadata } from "next";
import PortalPageView from "../../../../../components/portal/PortalPageView";
import { getPortalPage } from "../../../../../lib/portalApi";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPortalPage(slug);
  if (result.status !== "ok") return { title: "Sri Siva Durga Temple" };
  return { title: `${result.data.metaTitle} | Sri Siva Durga Temple`, description: result.data.metaDescription };
}

/** Any CMS page, by slug — /customer/pages/about-the-temple, /customer/pages/privacy-policy, ... */
export default async function CustomerContentPage({ params }: Props) {
  const { slug } = await params;
  return <PortalPageView result={await getPortalPage(slug)} />;
}
