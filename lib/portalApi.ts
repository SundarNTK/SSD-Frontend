/**
 * Server-side data access for the Customer Portal. Everything here calls the
 * backend's public, unauthenticated /public/cms/* endpoints (see
 * SSD-Backend controllers/public-portal) — the portal's header, footer, home
 * page and content pages are all CMS-driven.
 *
 * Used from Server Components only, so it uses plain `fetch` rather than the
 * axios clients in ./api (those read localStorage for a token).
 */

export type MenuNode = {
  id: string;
  name: string;
  tamilName: string;
  href: string | null;
  openInNewTab: boolean;
  loginRequired: boolean;
  children: MenuNode[];
};

export type SiteInfo = {
  /** Uploaded logo URL (or a site path); empty falls back to the built-in logo. */
  logo: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  hours: string;
  facebook: string;
  instagram: string;
  youtube: string;
};

/** The footer's own wording, managed on the CMS "Site Footer" page (blanks already defaulted by the API). */
export type FooterInfo = {
  about: string;
  linksTitle: string;
  hoursTitle: string;
  hours: { days: string; time: string }[];
  hoursNote: string;
  /** May contain {year}, replaced with the current year when rendered. */
  copyright: string;
};

export type PortalLayoutData = { header: MenuNode[]; footer: MenuNode[]; site: SiteInfo; footerInfo: FooterInfo };

export type SectionItem = { image?: string; label: string; heading: string; text: string; link: string };

/** One image of the home-page slider, uploaded in the CMS (Home -> Banner section). `link` is optional. */
export type BannerSlide = { image: string; alt: string; link: string };

/** A record the portal fills into a section from its master — an Event, Service or Item. */
export type PortalRecord = {
  id: string;
  name: string;
  tamilName: string;
  description: string;
  price: number;
  image: string | null;
  /** Events only (ISO dates, midnight UTC). */
  startDate?: string;
  endDate?: string;
};

export type SectionType = "Banner" | "Events" | "Services" | "Items" | "SiteDetails";

export type PortalSection = {
  type: SectionType;
  eyebrow: string;
  title: string;
  subtitle: string;
  content: string;
  image: string;
  primaryLabel: string;
  primaryLink: string;
  secondaryLabel: string;
  secondaryLink: string;
  limit: number;
  items: SectionItem[];
  /** Banner sections only. */
  slides?: BannerSlide[];
  records?: PortalRecord[];
};

export type PortalPageData = {
  slug: string;
  title: string;
  tamilTitle: string;
  summary: string;
  content: string;
  tamilContent: string;
  bannerImage: string;
  metaTitle: string;
  metaDescription: string;
  sections: PortalSection[];
};

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5004/api/v1";

/** "ok" with data, "not-found" for a 404, or "unavailable" when the API can't be reached / errored. */
export type PortalResult<T> = { status: "ok"; data: T } | { status: "not-found" } | { status: "unavailable" };

async function get<T>(path: string): Promise<PortalResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) return { status: "unavailable" };
    const json = (await res.json()) as { data: T };
    return { status: "ok", data: json.data };
  } catch {
    return { status: "unavailable" };
  }
}

export const getPortalLayout = () => get<PortalLayoutData>("/public/cms/layout");

export const getPortalPage = (slug: string) =>
  get<PortalPageData>(slug === "home" ? "/public/cms/home" : `/public/cms/pages/${encodeURIComponent(slug)}`);

export const EMPTY_FOOTER: FooterInfo = {
  about: "",
  linksTitle: "Quick Links",
  hoursTitle: "Working Hours",
  hours: [],
  hoursNote: "",
  copyright: "© {year} Sri Siva Durga Temple. All rights reserved.",
};

export const EMPTY_SITE: SiteInfo = { logo: "", tagline: "", address: "", phone: "", email: "", hours: "", facebook: "", instagram: "", youtube: "" };

/** The logo shown when the CMS has none uploaded. */
export const DEFAULT_LOGO = "/SSD_Full_Logo-Transparant.webp";

/** Where a "Book" button sends a visitor who isn't signed in — and where they land after signing in. */
export const loginUrl = (next = "/customer") => `/customer/login?next=${encodeURIComponent(next)}`;
