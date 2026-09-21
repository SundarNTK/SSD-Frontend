import { notFound } from "next/navigation";
import type { PortalPageData, PortalResult } from "../../lib/portalApi";
import PortalSections from "./PortalSections";
import Reveal from "./Reveal";

/** Shown when the API can't be reached — distinct from a real 404. */
export function PortalUnavailable() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="font-portal text-[34px] font-bold text-maroon">We&apos;ll be right back</h1>
      <p className="mt-3 text-[14.5px] text-ink-500">
        This page couldn&apos;t be loaded just now. Please try again in a moment.
      </p>
    </div>
  );
}

/**
 * One CMS page: an optional title banner + HTML body for ordinary content
 * pages, followed by any sections. The home page has sections only, so its
 * banner is skipped (its Hero section is the banner).
 */
export default function PortalPageView({ result }: { result: PortalResult<PortalPageData> }) {
  if (result.status === "not-found") notFound();
  if (result.status === "unavailable") return <PortalUnavailable />;

  const page = result.data;
  const isHome = page.slug === "home";
  const hasBody = Boolean(page.content || page.tamilContent);

  return (
    <>
      {!isHome && (
        <section className="relative isolate overflow-hidden bg-gradient-to-br from-[#7c1527] to-[#4a0d1a] text-white">
          {page.bannerImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.bannerImage} alt="" className="animate-portal-kenburns absolute inset-0 -z-10 h-full w-full object-cover opacity-50" />
          )}
          <div className="animate-portal-glow absolute -right-16 -top-16 -z-10 h-64 w-64 rounded-full bg-gold-500/25 blur-3xl" aria-hidden="true" />
          <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:py-16">
            <Reveal>
              <h1 className="font-portal text-[40px] font-bold leading-tight sm:text-[52px]">{page.title}</h1>
              {page.tamilTitle && <p className="mt-1 text-[16px] text-gold-300">{page.tamilTitle}</p>}
              {page.summary && <p className="mx-auto mt-3 max-w-2xl text-[15px] text-[#f7e7c4]">{page.summary}</p>}
            </Reveal>
          </div>
        </section>
      )}

      {hasBody && (
        <section className="bg-white">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:py-14">
            {/* Sanitised server-side when the page is saved — see SSD-Backend controllers/cms/sanitize-content.js. */}
            {page.content && <div className="portal-prose" dangerouslySetInnerHTML={{ __html: page.content }} />}
            {page.tamilContent && (
              <div className={`portal-prose ${page.content ? "mt-10 border-t border-gold-500/25 pt-8" : ""}`} lang="ta" dangerouslySetInnerHTML={{ __html: page.tamilContent }} />
            )}
          </div>
        </section>
      )}

      <PortalSections sections={page.sections} />
    </>
  );
}
